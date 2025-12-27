const db = require('../db');

// Helper for Promisified DB calls
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

const normalizeDisplayName = (name = '') => name.trim().replace(/\s+/g, ' ');
const normalizeDisplayNameKey = (name = '') => normalizeDisplayName(name).toLowerCase();

// GET Queue
const getQueue = async (hostId, singerId = null) => {
    let sql = `
        SELECT 
            q.id, 
            q.status, 
            q.created_at,
            q.song_id,
            q.singer_id,
            q.host_id,
            s.name as singer_name, 
            so.artist, 
            so.title,
            so.file_path,
            u.username as requested_by
        FROM queue_entries q
        JOIN singers s ON q.singer_id = s.id
        JOIN songs so ON q.song_id = so.id
        LEFT JOIN users u ON q.requested_by_user_id = u.id
        WHERE q.status = 'queued'
    `;
    
    const params = [];
    if (hostId) {
        // Direct filtering on queue_entries.host_id (Robust Isolation)
        sql += ` AND q.host_id = ?`;
        params.push(hostId);
    }
    if (singerId) {
        sql += ` AND q.singer_id = ?`;
        params.push(singerId);
    }
    
    sql += ` ORDER BY q.position ASC, q.created_at ASC`;
    return await dbAll(sql, params);
};

// ADD to Queue
const addToQueue = async (songId, singerName, singerUserId, requestedByUserId, hostId) => {
    if (!songId || !singerName || !hostId) {
        throw new Error('Song ID, Singer Name, and Host ID are required');
    }

    try {
        await dbRun("BEGIN TRANSACTION");

        // 1. Find or Create Singer (Scoped to Host)
        const normalizedName = normalizeDisplayName(singerName);
        const displayNameNorm = normalizeDisplayNameKey(singerName);
        let singer = await dbGet(
            "SELECT id, user_id, displayName_norm FROM singers WHERE displayName_norm = ? AND host_id = ? AND active = 1",
            [displayNameNorm, hostId]
        );
        let singerId;

        if (singer) {
            singerId = singer.id;
            if (!singer.displayName_norm) {
                await dbRun("UPDATE singers SET displayName_norm = ? WHERE id = ?", [displayNameNorm, singerId]);
            }
            if (!singer.user_id && singerUserId) {
                await dbRun("UPDATE singers SET user_id = ? WHERE id = ?", [singerUserId, singerId]);
            }
        } else {
            const inactive = await dbGet(
                "SELECT id FROM singers WHERE displayName_norm = ? AND host_id = ? AND active = 0",
                [displayNameNorm, hostId]
            );

            if (inactive) {
                singerId = inactive.id;
                await dbRun(
                    "UPDATE singers SET name = ?, displayName_norm = ?, active = 1 WHERE id = ? AND host_id = ?",
                    [normalizedName, displayNameNorm, singerId, hostId]
                );
            } else {
                // New singer scoped to this host
                const result = await dbRun(
                    "INSERT INTO singers (name, displayName_norm, user_id, host_id, active) VALUES (?, ?, ?, ?, 1)",
                    [normalizedName, displayNameNorm, singerUserId || null, hostId]
                );
                singerId = result.lastID;
            }
        }

        // 2. Get Next Position
        // Ideally should be MAX(position) WHERE host_id = ?
        const maxPosRow = await dbGet("SELECT MAX(position) as maxPos FROM queue_entries WHERE host_id = ?", [hostId]);
        const nextPos = (maxPosRow && maxPosRow.maxPos !== null) ? maxPosRow.maxPos + 1 : 1;

        // 3. Add to Queue (Include host_id)
        const result = await dbRun(
            "INSERT INTO queue_entries (singer_id, song_id, host_id, status, position, requested_by_user_id) VALUES (?, ?, ?, 'queued', ?, ?)",
            [singerId, songId, hostId, nextPos, requestedByUserId]
        );

        await dbRun("COMMIT");
        return { queueId: result.lastID, singerId, songId, hostId, status: 'queued', position: nextPos };

    } catch (err) {
        await dbRun("ROLLBACK");
        throw err;
    }
};

// ADD to Queue for Singer Session
const addToQueueForSinger = async (songId, singerId, hostId) => {
    if (!songId || !singerId || !hostId) {
        throw new Error('Song ID, Singer ID, and Host ID are required');
    }

    try {
        await dbRun("BEGIN TRANSACTION");

        const singer = await dbGet("SELECT id FROM singers WHERE id = ? AND host_id = ?", [singerId, hostId]);
        if (!singer) {
            throw new Error('Singer not found for host');
        }

        const maxPosRow = await dbGet("SELECT MAX(position) as maxPos FROM queue_entries WHERE host_id = ?", [hostId]);
        const nextPos = (maxPosRow && maxPosRow.maxPos !== null) ? maxPosRow.maxPos + 1 : 1;

        const result = await dbRun(
            "INSERT INTO queue_entries (singer_id, song_id, host_id, status, position, requested_by_user_id) VALUES (?, ?, ?, 'queued', ?, ?)",
            [singerId, songId, hostId, nextPos, null]
        );

        await dbRun("COMMIT");
        return { queueId: result.lastID, singerId, songId, hostId, status: 'queued', position: nextPos };
    } catch (err) {
        await dbRun("ROLLBACK");
        throw err;
    }
};

// DELETE from Queue
const removeFromQueue = async (queueId, userId, userRole) => {
    // Check permission
    const entry = await dbGet("SELECT requested_by_user_id FROM queue_entries WHERE id = ?", [queueId]);
    if (!entry) return false;

    if (userRole !== 'HOST' && userRole !== 'admin' && entry.requested_by_user_id !== userId) {
        throw new Error('Unauthorized to delete this entry');
    }

    const result = await dbRun("DELETE FROM queue_entries WHERE id = ?", [queueId]);
    return result.changes > 0;
};

module.exports = {
    getQueue,
    addToQueue,
    addToQueueForSinger,
    removeFromQueue
};
