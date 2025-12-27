const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const libraryRoutes = require('./routes/libraryRoutes');
const authRoutes = require('./routes/authRoutes');
const joinRoutes = require('./routes/joinRoutes');
const queueRoutes = require('./routes/queueRoutes');
const singerRoutes = require('./routes/singerRoutes');
const playbackRoutes = require('./routes/playbackRoutes');
const rotationRoutes = require('./routes/rotationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/join', joinRoutes);
app.use('/join', joinRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/singers', singerRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/rotation', rotationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/youtube', youtubeRoutes);

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'KJDJ Backend is running' });
});

// Placeholder for configuration route
app.get('/api/config', (req, res) => {
    res.json({
        mediaPath: process.env.KARAOKE_MEDIA_PATH
    });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`KJDJ Backend listening on port ${port}`);
  console.log(`Media Path configured to: ${process.env.KARAOKE_MEDIA_PATH}`);
});
