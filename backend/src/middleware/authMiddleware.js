const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-prod';

const getCookie = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return null;
    const parts = header.split(';').map((part) => part.trim());
    for (const part of parts) {
        const [key, ...valueParts] = part.split('=');
        if (key === name) {
            return decodeURIComponent(valueParts.join('='));
        }
    }
    return null;
};

const getSingerSession = (req) => {
    const token = getCookie(req, 'singer_session');
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
};

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token.' });
        }
        req.user = user;
        next();
    });
};

// Middleware to authenticate either host token or singer session cookie
const authenticateTokenOrSinger = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        return jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid token.' });
            }
            req.user = user;
            next();
        });
    }

    const session = getSingerSession(req);
    if (!session) {
        return res.status(401).json({ error: 'Access denied. No session provided.' });
    }
    req.singerSession = session;
    next();
};

// Middleware to restrict access to specific roles
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }

        next();
    };
};

module.exports = {
    authenticateToken,
    authenticateTokenOrSinger,
    getSingerSession,
    requireRole
};
