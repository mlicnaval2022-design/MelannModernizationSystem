const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('melann.db');

db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) console.error(err);
    else {
        rows.forEach(r => {
            console.log(`-- ${r.name}`);
            console.log(r.sql);
            console.log('');
        });
    }
});
