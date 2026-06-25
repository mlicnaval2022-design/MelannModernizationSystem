const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  const replaceQuery = (table, column) => `
    UPDATE ${table}
    SET ${column} = REPLACE(${column}, CHAR(65533), 'Ñ')
    WHERE ${column} LIKE '%' || CHAR(65533) || '%';
  `;

  const tablesAndColumns = [
    { table: 'tblCustomer', columns: ['first_name', 'last_name', 'middle_name', 'full_name', 'address', 'sitio', 'purok', 'brgy', 'city', 'province', 'photo_client'] },
    { table: 'tblCollector', columns: ['first_name', 'last_name'] }
  ];

  let totalUpdated = 0;

  tablesAndColumns.forEach(({ table, columns }) => {
    columns.forEach(column => {
      db.run(replaceQuery(table, column), function(err) {
        if (err) console.error(err);
        else if (this.changes > 0) {
          console.log(`Updated ${this.changes} rows in ${table}.${column}`);
          totalUpdated += this.changes;
        }
      });
    });
  });

  db.run('COMMIT', (err) => {
    if (err) console.error(err);
    else console.log(`Successfully fixed encoding issues in ${totalUpdated} total fields!`);
    db.close();
  });
});
