const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getSingerSession } = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-prod';

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const normalizeDisplayName = (name = '') => name.trim().replace(/\s+/g, ' ');
const normalizeDisplayNameKey = (name = '') => normalizeDisplayName(name).toLowerCase();

const buildSuggestions = async (hostId, displayName) => {
    const normalized = normalizeDisplayName(displayName);
    const parts = normalized.split(' ').filter(Boolean);
    const base = parts[0] || normalized || 'Singer';
    const initial = parts.length > 1 ? parts[1][0]?.toUpperCase() : 'H';
    const candidates = [
        `${base} ${initial}`.trim(),
        `${base} ${initial}2`.trim(),
        `${base} ${initial}3`.trim(),
    ].filter(Boolean);

    if (candidates.length === 0) return [];

    const placeholders = candidates.map(() => '?').join(', ');
    const existing = await dbAll(
        `SELECT displayName_norm FROM singers WHERE host_id = ? AND active = 1 AND displayName_norm IN (${placeholders})`,
        [hostId, ...candidates.map(normalizeDisplayNameKey)]
    );
    const existingSet = new Set(existing.map(row => row.displayName_norm));
    return candidates.filter(name => !existingSet.has(normalizeDisplayNameKey(name)));
};

const getHostByToken = async (token) => {
    if (!token) return null;
    return dbGet(
        "SELECT id, username FROM users WHERE invite_token = ? AND (role = 'HOST' OR role = 'admin')",
        [token]
    );
};

router.get('/session', async (req, res) => {
    try {
        const session = getSingerSession(req);
        if (!session) {
            return res.status(401).json({ error: 'No active singer session' });
        }

        const singer = await dbGet(
            `SELECT s.id, s.name, s.host_id, s.active, u.username as host_name
             FROM singers s
             JOIN users u ON s.host_id = u.id
             WHERE s.id = ? AND s.host_id = ?`,
            [session.singer_id, session.host_id]
        );

        if (!singer || !singer.active) {
            res.clearCookie('singer_session', { httpOnly: true, sameSite: 'lax' });
            return res.status(401).json({ error: 'Invalid singer session' });
        }

        res.json({
            singerId: singer.id,
            hostId: singer.host_id,
            displayName: singer.name,
            hostName: singer.host_name
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/end', async (req, res) => {
    try {
        const session = getSingerSession(req);
        if (!session) {
            return res.status(401).json({ error: 'No active singer session' });
        }

        await dbRun("BEGIN TRANSACTION");
        await dbRun(
            "DELETE FROM queue_entries WHERE singer_id = ? AND host_id = ? AND status = 'queued'",
            [session.singer_id, session.host_id]
        );
        await dbRun(
            "UPDATE singers SET active = 0 WHERE id = ? AND host_id = ?",
            [session.singer_id, session.host_id]
        );
        await dbRun("COMMIT");

        res.clearCookie('singer_session', { httpOnly: true, sameSite: 'lax' });
        res.json({ message: 'Singer session ended' });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: err.message });
    }
});

router.get('/:token', async (req, res) => {
    try {
        const host = await getHostByToken(req.params.token);
        if (!host) {
            return res.status(404).json({ active: false, error: 'Invite not found' });
        }
        res.json({ active: true, hostName: host.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:token', async (req, res) => {
    try {
        const { displayName } = req.body;
        if (!displayName || !displayName.trim()) {
            return res.status(400).json({ error: 'Display name is required' });
        }

        const host = await getHostByToken(req.params.token);
        if (!host) {
            return res.status(404).json({ error: 'Invite not found' });
        }

        const normalized = normalizeDisplayName(displayName);
        const displayNameNorm = normalizeDisplayNameKey(displayName);

        const existing = await dbGet(
            "SELECT id FROM singers WHERE host_id = ? AND displayName_norm = ? AND active = 1",
            [host.id, displayNameNorm]
        );
        if (existing) {
            const suggestions = await buildSuggestions(host.id, normalized);
            return res.status(409).json({ error: 'Name already in use', suggestions });
        }

        const inactive = await dbGet(
            "SELECT id FROM singers WHERE host_id = ? AND displayName_norm = ? AND active = 0",
            [host.id, displayNameNorm]
        );

        let singerId = null;
        if (inactive) {
            await dbRun(
                "UPDATE singers SET name = ?, displayName_norm = ?, active = 1 WHERE id = ? AND host_id = ?",
                [normalized, displayNameNorm, inactive.id, host.id]
            );
            singerId = inactive.id;
        } else {
            const result = await dbRun(
                "INSERT INTO singers (name, displayName_norm, host_id, active) VALUES (?, ?, ?, 1)",
                [normalized, displayNameNorm, host.id]
            );
            singerId = result.lastID;
        }

        const sessionToken = jwt.sign(
            { singer_id: singerId, host_id: host.id, displayName: normalized },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.cookie('singer_session', sessionToken, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 30
        });

        res.json({ message: 'Joined successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
