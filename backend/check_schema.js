const db = require('./src/db');
setTimeout(() => {
    db.all("PRAGMA table_info(queue_entries)", (err, rows) => {
        console.log("Queue Entries Columns:", rows);
    });
}, 2000);
