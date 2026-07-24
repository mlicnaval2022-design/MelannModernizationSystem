const { getDb, dbRun, dbGet } = require('./server/src/db/database');

(async () => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      proposed_principal,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = {
      first_name: 'Test',
      last_name: 'Customer',
      business_type: 'FOOD CART / KIOSK / STREET VENDOR'
    };
    
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblCustomer')).c;
    const customer_code = String(count + 1).padStart(4, '0');
    
    const cols = ['customer_code', 'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];
    
    const vals = [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client];

    const placeholders = cols.map(() => '?').join(',');
    console.log('Inserting...');
    const result = await dbRun(`INSERT INTO tblCustomer (${cols.join(',')}) VALUES (${placeholders})`, vals);
    console.log('Success!', result);
  } catch (err) {
    console.error('Test error:', err);
  }
})();
