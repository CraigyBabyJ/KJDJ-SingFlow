const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-prod';
const HOST_INVITE_CODE = process.env.HOST_INVITE_CODE || '6969';
const generateInviteToken = () => crypto.randomBytes(12).toString('hex');

// Helper to run DB queries
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

// GET /api/auth/hosts
router.get('/hosts', async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all("SELECT id, username FROM users WHERE role = 'HOST' OR role = 'admin'", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/register
// Allow creating initial users. In production, this might be restricted.
router.post('/register', async (req, res) => {
    const { username, password, role, inviteCode } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Default role is 'singer', but allow 'admin' or 'HOST' if specified (for setup)
    let userRole = 'singer';
    if (role === 'admin') userRole = 'admin';
    if (role === 'HOST') userRole = 'HOST';

    if (userRole === 'HOST' || userRole === 'admin') {
        if (!inviteCode || inviteCode !== HOST_INVITE_CODE) {
            return res.status(403).json({ error: 'Invalid invite code' });
        }
    }

    try {
        // Check if user exists
        const existingUser = await dbGet("SELECT id FROM users WHERE username = ?", [username]);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user
        const inviteToken = (userRole === 'HOST' || userRole === 'admin') ? generateInviteToken() : null;
        const result = await dbRun(
            "INSERT INTO users (username, password_hash, role, invite_token) VALUES (?, ?, ?, ?)",
            [username, hashedPassword, userRole, inviteToken]
        );

        res.status(201).json({ message: 'User created successfully', userId: result.lastID });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = await dbGet("SELECT * FROM users WHERE username = ?", [username]);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await dbRun("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                invite_token: user.invite_token || null
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await dbGet("SELECT id, username, role, invite_token FROM users WHERE id = ?", [req.user.id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
