const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'db/kjdj.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.all("PRAGMA index_list(queue_entries)", (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log("Indexes on queue_entries:", rows);
        }
    });

    db.all("PRAGMA index_list(singers)", (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log("Indexes on singers:", rows);
        }
    });
});

db.close();
