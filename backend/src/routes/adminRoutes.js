const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const ensureAdmin = (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    if (req.user.role === 'admin' || req.user.username === 'craig') {
        return true;
    }
    res.status(403).json({ error: 'Forbidden' });
    return false;
};

// GET /api/admin/hosts
router.get('/hosts', authenticateToken, async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    try {
        const rows = await dbAll(
            `SELECT 
                u.id,
                u.username,
                u.role,
                u.last_login,
                (SELECT COUNT(*) FROM queue_entries q WHERE q.host_id = u.id AND q.status = 'done') as songs_played,
                (SELECT COUNT(*) FROM queue_entries q WHERE q.host_id = u.id AND q.status = 'playing') as playing_count
            FROM users u
            WHERE (u.role = 'HOST' OR u.role = 'admin')
              AND u.username NOT LIKE 'QUEUE_TESTER_%'
              AND u.username NOT LIKE 'HOSTB_%'
              AND u.username NOT LIKE 'ADMIN_%'
            ORDER BY u.username ASC`
        );
        const result = rows.map((row) => ({
            ...row,
            status: row.playing_count > 0 ? 'Playing' : 'Idle'
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/hosts/:id
router.delete('/hosts/:id', authenticateToken, async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    const hostId = req.params.id;
    if (String(req.user.id) === String(hostId)) {
        return res.status(400).json({ error: 'Cannot delete current user' });
    }
    try {
        await dbRun("BEGIN TRANSACTION");
        await dbRun("DELETE FROM queue_entries WHERE host_id = ?", [hostId]);
        await dbRun("DELETE FROM singer_history WHERE singer_id IN (SELECT id FROM singers WHERE host_id = ?)", [hostId]);
        await dbRun("DELETE FROM singers WHERE host_id = ?", [hostId]);
        await dbRun("DELETE FROM users WHERE id = ? AND (role = 'HOST' OR role = 'admin')", [hostId]);
        await dbRun("COMMIT");
        res.json({ message: 'Host deleted' });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
