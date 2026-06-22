const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
    // Insert into tblCustomer directly
    const customer_code = '4115';
    const first_name = 'RUTH ANNE';
    const last_name = 'WOODBURY';
    const middle_name = 'TIZON';
    const full_name = `${last_name}, ${first_name} ${middle_name}`;
    const address = 'TORING, TAMBULILID, ORMOC CITY, LEYTE';
    const birth_date = '1981-10-25'; // SQL format typically
    
    db.run(`INSERT INTO tblCustomer (customer_code, first_name, last_name, middle_name, full_name, address, birth_date, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [customer_code, first_name, last_name, middle_name, full_name, address, birth_date, 'active'], 
        function(err) {
            if (err) {
                console.error("Error inserting:", err.message);
            } else {
                console.log(`Inserted customer with ID ${this.lastID}`);
            }
        }
    );
});

db.close();
