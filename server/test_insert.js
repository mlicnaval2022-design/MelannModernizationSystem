const { dbRun, dbGet } = require('./src/db/database');
(async () => {
  try {
    const full_name = 'Test, User';
    const customer_code = 'CUS-00004';
    const result = await dbRun(`INSERT INTO tblCustomer (customer_code, first_name, last_name, middle_name, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status, sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
      [customer_code, 'User', 'Test', null, full_name, 'Address', '0000', '2000-01-01', 'Single', 'Business', null, null, 
       'Sitio', 'Purok', 'Brgy', 'City', 'Male', '1111', 'email@test.com', 1000, 500, 'Loan', 'Collat', 'ID', '123', '2020-01-01', '2025-01-01', 'Gov', 'FB', 'Filipino']);
    console.log('Insert success:', result);
  } catch (err) {
    console.error('Insert error:', err);
  }
})();
