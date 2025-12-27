const express = require('express');
const router = express.Router();
const rotationService = require('../services/rotationService');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// POST /api/playback/load-next (HOST-only)
router.post('/load-next', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    try {
        const hostId = req.user.id; // Host ID is the user ID for HOST role
        const rotationEnabled = await rotationService.getRotationEnabled();
        const next = await rotationService.getNextSelection(hostId, rotationEnabled);
        if (!next) {
            return res.status(404).json({ message: 'No more singers in queue' });
        }
        
        await rotationService.startPlayback(next.queue_id);
        res.json(next); // Returns { queue_id, song_id, title, artist, file_path, singer_id, singer_name }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
