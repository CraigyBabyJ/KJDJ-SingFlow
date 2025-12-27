const express = require('express');
const router = express.Router();
const libraryService = require('../services/libraryService');
const { authenticateToken, authenticateTokenOrSinger, requireRole } = require('../middleware/authMiddleware');

// GET /api/library/status
// Protected: Any logged-in user can check status (or maybe just admin? Prompt says "Logged-out users should NOT see... server songs". Status reveals count, which is harmless, but let's protect it to be safe.)
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const status = await libraryService.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/library/search
// Protected: Any logged-in user (Singer/Admin)
router.get('/search', authenticateTokenOrSinger, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Search query required' });
        }

        const results = await libraryService.searchSongs(query);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/library/refresh
// Protected: Admin or Host
router.post('/refresh', authenticateToken, requireRole(['admin', 'HOST', 'host']), async (req, res) => {
    try {
        // In a real app, check for admin auth here (Done via middleware)
        libraryService.scanLibrary()
            .then(result => {
                console.log('Scan finished successfully via API trigger');
            })
            .catch(err => {
                console.error('Scan failed:', err);
            });

        // Respond immediately that scan started
        res.json({ message: 'Library scan started' });
    } catch (error) {
        if (error.message === 'Scan already in progress') {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// GET /api/library/songs/:id/download
// Protected: HOST/Admin only (singers forbidden)
router.get('/songs/:id/download', authenticateTokenOrSinger, async (req, res) => {
    try {
        if (req.singerSession) {
            console.warn('[SECURITY] Singer download attempt', {
                route: '/api/library/songs/:id/download',
                hostId: req.singerSession.host_id,
                singerName: req.singerSession.displayName || null
            });
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (!req.user || !['admin', 'HOST', 'host'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = req.params.id;
        const song = await libraryService.getSongById(id);
        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const fullPath = await libraryService.getSongFullPath(id);
        if (!fullPath) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        // res.download automatically handles content-disposition and headers
        res.download(fullPath, (err) => {
            if (err) {
                // Handle error, but don't send response if headers already sent
                if (!res.headersSent) {
                    // Check if file missing
                    if (err.code === 'ENOENT') {
                        res.status(404).json({ error: 'File not found on server' });
                    } else {
                        res.status(500).json({ error: 'Error downloading file' });
                    }
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
