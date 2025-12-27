const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const db = require('../db');

let isScanning = false;
let scanProgress = { total: 0, current: 0, currentFile: '' };
let lastScanStats = null;
let lastScanTime = null;

// Promisify db.run and db.all for easier async/await usage
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

const scanLibrary = async () => {
    if (isScanning) {
        throw new Error('Scan already in progress');
    }

    isScanning = true;
    const mediaPath = process.env.KARAOKE_MEDIA_PATH;

    if (!mediaPath) {
        isScanning = false;
        throw new Error('KARAOKE_MEDIA_PATH not configured');
    }

    console.log(`Starting library scan from: ${mediaPath}`);
    const startTime = Date.now();

    try {
        // Find all zip files recursively
        // glob returns a Promise in v10+ when used this way
        const files = await glob('**/*.zip', { cwd: mediaPath });
        console.log(`Found ${files.length} files. Processing...`);
        
        scanProgress = { total: files.length, current: 0, currentFile: '' };

        // Get all currently active files to track deletions
        const existingFiles = await dbAll("SELECT id, file_path FROM songs WHERE active = 1");
        const existingFileMap = new Map();
        existingFiles.forEach(row => existingFileMap.set(row.file_path, row.id));
        
        let newCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        // BATCH PROCESSING CONFIG
        const BATCH_SIZE = 1000; // Commit DB every 1000 files
        const CONCURRENCY = 50;  // Process 50 files in parallel

        // Helper to process a single file
        const processFile = async (file) => {
            // scanProgress.currentFile = file; // Disabled to reduce overhead and UI clutter
            const fullPath = path.join(mediaPath, file);
            let stats;

            try {
                // Use async fs.stat
                stats = await fs.promises.stat(fullPath);
            } catch (e) {
                console.error(`Error stat-ing file ${file}:`, e);
                errorCount++;
                return null; // Signal error
            }

            const mtime = Math.floor(stats.mtimeMs);
            const size = stats.size;
            const existingId = existingFileMap.get(file);

            // Return operation object to be executed in DB
            if (existingId) {
                existingFileMap.delete(file); // Mark as found
                
                // We need to check if update is needed. 
                // To avoid individual DB reads here, we assume we update if needed.
                // Or we can fetch details. Ideally, we loaded size/mtime in initial map to avoid DB read.
                // But map is getting big. 
                // Compromise: Just return the check logic.
                
                // Optimized: return an async function that does the DB check/update
                return async () => {
                    const currentRow = await dbGet("SELECT size, mtime FROM songs WHERE id = ?", [existingId]);
                    if (currentRow && (currentRow.size !== size || currentRow.mtime !== mtime)) {
                        await dbRun("UPDATE songs SET size = ?, mtime = ?, active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [size, mtime, existingId]);
                        updatedCount++;
                    }
                };
            } else {
                // New file logic
                const filename = path.basename(file, '.zip');
                const parts = filename.split(' - ');
                let artist = 'Unknown';
                let title = filename;
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                }

                return async () => {
                    const inactiveRow = await dbGet("SELECT id FROM songs WHERE file_path = ?", [file]);
                    if (inactiveRow) {
                        await dbRun("UPDATE songs SET artist = ?, title = ?, size = ?, mtime = ?, active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
                            [artist, title, size, mtime, inactiveRow.id]);
                        updatedCount++;
                    } else {
                        await dbRun("INSERT INTO songs (artist, title, file_path, size, mtime, active) VALUES (?, ?, ?, ?, ?, 1)",
                            [artist, title, file, size, mtime]);
                        newCount++;
                    }
                };
            }
        };

        // Main Loop
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const chunk = files.slice(i, i + BATCH_SIZE);
            
            // Parallel Processing of FS/Logic
            // We use a simple loop with Promise.all for concurrency control if we wanted to be strict,
            // but for 1000 items, we can just fire them all if CONCURRENCY is high, or slice again.
            // Let's implement strict concurrency control for the chunk.
            
            const dbOps = [];
            
            for (let j = 0; j < chunk.length; j += CONCURRENCY) {
                const subChunk = chunk.slice(j, j + CONCURRENCY);
                const results = await Promise.all(subChunk.map(f => processFile(f)));
                results.forEach(op => {
                    if (op) dbOps.push(op);
                });
                
                // Update progress roughly
                scanProgress.current += subChunk.length;
            }

            // Execute DB Ops in Transaction
            if (dbOps.length > 0) {
                await dbRun("BEGIN TRANSACTION");
                try {
                    // DB ops are serial
                    for (const op of dbOps) {
                        await op();
                    }
                    await dbRun("COMMIT");
                } catch (txErr) {
                    console.error("Transaction failed, rolling back chunk", txErr);
                    await dbRun("ROLLBACK");
                }
            }
        }

        // Any files remaining in existingFileMap were not found in the scan -> Mark inactive
        let deletedCount = 0;
        if (existingFileMap.size > 0) {
            const idsToDelete = Array.from(existingFileMap.values());
            await dbRun("BEGIN TRANSACTION");
            for (const id of idsToDelete) {
                await dbRun("UPDATE songs SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
                deletedCount++;
            }
            await dbRun("COMMIT");
        }
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`Scan complete in ${duration}s. New: ${newCount}, Updated: ${updatedCount}, Removed: ${deletedCount}, Errors: ${errorCount}`);
        
        lastScanTime = new Date();
        lastScanStats = {
            totalFiles: files.length,
            new: newCount,
            updated: updatedCount,
            removed: deletedCount,
            errors: errorCount,
            duration
        };
        isScanning = false;
        
        return {
            success: true,
            stats: lastScanStats
        };

    } catch (err) {
        console.error('Scan failed:', err);
        try {
            // Ensure no lingering transaction
           // await dbRun("ROLLBACK"); // Might fail if no transaction active, ignore
        } catch (rollbackErr) {}
        isScanning = false;
        throw err;
    }
};

const getStatus = async () => {
    try {
        const countRow = await dbGet("SELECT COUNT(*) as count FROM songs WHERE active = 1");
        return {
            isScanning,
            scanProgress: isScanning ? scanProgress : null,
            lastScanStats,
            lastScanTime,
            songCount: countRow ? countRow.count : 0
        };
    } catch (err) {
        throw err;
    }
};

const searchSongs = async (query) => {
    if (!query || query.trim().length === 0) {
        return [];
    }

    // Split query into words
    const terms = query.trim().split(/\s+/);
    
    // Build SQL query dynamically
    // Strategy: Every term must match EITHER artist OR title (OR file_path just in case)
    // AND operator between terms ensures all words must be present
    
    const conditions = [];
    const params = [];

    terms.forEach(term => {
        // Wrap in wildcards for LIKE
        const likeTerm = `%${term}%`;
        // Each word must be found in (artist OR title OR file_path)
        conditions.push('(artist LIKE ? OR title LIKE ? OR file_path LIKE ?)');
        params.push(likeTerm, likeTerm, likeTerm);
    });

    const whereClause = conditions.join(' AND ');

    const sql = `
        SELECT id, artist, title, file_path 
        FROM songs 
        WHERE active = 1 
        AND ${whereClause}
        ORDER BY artist ASC, title ASC 
        LIMIT 50
    `;

    try {
        const songs = await dbAll(sql, params);
        return songs;
    } catch (err) {
        throw err;
    }
};

const getSongById = async (id) => {
    try {
        const song = await dbGet("SELECT * FROM songs WHERE id = ?", [id]);
        return song;
    } catch (err) {
        throw err;
    }
};

const getSongFullPath = async (id) => {
    const song = await getSongById(id);
    if (!song) return null;
    
    const mediaPath = process.env.KARAOKE_MEDIA_PATH;
    if (!mediaPath) throw new Error('KARAOKE_MEDIA_PATH not configured');
    
    return path.join(mediaPath, song.file_path);
};

module.exports = {
    scanLibrary,
    getStatus,
    searchSongs,
    getSongById,
    getSongFullPath
};
