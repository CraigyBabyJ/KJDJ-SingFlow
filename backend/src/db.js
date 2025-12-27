const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './db/kjdj.db';
const resolvedPath = path.resolve(__dirname, '..', dbPath);

console.log(`Connecting to database at ${resolvedPath}`);

const normalizeDisplayName = (name = '') => name.trim().replace(/\s+/g, ' ');
const normalizeDisplayNameKey = (name = '') => normalizeDisplayName(name).toLowerCase();
const generateInviteToken = () => crypto.randomBytes(12).toString('hex');

const db = new sqlite3.Database(resolvedPath, (err) => {
  if (err) {
    console.error('Error opening database ' + resolvedPath, err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    db.serialize(() => {
        // Enable foreign keys
        db.run("PRAGMA foreign_keys = ON");

        // 1. Users
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'singer', -- 'admin' or 'singer'
            invite_token TEXT,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Singers
        db.run(`CREATE TABLE IF NOT EXISTS singers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            displayName_norm TEXT,
            user_id INTEGER UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            in_rotation BOOLEAN DEFAULT 1,
            rotation_index INTEGER DEFAULT 0,
            host_id INTEGER REFERENCES users(id),
            active BOOLEAN DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 3. Songs (Library Cache)
        db.run(`CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            file_path TEXT UNIQUE NOT NULL,
            size INTEGER,
            mtime INTEGER,
            media_type TEXT DEFAULT 'zip',
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_songs_active ON songs(active)`);

        db.all("PRAGMA table_info(songs)", (err, columns) => {
            if (err) return console.error("Error getting songs info", err);
            const colNames = columns.map(c => c.name);

            if (!colNames.includes('media_type')) {
                console.log("Adding media_type to songs table");
                db.run("ALTER TABLE songs ADD COLUMN media_type TEXT DEFAULT 'zip'", (alterErr) => {
                    if (alterErr) {
                        console.error("Failed to add media_type", alterErr);
                        return;
                    }
                    db.run("UPDATE songs SET media_type = 'zip' WHERE media_type IS NULL", (updateErr) => {
                        if (updateErr) console.error("Failed to backfill media_type", updateErr);
                    });
                });
            } else {
                db.run("UPDATE songs SET media_type = 'zip' WHERE media_type IS NULL", (updateErr) => {
                    if (updateErr) console.error("Failed to backfill media_type", updateErr);
                });
            }
        });

        // 4. Queue
        db.run(`CREATE TABLE IF NOT EXISTS queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            singer_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            position INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(singer_id) REFERENCES singers(id),
            FOREIGN KEY(song_id) REFERENCES songs(id)
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status)`);

        // 5. Favorites
        db.run(`CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(song_id) REFERENCES songs(id),
            UNIQUE(user_id, song_id)
        )`);
        
        // 6. Settings
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
        )`);

        // 7. Queue Entries (Phase 3A)
        db.run(`CREATE TABLE IF NOT EXISTS queue_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            singer_id INTEGER NOT NULL,
            host_id INTEGER REFERENCES users(id), -- Added for Host Isolation
            position INTEGER,
            status TEXT DEFAULT 'queued', -- 'queued'|'playing'|'done'|'skipped'
            requested_by_user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME,
            FOREIGN KEY(song_id) REFERENCES songs(id),
            FOREIGN KEY(singer_id) REFERENCES singers(id),
            FOREIGN KEY(requested_by_user_id) REFERENCES users(id)
        )`);

        // 8. Singer History (Phase 3A)
        db.run(`CREATE TABLE IF NOT EXISTS singer_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            singer_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            key_change INTEGER,
            notes TEXT,
            FOREIGN KEY(singer_id) REFERENCES singers(id),
            FOREIGN KEY(song_id) REFERENCES songs(id)
        )`);

        // Migrations
        // Add columns to singers if not exist
        db.all("PRAGMA table_info(users)", (err, columns) => {
            if (err) return console.error("Error getting users info", err);
            const colNames = columns.map(c => c.name);

            if (!colNames.includes('invite_token')) {
                console.log("Adding invite_token to users table");
                db.run("ALTER TABLE users ADD COLUMN invite_token TEXT");
            }
            if (!colNames.includes('last_login')) {
                console.log("Adding last_login to users table");
                db.run("ALTER TABLE users ADD COLUMN last_login DATETIME");
            }

            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token)");

            db.all("SELECT id FROM users WHERE (role = 'HOST' OR role = 'admin') AND (invite_token IS NULL OR invite_token = '')", (selectErr, rows) => {
                if (selectErr) return console.error("Error selecting users for invite tokens", selectErr);
                rows.forEach((row) => {
                    const token = generateInviteToken();
                    db.run("UPDATE users SET invite_token = ? WHERE id = ?", [token, row.id]);
                });
            });
        });

        db.all("PRAGMA table_info(singers)", (err, columns) => {
            if (err) return console.error("Error getting singers info", err);
            const colNames = columns.map(c => c.name);
            
            if (!colNames.includes('in_rotation')) {
                db.run("ALTER TABLE singers ADD COLUMN in_rotation BOOLEAN DEFAULT 1");
            }
            if (!colNames.includes('rotation_index')) {
                db.run("ALTER TABLE singers ADD COLUMN rotation_index INTEGER DEFAULT 0");
            }
            if (!colNames.includes('host_id')) {
                console.log("Adding host_id to singers table");
                db.run("ALTER TABLE singers ADD COLUMN host_id INTEGER REFERENCES users(id)");
            }
            const ensureDisplayNameNorm = () => {
                db.all("PRAGMA table_info(singers)", (infoErr, infoRows) => {
                    if (infoErr) return console.error("Error checking singers schema", infoErr);
                    const infoNames = infoRows.map(row => row.name);
                    if (!infoNames.includes('displayName_norm')) {
                        return;
                    }
                    db.all("SELECT id, name, displayName_norm FROM singers", (selectErr, rows) => {
                        if (selectErr) return console.error("Error backfilling displayName_norm", selectErr);
                        rows.forEach((row) => {
                            if (row.displayName_norm) return;
                            const normalized = normalizeDisplayNameKey(row.name || '');
                            if (!normalized) return;
                            db.run("UPDATE singers SET displayName_norm = ? WHERE id = ?", [normalized, row.id]);
                        });
                    });
                });
            };

            if (!colNames.includes('displayName_norm')) {
                console.log("Adding displayName_norm to singers table");
                db.run("ALTER TABLE singers ADD COLUMN displayName_norm TEXT", (alterErr) => {
                    if (alterErr) {
                        console.error("Failed to add displayName_norm", alterErr);
                        return;
                    }
                    ensureDisplayNameNorm();
                });
            } else {
                ensureDisplayNameNorm();
            }
            if (!colNames.includes('active')) {
                console.log("Adding active to singers table");
                db.run("ALTER TABLE singers ADD COLUMN active BOOLEAN DEFAULT 1");
            }

            // Ensure indices exist
            db.run("CREATE INDEX IF NOT EXISTS idx_singers_host ON singers(host_id)");
            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_singers_host_name ON singers(host_id, name)");
            db.all("PRAGMA table_info(singers)", (infoErr, infoRows) => {
                if (infoErr) return console.error("Error checking singers schema for indexes", infoErr);
                const infoNames = infoRows.map(row => row.name);
                if (!infoNames.includes('displayName_norm') || !infoNames.includes('active')) {
                    return;
                }
                db.run("DROP INDEX IF EXISTS idx_singers_host_displayname_norm");
                db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_singers_host_displayname_norm_active ON singers(host_id, displayName_norm) WHERE active = 1");
            });
        });

        // Check queue_entries for host_id
        db.all("PRAGMA table_info(queue_entries)", (err, columns) => {
             if (err) return console.error("Error getting queue_entries info", err);
             const colNames = columns.map(c => c.name);

             if (!colNames.includes('host_id')) {
                 console.log("Adding host_id to queue_entries table");
                 db.run("ALTER TABLE queue_entries ADD COLUMN host_id INTEGER REFERENCES users(id)", (alterErr) => {
                    if (!alterErr) {
                        console.log("Backfilling queue_entries host_id from singers...");
                        db.run(`
                            UPDATE queue_entries 
                            SET host_id = (SELECT host_id FROM singers WHERE singers.id = queue_entries.singer_id)
                            WHERE host_id IS NULL
                        `, (updateErr) => {
                             if(updateErr) console.error("Backfill failed", updateErr);
                             else {
                                 console.log("Backfill complete. Creating index.");
                                 db.run("CREATE INDEX IF NOT EXISTS idx_queue_host ON queue_entries(host_id)");
                             }
                        });
                    } else {
                        console.error("Failed to add host_id to queue_entries", alterErr);
                    }
                 });
             } else {
                 // Column exists, ensure index exists
                 db.run("CREATE INDEX IF NOT EXISTS idx_queue_host ON queue_entries(host_id)");
             }
        });

        // Migrate old queue to new queue_entries if needed
        db.get("SELECT count(*) as count FROM queue_entries", (err, row) => {
            if (!err && row && row.count === 0) {
                 // Check if old queue has data
                 db.get("SELECT count(*) as count FROM queue", (errOld, rowOld) => {
                     if (!errOld && rowOld && rowOld.count > 0) {
                         console.log("Migrating legacy queue to queue_entries...");
                         db.run(`
                             INSERT INTO queue_entries (song_id, singer_id, position, status, created_at)
                             SELECT song_id, singer_id, position, 
                                CASE status WHEN 'pending' THEN 'queued' ELSE status END,
                                created_at
                             FROM queue
                         `, (errMig) => {
                             if (errMig) console.error("Migration failed", errMig);
                             else console.log("Migration successful");
                         });
                     }
                 });
            }
        });

        // 9. Fix Singers Unique Constraint (Allow multiple hosts per user)
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='singers'", (err, row) => {
            if (!err && row && row.sql && row.sql.includes('user_id INTEGER UNIQUE')) {
                console.log("Migrating singers table to remove user_id UNIQUE constraint...");
                db.serialize(() => {
                    db.run("PRAGMA foreign_keys=OFF");
                    db.run("BEGIN TRANSACTION");
                    
                    // Create new table
                    db.run(`CREATE TABLE singers_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        displayName_norm TEXT,
                        user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        in_rotation BOOLEAN DEFAULT 1,
                        rotation_index INTEGER DEFAULT 0,
                        host_id INTEGER REFERENCES users(id),
                        active BOOLEAN DEFAULT 1,
                        FOREIGN KEY(user_id) REFERENCES users(id)
                    )`);
                    
                    // Copy data
                    db.all("PRAGMA table_info(singers)", (infoErr, infoRows) => {
                        if (infoErr) {
                            console.error("Error reading singers schema for migration", infoErr);
                            db.run("ROLLBACK");
                            db.run("PRAGMA foreign_keys=ON");
                            return;
                        }
                        const infoNames = infoRows.map(row => row.name);
                        const hasDisplayNameNorm = infoNames.includes('displayName_norm');
                        const insertSql = hasDisplayNameNorm
                            ? `INSERT INTO singers_new (id, name, displayName_norm, user_id, created_at, in_rotation, rotation_index, host_id, active)
                               SELECT id, name, displayName_norm, user_id, created_at, in_rotation, rotation_index, host_id, 1 FROM singers`
                            : `INSERT INTO singers_new (id, name, user_id, created_at, in_rotation, rotation_index, host_id, active)
                               SELECT id, name, user_id, created_at, in_rotation, rotation_index, host_id, 1 FROM singers`;
                        db.run(insertSql);
                    });
                            
                    // Drop old
                    db.run("DROP TABLE singers");
                    
                    // Rename new
                    db.run("ALTER TABLE singers_new RENAME TO singers");
                    
                    // Recreate Indices
                    db.run("CREATE INDEX IF NOT EXISTS idx_singers_host ON singers(host_id)");
                    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_singers_host_name ON singers(host_id, name)");
                    db.run("DROP INDEX IF EXISTS idx_singers_host_displayname_norm");
                    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_singers_host_displayname_norm_active ON singers(host_id, displayName_norm) WHERE active = 1");
                    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_singers_host_user ON singers(host_id, user_id)");
                    
                    db.run("COMMIT");
                    db.run("PRAGMA foreign_keys=ON");
                    console.log("Singers table migration complete.");
                });
            }
        });
    });
  }
});

module.exports = db;
