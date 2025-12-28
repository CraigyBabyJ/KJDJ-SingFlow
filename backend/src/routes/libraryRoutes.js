const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const libraryService = require('../services/libraryService');
const { authenticateToken, authenticateTokenOrSinger, requireRole } = require('../middleware/authMiddleware');

const DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'your-secret-key-change-this-in-prod';
const DOWNLOAD_TOKEN_TTL_SECONDS = parseInt(process.env.DOWNLOAD_TOKEN_TTL || '60', 10);
const DOWNLOAD_RATE_LIMIT = parseInt(process.env.DOWNLOAD_RATE_LIMIT || '30', 10);
const RATE_WINDOW_MS = 60 * 1000;

const downloadRateLimiter = new Map();

const createDownloadToken = (userId, songId) => {
    const issuedAt = Date.now();
    const payload = `${userId}:${songId}:${issuedAt}`;
    const signature = crypto.createHmac('sha256', DOWNLOAD_TOKEN_SECRET).update(payload).digest('hex');
    return `${issuedAt}.${signature}`;
};

const verifyDownloadToken = (token = '', userId, songId) => {
    const [issuedAtStr, signature] = token.split('.');
    const issuedAt = parseInt(issuedAtStr, 10);
    if (!issuedAt || !signature) return false;
    if ((Date.now() - issuedAt) > DOWNLOAD_TOKEN_TTL_SECONDS * 1000) {
        return false;
    }
    const payload = `${userId}:${songId}:${issuedAt}`;
    const expected = crypto.createHmac('sha256', DOWNLOAD_TOKEN_SECRET).update(payload).digest('hex');
    const safeExpected = Buffer.from(expected);
    const safeSignature = Buffer.from(signature);
    if (safeExpected.length !== safeSignature.length) return false;
    return crypto.timingSafeEqual(safeExpected, safeSignature);
};

const checkRateLimit = (userId) => {
    if (!userId) return true;
    const now = Date.now();
    let entry = downloadRateLimiter.get(userId);
    if (!entry || (now - entry.start) > RATE_WINDOW_MS) {
        entry = { start: now, count: 0 };
        downloadRateLimiter.set(userId, entry);
    }
    if (entry.count >= DOWNLOAD_RATE_LIMIT) {
        return false;
    }
    entry.count += 1;
    return true;
};

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

// POST /api/library/songs/:id/authorize
// Issues a short-lived download token for hosts/admins
router.post('/songs/:id/authorize', authenticateToken, requireRole(['admin', 'HOST', 'host']), (req, res) => {
    try {
        const token = createDownloadToken(req.user.id, req.params.id);
        res.json({
            token,
            expiresAt: Date.now() + (DOWNLOAD_TOKEN_TTL_SECONDS * 1000)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

        if (!checkRateLimit(req.user.id)) {
            return res.status(429).json({ error: 'Download rate limit exceeded. Please wait a moment and try again.' });
        }

        const downloadToken = req.query.token || req.headers['x-kjdj-download'];
        if (!verifyDownloadToken(downloadToken, req.user.id, req.params.id)) {
            return res.status(403).json({ error: 'Invalid or expired download token' });
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
        
        res.set({
            'Cache-Control': 'no-store, private',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Robots-Tag': 'noindex'
        });

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
