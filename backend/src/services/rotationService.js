const db = require('../db');

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

const getRotationEnabled = async () => {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'rotation_enabled'");
    if (!row || row.value === null || row.value === undefined) return true;
    return row.value === 'true';
};

const setRotationEnabled = async (enabled) => {
    await dbRun(
        "INSERT INTO settings (key, value) VALUES ('rotation_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [enabled ? 'true' : 'false']
    );
};

// Get Next Singer/Song to Play
const getNextSelection = async (hostId, rotationEnabled = true) => {
    if (!rotationEnabled) {
        let sql = `
            SELECT q.id as queue_id, q.song_id, so.title, so.artist, so.file_path, so.media_type, q.singer_id, s.name as singer_name
            FROM queue_entries q
            JOIN songs so ON q.song_id = so.id
            JOIN singers s ON q.singer_id = s.id
            WHERE q.status = 'queued'
        `;
        const params = [];
        if (hostId) {
            sql += ` AND q.host_id = ?`;
            params.push(hostId);
        }
        sql += ` ORDER BY q.position ASC, q.created_at ASC LIMIT 1`;
        return await dbGet(sql, params);
    }

    // 1. Find eligible singers (in_rotation = 1) who have queued songs
    // Ordered by rotation_index ASC
    let sqlSingers = `
        SELECT DISTINCT s.id, s.name, s.rotation_index
        FROM singers s
        JOIN queue_entries q ON s.id = q.singer_id
        WHERE s.in_rotation = 1 AND s.active = 1 AND q.status = 'queued'
    `;

    const params = [];
    if (hostId) {
        sqlSingers += ` AND s.host_id = ?`;
        params.push(hostId);
    }

    sqlSingers += ` ORDER BY s.rotation_index ASC, s.id ASC LIMIT 1`;
    
    const singer = await dbGet(sqlSingers, params);
    
    if (!singer) {
        return null;
    }

    // 2. Select their earliest queued song
    let sqlSong = `
        SELECT q.id as queue_id, q.song_id, so.title, so.artist, so.file_path, so.media_type, q.singer_id, s.name as singer_name
        FROM queue_entries q
        JOIN songs so ON q.song_id = so.id
        JOIN singers s ON q.singer_id = s.id
        WHERE q.singer_id = ? AND q.status = 'queued'
    `;
    const songParams = [singer.id];

    if (hostId) {
        sqlSong += ` AND q.host_id = ?`;
        songParams.push(hostId);
    }

    sqlSong += ` ORDER BY q.position ASC, q.created_at ASC LIMIT 1`;

    const selection = await dbGet(sqlSong, songParams);
    return selection;
};

// Get Upcoming Rotation (List of singers + their next song)
const getUpcomingRotation = async (hostId, limit = 5, rotationEnabled = true) => {
    if (!rotationEnabled) {
        let sql = `
            SELECT q.id as queue_id, q.song_id, so.title, so.artist, so.media_type, q.singer_id, s.name as singer_name
            FROM queue_entries q
            JOIN songs so ON q.song_id = so.id
            JOIN singers s ON q.singer_id = s.id
            WHERE q.status = 'queued'
        `;
        const params = [];
        if (hostId) {
            sql += ` AND q.host_id = ?`;
            params.push(hostId);
        }
        sql += ` ORDER BY q.position ASC, q.created_at ASC LIMIT ?`;
        params.push(limit);
        return await dbAll(sql, params);
    }

    // 1. Find eligible singers (in_rotation = 1) who have queued songs
    let sqlSingers = `
        SELECT DISTINCT s.id, s.name, s.rotation_index
        FROM singers s
        JOIN queue_entries q ON s.id = q.singer_id
        WHERE s.in_rotation = 1 AND s.active = 1 AND q.status = 'queued'
    `;

    const params = [];
    if (hostId) {
        sqlSingers += ` AND s.host_id = ?`;
        params.push(hostId);
    }
    
    sqlSingers += ` ORDER BY s.rotation_index ASC, s.id ASC LIMIT ?`;
    params.push(limit);
    
    const singers = await dbAll(sqlSingers, params);
    
    // 2. For each singer, get their next song
    const results = [];
    for (const singer of singers) {
        let sqlSong = `
            SELECT q.id as queue_id, q.song_id, so.title, so.artist, so.media_type, q.singer_id, s.name as singer_name
            FROM queue_entries q
            JOIN songs so ON q.song_id = so.id
            JOIN singers s ON q.singer_id = s.id
            WHERE q.singer_id = ? AND q.status = 'queued'
        `;
        const songParams = [singer.id];

        if (hostId) {
            sqlSong += ` AND q.host_id = ?`;
            songParams.push(hostId);
        }

        sqlSong += ` ORDER BY q.position ASC, q.created_at ASC LIMIT 1`;

        const song = await dbGet(sqlSong, songParams);
        if (song) {
            results.push(song);
        }
    }
    return results;
};

// Start Playback (Mark as playing)
const startPlayback = async (queueId) => {
    await dbRun(
        "UPDATE queue_entries SET status = 'playing', started_at = CURRENT_TIMESTAMP WHERE id = ?", 
        [queueId]
    );
};

// Mark Done / Skipped
// Updates history and rotates singer
const completeEntry = async (queueId, status = 'done') => {
    // Get entry info first
    const entry = await dbGet("SELECT * FROM queue_entries WHERE id = ?", [queueId]);
    if (!entry) return;

    await dbRun("BEGIN TRANSACTION");
    try {
        // 1. Mark entry
        await dbRun(
            "UPDATE queue_entries SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            [status, queueId]
        );

        // 2. Add to history if done
        if (status === 'done') {
            await dbRun(
                "INSERT INTO singer_history (singer_id, song_id, performed_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                [entry.singer_id, entry.song_id]
            );
        }

        // 3. Rotate Singer
        // Move to bottom of rotation: set rotation_index = max(rotation_index) + 1
        const maxRotRow = await dbGet("SELECT MAX(rotation_index) as maxIdx FROM singers");
        const nextIdx = (maxRotRow && maxRotRow.maxIdx !== null) ? maxRotRow.maxIdx + 1 : 1;

        await dbRun(
            "UPDATE singers SET rotation_index = ? WHERE id = ?",
            [nextIdx, entry.singer_id]
        );

        await dbRun("COMMIT");
    } catch (err) {
        await dbRun("ROLLBACK");
        throw err;
    }
};

module.exports = {
    getNextSelection,
    getUpcomingRotation,
    startPlayback,
    completeEntry,
    getRotationEnabled,
    setRotationEnabled
};
