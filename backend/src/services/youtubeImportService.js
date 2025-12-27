const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('../db');

const YOUTUBE_DIR_NAME = '#Youtube Karaoke Downloads';
const ACTIVE_STATUSES = ['queued', 'downloading', 'processing'];

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

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getLibraryRoot = () => {
    const root = process.env.LIB_ROOT || process.env.KARAOKE_MEDIA_PATH;
    if (!root) {
        throw new Error('Library root not configured (LIB_ROOT or KARAOKE_MEDIA_PATH).');
    }
    return root;
};

let ensuredCookiesFile = false;
const getYtDlpCookieArgs = () => {
    const cookiesFile = process.env.YTDLP_COOKIES_FILE;
    if (!cookiesFile) return [];
    if (!ensuredCookiesFile) {
        try {
            fs.accessSync(cookiesFile, fs.constants.R_OK);
        } catch (err) {
            throw new Error(`YTDLP_COOKIES_FILE is not readable: ${cookiesFile}`);
        }
        ensuredCookiesFile = true;
    }
    return ['--cookies', cookiesFile];
};

const getYtDlpBinary = () => {
    const binary = process.env.YTDLP_BIN || 'yt-dlp';
    if (process.env.YTDLP_BIN) {
        try {
            fs.accessSync(binary, fs.constants.X_OK);
        } catch (err) {
            throw new Error(`YTDLP_BIN is not executable: ${binary}`);
        }
    }
    return binary;
};

const getYouTubeId = (rawUrl) => {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        if (host === 'youtu.be') {
            return url.pathname.replace('/', '').trim() || null;
        }
        if (host.endsWith('youtube.com')) {
            if (url.pathname.startsWith('/watch')) {
                return url.searchParams.get('v');
            }
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] === 'shorts' || parts[0] === 'embed') {
                return parts[1] || null;
            }
        }
    } catch (err) {
        return null;
    }
    return null;
};

const sanitizeTitle = (title) => {
    const cleaned = (title || '')
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[ .]+$/g, '');

    if (!cleaned) {
        return 'YouTube Video';
    }
    if (cleaned.length > 160) {
        return cleaned.slice(0, 160).trim();
    }
    return cleaned;
};

const buildBaseName = (title, videoId) => {
    const safeTitle = sanitizeTitle(title);
    return `${safeTitle} [YT-${videoId}]`;
};

let ensuredSongColumns = false;
const ensureSongColumns = async () => {
    if (ensuredSongColumns) return;
    const columns = await dbAll("PRAGMA table_info(songs)");
    const colNames = columns.map((col) => col.name);
    if (!colNames.includes('source')) {
        await dbRun("ALTER TABLE songs ADD COLUMN source TEXT");
    }
    if (!colNames.includes('video_id')) {
        await dbRun("ALTER TABLE songs ADD COLUMN video_id TEXT");
    }
    if (!colNames.includes('duration')) {
        await dbRun("ALTER TABLE songs ADD COLUMN duration INTEGER");
    }
    await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_video_id ON songs(video_id)");
    ensuredSongColumns = true;
};

const updateJob = async (jobId, fields) => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = keys.map(key => `${key} = ?`).join(', ');
    const values = keys.map(key => fields[key]);
    await dbRun(
        `UPDATE youtube_import_jobs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
        [...values, jobId]
    );
};

const fetchMetadata = (url) => {
    return new Promise((resolve, reject) => {
        const args = [
            '--skip-download',
            '--no-playlist',
            ...getYtDlpCookieArgs(),
            '--print',
            '%(id)s||%(title)s||%(uploader)s||%(duration)s',
            url
        ];
        const proc = spawn(getYtDlpBinary(), args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(stderr.trim() || 'yt-dlp metadata failed'));
            }
            const line = stdout.trim().split('\n').pop();
            const [id, title, uploader, durationRaw] = (line || '').split('||');
            if (!id || !title) {
                return reject(new Error('yt-dlp metadata missing'));
            }
            const duration = Number.parseInt(durationRaw, 10);
            resolve({
                id,
                title,
                uploader: uploader || 'YouTube',
                duration: Number.isFinite(duration) ? duration : null
            });
        });
    });
};

const downloadVideo = (url, outputTemplate, onProgress) => {
    return new Promise((resolve, reject) => {
        const args = [
            '--no-playlist',
            ...getYtDlpCookieArgs(),
            '-f', 'bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4',
            '-o', outputTemplate,
            url
        ];
        const proc = spawn(getYtDlpBinary(), args);
        let stderr = '';
        let lastProgress = -1;

        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            const match = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);
            if (match) {
                const progress = Math.min(99, Math.floor(Number.parseFloat(match[1])));
                if (progress !== lastProgress) {
                    lastProgress = progress;
                    onProgress?.(progress, `Downloading (${progress}%)`);
                }
            }
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(stderr.trim() || 'yt-dlp download failed'));
            }
            resolve();
        });
    });
};

const insertSong = async ({ artist, title, filePath, size, mtime, duration, videoId }) => {
    const existing = await dbGet("SELECT id FROM songs WHERE file_path = ?", [filePath]);
    if (existing) {
        await dbRun(
            `UPDATE songs
             SET artist = ?, title = ?, size = ?, mtime = ?, media_type = 'mp4', active = 1,
                 source = 'youtube', video_id = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [artist, title, size, mtime, videoId, duration, existing.id]
        );
        return existing.id;
    }
    const result = await dbRun(
        `INSERT INTO songs (artist, title, file_path, size, mtime, media_type, active, source, video_id, duration)
         VALUES (?, ?, ?, ?, ?, 'mp4', 1, 'youtube', ?, ?)`,
        [artist, title, filePath, size, mtime, videoId, duration]
    );
    return result.lastID;
};

const runImportJob = async (jobId, url, initialVideoId) => {
    try {
        await ensureSongColumns();
        await updateJob(jobId, { status: 'downloading', progress: 0, message: 'Fetching metadata' });
        const meta = await fetchMetadata(url);
        const videoId = meta.id || initialVideoId;
        const existingSong = await dbGet("SELECT id FROM songs WHERE video_id = ? AND active = 1", [videoId]);
        if (existingSong) {
            await updateJob(jobId, {
                status: 'done',
                progress: 100,
                message: 'Already imported',
                song_id: existingSong.id
            });
            return;
        }

        const libraryRoot = getLibraryRoot();
        const targetDir = path.join(libraryRoot, YOUTUBE_DIR_NAME);
        await fs.promises.mkdir(targetDir, { recursive: true });

        const baseName = buildBaseName(meta.title, videoId);
        const outputTemplate = path.join(targetDir, `${baseName}.%(ext)s`);
        const targetFullPath = path.join(targetDir, `${baseName}.mp4`);
        const relativePath = path.join(YOUTUBE_DIR_NAME, `${baseName}.mp4`);

        await updateJob(jobId, { target_path: relativePath });

        if (fs.existsSync(targetFullPath)) {
            const stats = await fs.promises.stat(targetFullPath);
            const songId = await insertSong({
                artist: meta.uploader || 'YouTube',
                title: meta.title,
                filePath: relativePath,
                size: stats.size,
                mtime: Math.floor(stats.mtimeMs),
                duration: meta.duration,
                videoId
            });
            await updateJob(jobId, {
                status: 'done',
                progress: 100,
                message: 'Existing file added to library',
                song_id: songId
            });
            return;
        }

        await updateJob(jobId, { status: 'downloading', progress: 0, message: 'Downloading' });
        await downloadVideo(url, outputTemplate, async (progress, message) => {
            await updateJob(jobId, { progress, message });
        });

        await updateJob(jobId, { status: 'processing', progress: 99, message: 'Adding to library' });

        const stats = await fs.promises.stat(targetFullPath);
        const songId = await insertSong({
            artist: meta.uploader || 'YouTube',
            title: meta.title,
            filePath: relativePath,
            size: stats.size,
            mtime: Math.floor(stats.mtimeMs),
            duration: meta.duration,
            videoId
        });

        await updateJob(jobId, { status: 'done', progress: 100, message: 'Added to library', song_id: songId });
    } catch (err) {
        await updateJob(jobId, { status: 'error', message: err.message || 'Import failed' });
    }
};

const startImport = async (url) => {
    const videoId = getYouTubeId(url);
    if (!videoId) {
        throw new Error('Invalid YouTube URL');
    }

    await ensureSongColumns();
    const activeJob = await dbGet(
        `SELECT job_id FROM youtube_import_jobs WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
        ACTIVE_STATUSES
    );
    if (activeJob) {
        const err = new Error('Another import is already running');
        err.code = 'IMPORT_RUNNING';
        throw err;
    }

    const existingSong = await dbGet("SELECT id FROM songs WHERE video_id = ? AND active = 1", [videoId]);
    const jobId = crypto.randomUUID();
    if (existingSong) {
        await dbRun(
            `INSERT INTO youtube_import_jobs (job_id, status, progress, message, url, video_id, song_id)
             VALUES (?, 'done', 100, 'Already imported', ?, ?, ?)`,
            [jobId, url, videoId, existingSong.id]
        );
        return jobId;
    }

    await dbRun(
        `INSERT INTO youtube_import_jobs (job_id, status, progress, message, url, video_id)
         VALUES (?, 'queued', 0, 'Queued', ?, ?)`,
        [jobId, url, videoId]
    );

    runImportJob(jobId, url, videoId);
    return jobId;
};

const getJobStatus = async (jobId) => {
    const job = await dbGet("SELECT * FROM youtube_import_jobs WHERE job_id = ?", [jobId]);
    if (!job) return null;
    let song = null;
    if (job.song_id) {
        song = await dbGet("SELECT * FROM songs WHERE id = ?", [job.song_id]);
    }
    return { job, song };
};

module.exports = {
    startImport,
    getJobStatus
};
