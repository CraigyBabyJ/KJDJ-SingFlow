const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Helper for Promisified DB calls
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
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

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// GET /api/singers
// List all singers (Filtered by Host)
router.get('/', authenticateToken, async (req, res) => {
    try {
        let sql = "SELECT * FROM singers WHERE active = 1";
        const params = [];
        
        // If Host/Admin, filter by their ID
        if (req.user.role === 'HOST' || req.user.role === 'admin') {
            sql += " AND host_id = ?";
            params.push(req.user.id);
        } else {
            // SINGERs shouldn't really be seeing this list, but if they do (e.g. autocomplete?), 
            // we'd need a hostId param. For now, leave empty or error?
            // "NO singer dropdown" requirement suggests they don't use this.
            // But if they did, we'd need ?hostId=...
            if (req.query.hostId) {
                sql += " AND host_id = ?";
                params.push(req.query.hostId);
            }
        }
        
        sql += " ORDER BY rotation_index ASC";
        
        const singers = await dbAll(sql, params);
        res.json(singers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/singers/reorder (HOST-only)
// Body: { singerIds: [id1, id2, ...] }
router.patch('/reorder', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    const { singerIds } = req.body;
    if (!Array.isArray(singerIds)) {
        return res.status(400).json({ error: 'singerIds must be an array' });
    }

    try {
        await dbRun("BEGIN TRANSACTION");
        for (let i = 0; i < singerIds.length; i++) {
            // Strictly scope reorder to the host's own singers
            await dbRun("UPDATE singers SET rotation_index = ? WHERE id = ? AND host_id = ?", [i + 1, singerIds[i], req.user.id]);
        }
        await dbRun("COMMIT");
        res.json({ message: 'Singers reordered successfully' });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/singers/:id (HOST-only, toggle inRotation)
// Body: { inRotation: boolean }
router.patch('/:id', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    const { inRotation } = req.body;
    if (typeof inRotation !== 'boolean') {
        return res.status(400).json({ error: 'inRotation must be a boolean' });
    }

    try {
        // Strictly scope update to host's own singers
        const result = await dbRun("UPDATE singers SET in_rotation = ? WHERE id = ? AND host_id = ?", [inRotation, req.params.id, req.user.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Singer not found or unauthorized' });
        }
        res.json({ message: 'Singer updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/singers/:id (HOST-only)
// Removes singer, queued songs, and history for that singer
router.delete('/:id', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    const singerId = req.params.id;
    try {
        const singer = await dbGet("SELECT id FROM singers WHERE id = ? AND host_id = ?", [singerId, req.user.id]);
        if (!singer) {
            return res.status(404).json({ error: 'Singer not found or unauthorized' });
        }

        await dbRun("BEGIN TRANSACTION");
        await dbRun("DELETE FROM queue_entries WHERE singer_id = ? AND host_id = ?", [singerId, req.user.id]);
        await dbRun("DELETE FROM singer_history WHERE singer_id = ?", [singerId]);
        await dbRun("DELETE FROM singers WHERE id = ? AND host_id = ?", [singerId, req.user.id]);
        await dbRun("COMMIT");
        res.json({ message: 'Singer deleted' });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: err.message });
    }
});

// GET /api/singers/:id/history
router.get('/:id/history', authenticateToken, async (req, res) => {
    try {
        const history = await dbAll(`
            SELECT h.*, s.title, s.artist 
            FROM singer_history h
            JOIN songs s ON h.song_id = s.id
            WHERE h.singer_id = ?
            ORDER BY h.performed_at DESC
        `, [req.params.id]);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
