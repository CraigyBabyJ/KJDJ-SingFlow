const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const rotationService = require('../services/rotationService');
const { authenticateToken, authenticateTokenOrSinger, requireRole } = require('../middleware/authMiddleware');
const db = require('../db');

// Helper for Promisified DB calls (duplicated, should ideally be shared)
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// GET /api/queue
// Protected: Any logged-in user can view the queue
// Filters by hostId (optional for Singer, mandatory for Host context)
router.get('/', authenticateTokenOrSinger, async (req, res) => {
    try {
        let hostId = req.query.hostId;
        
        // If requester is HOST, they only see their queue
        if (req.user && (req.user.role === 'HOST' || req.user.role === 'admin')) {
            hostId = req.user.id;
            const queue = await queueService.getQueue(hostId);
            return res.json(queue);
        }

        if (req.singerSession) {
            const queue = await queueService.getQueue(req.singerSession.host_id, req.singerSession.singer_id);
            return res.json(queue);
        }

        const queue = await queueService.getQueue(hostId);
        res.json(queue);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/queue
// Protected: Add to queue
// HOST: Can specify singerName. Implies hostId = req.user.id
// SINGER: singerName forced to username. MUST specify hostId.
router.post('/', authenticateTokenOrSinger, async (req, res) => {
    try {
        let { songId, singerName, hostId } = req.body;
        
        // Role enforcement
        if (req.user && (req.user.role === 'HOST' || req.user.role === 'admin')) {
            hostId = req.user.id; // Host always queues for themselves
            const result = await queueService.addToQueue(songId, singerName, null, req.user.id, hostId);
            return res.status(201).json(result);
        }

        if (!req.singerSession) {
            return res.status(401).json({ error: 'Singer session required' });
        }

        const result = await queueService.addToQueueForSinger(songId, req.singerSession.singer_id, req.singerSession.host_id);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/queue/:id
// Protected: HOST/Admin or Owner
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const success = await queueService.removeFromQueue(req.params.id, req.user.id, req.user.role);
        if (success) {
            res.json({ message: 'Removed from queue' });
        } else {
            res.status(404).json({ error: 'Queue item not found or unauthorized' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/queue/reorder (HOST-only)
// Body: { queueIds: [id1, id2, ...] }
router.patch('/reorder', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    const { queueIds } = req.body;
    if (!Array.isArray(queueIds)) {
        return res.status(400).json({ error: 'queueIds must be an array' });
    }
    
    try {
        await dbRun("BEGIN TRANSACTION");
        for (let i = 0; i < queueIds.length; i++) {
            // Strictly scope reorder to the host's own queue entries
            await dbRun("UPDATE queue_entries SET position = ? WHERE id = ? AND host_id = ?", [i + 1, queueIds[i], req.user.id]);
        }
        await dbRun("COMMIT");
        res.json({ message: 'Queue reordered' });
    } catch (err) {
        await dbRun("ROLLBACK");
        res.status(500).json({ error: err.message });
    }
});

// POST /api/queue/:id/mark-done (HOST-only)
router.post('/:id/mark-done', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    try {
        await rotationService.completeEntry(req.params.id, 'done');
        res.json({ message: 'Marked as done' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/queue/:id/mark-skipped (HOST-only)
router.post('/:id/mark-skipped', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    try {
        await rotationService.completeEntry(req.params.id, 'skipped');
        res.json({ message: 'Marked as skipped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
