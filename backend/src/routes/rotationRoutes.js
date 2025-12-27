const express = require('express');
const router = express.Router();
const rotationService = require('../services/rotationService');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// GET /api/rotation/next
router.get('/next', authenticateToken, async (req, res) => {
    try {
        let hostId = req.query.hostId;
        if (req.user.role === 'HOST') hostId = req.user.id;
        
        const rotationEnabled = await rotationService.getRotationEnabled();
        const next = await rotationService.getNextSelection(hostId, rotationEnabled);
        if (!next) {
            return res.json({ message: 'No upcoming selection', selection: null });
        }
        res.json({ selection: next });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rotation/upcoming
router.get('/upcoming', authenticateToken, async (req, res) => {
    try {
        let hostId = req.query.hostId;
        if (req.user.role === 'HOST') hostId = req.user.id;

        const rotationEnabled = await rotationService.getRotationEnabled();
        const upcoming = await rotationService.getUpcomingRotation(hostId, 5, rotationEnabled);
        res.json(upcoming);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rotation/settings
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const rotationEnabled = await rotationService.getRotationEnabled();
        res.json({ rotationEnabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/rotation/settings (HOST/Admin only)
router.patch('/settings', authenticateToken, requireRole(['HOST', 'admin']), async (req, res) => {
    const { rotationEnabled } = req.body;
    if (typeof rotationEnabled !== 'boolean') {
        return res.status(400).json({ error: 'rotationEnabled must be a boolean' });
    }
    try {
        await rotationService.setRotationEnabled(rotationEnabled);
        res.json({ rotationEnabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
