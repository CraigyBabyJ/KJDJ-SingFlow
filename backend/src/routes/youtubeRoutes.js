const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const youtubeImportService = require('../services/youtubeImportService');

router.post('/import', authenticateToken, requireRole(['admin', 'HOST', 'host']), async (req, res) => {
    try {
        const { url } = req.body || {};
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL required' });
        }
        const jobId = await youtubeImportService.startImport(url.trim());
        res.json({ jobId });
    } catch (error) {
        if (error.code === 'IMPORT_RUNNING') {
            return res.status(409).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

router.get('/import/:jobId', authenticateToken, requireRole(['admin', 'HOST', 'host']), async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await youtubeImportService.getJobStatus(jobId);
        if (!result) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const { job, song } = result;
        res.json({
            status: job.status,
            progress: job.progress ?? 0,
            message: job.message || '',
            songId: job.song_id || null,
            song
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
