import pyodbc
import sqlite3
import datetime

mdb_path = r"D:\Users\Mel Rodriguez\Documents\FOR MELANN DEPLOYMENT - Copy\DB\jcashdb.mdb"
sqlite_path = r"D:\ModernizationMelannSystem\server\melann.db"

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

# Connect to DBs
conn_str = rf"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={mdb_path};PWD=kim123;"
mdb_conn = pyodbc.connect(conn_str)
mdb_cursor = mdb_conn.cursor()

sqlite_conn = sqlite3.connect(sqlite_path)
sqlite_cursor = sqlite_conn.cursor()

print("Starting migration ETL...")

# 1. Fetch Loans from 2024 to 2026
print("Querying MS Access for loans between 2024 and 2026...")
mdb_cursor.execute("SELECT * FROM tblLoan WHERE YEAR(LoanDate) >= 2024 AND YEAR(LoanDate) <= 2026")
access_loans = mdb_cursor.fetchall()
loan_columns = [column[0] for column in mdb_cursor.description]
loans = [dict(zip(loan_columns, row)) for row in access_loans]
print(f"Fetched {len(loans)} loans in 2024-2026.")

# Extract unique customer codes
customer_codes = list(set([loan['Code'] for loan in loans if loan['Code']]))
print(f"Found {len(customer_codes)} unique customers linked to these loans.")

# 2. Fetch Customers in chunks to avoid System resource exceeded
customers = []
for chunk in chunk_list(customer_codes, 50):
    placeholders = ','.join(['?'] * len(chunk))
    mdb_cursor.execute(f"SELECT * FROM tblCustomer WHERE Code IN ({placeholders})", chunk)
    rows = mdb_cursor.fetchall()
    if not customers:
        customer_columns = [column[0] for column in mdb_cursor.description]
    customers.extend([dict(zip(customer_columns, row)) for row in rows])

print(f"Fetched {len(customers)} customer records.")

# 3. Fetch Payments in chunks based on LoanIDs
loan_ids = list(set([str(loan['LoanID']) for loan in loans if loan['LoanID']]))
print(f"Found {len(loan_ids)} unique Loan IDs. Fetching payments...")

payments = []
for chunk in chunk_list(loan_ids, 50):
    placeholders = ','.join(['?'] * len(chunk))
    mdb_cursor.execute(f"SELECT * FROM tblPayment WHERE LoanID IN ({placeholders})", chunk)
    rows = mdb_cursor.fetchall()
    if not payments:
        payment_columns = [column[0] for column in mdb_cursor.description]
    payments.extend([dict(zip(payment_columns, row)) for row in rows])

print(f"Fetched {len(payments)} payment records.")

# --- ETL ---

def safe_str(val):
    return str(val).strip() if val is not None else ""

def safe_float(val):
    try:
        return float(val) if val is not None else 0.0
    except:
        return 0.0

def safe_int(val):
    try:
        return int(val) if val is not None else 0
    except:
        return 0

def format_date(val):
    if not val: return None
    try:
        if isinstance(val, datetime.datetime):
            return val.strftime('%Y-%m-%d')
        # simple parsing just in case
        return str(val)[:10]
    except:
        return None

try:
    sqlite_conn.execute("BEGIN TRANSACTION")

    # MIGRATION: Customers
    sqlite_cursor.execute("SELECT customer_code, id FROM tblCustomer")
    existing_customers = {row[0]: row[1] for row in sqlite_cursor.fetchall()}
    
    inserted_customers = 0
    customer_id_map = {} # Code -> sqlite id
    for c in customers:
        code = safe_str(c.get('Code'))
        if not code: continue
        
        # check if exists
        if code in existing_customers:
            customer_id_map[code] = existing_customers[code]
            continue
            
        first_name = safe_str(c.get('FirstName'))
        last_name = safe_str(c.get('LastName'))
        mid_name = safe_str(c.get('MiddleInitial'))
        full_name = f"{first_name} {mid_name} {last_name}".strip().replace("  ", " ")
        address = safe_str(c.get('Address'))
        contact = safe_str(c.get('PhoneNumber'))
        birth_date = format_date(c.get('Birthday'))
        civil_status = safe_str(c.get('MaritalStatus'))
        occupation = safe_str(c.get('Business'))
        
        sqlite_cursor.execute("""
            INSERT INTO tblCustomer (
                customer_code, first_name, last_name, middle_name, full_name,
                address, contact, birth_date, civil_status, occupation, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (code, first_name, last_name, mid_name, full_name, address, contact, birth_date, civil_status, occupation))
        
        customer_id_map[code] = sqlite_cursor.lastrowid
        inserted_customers += 1

    print(f"Inserted {inserted_customers} new customers (skipped existing).")

    # MIGRATION: Loans
    sqlite_cursor.execute("SELECT loan_code, id FROM tblLoan")
    existing_loans = {row[0]: row[1] for row in sqlite_cursor.fetchall()}
    
    inserted_loans = 0
    loan_id_map = {} # old LoanID -> sqlite id
    for l in loans:
        old_loan_id = str(l.get('LoanID'))
        cust_code = safe_str(l.get('Code'))
        if not old_loan_id or not cust_code: continue
        
        new_cust_id = customer_id_map.get(cust_code)
        if not new_cust_id: continue
        
        loan_code = f"L-{old_loan_id}"
        
        # Check if exists
        if loan_code in existing_loans:
            loan_id_map[old_loan_id] = existing_loans[loan_code]
            continue
            
        principal = safe_float(l.get('Principal'))
        interest_rate = safe_float(l.get('InterestRate'))
        loan_period = safe_int(l.get('LoanPeriod')) or 1
        date_released = format_date(l.get('DateRelease')) or format_date(l.get('LoanDate'))
        date_maturity = format_date(l.get('Maturity'))
        amortization = safe_float(l.get('Amortization'))
        total_amortization = safe_float(l.get('TotalAmortization'))
        balance = safe_float(l.get('Balance'))
        total_paid = safe_float(l.get('TotalPayment'))
        status = safe_str(l.get('Status')).lower()
        if status == 'fully paid': status = 'paid'
        elif status not in ['active', 'paid', 'past due']: status = 'active'
        
        if not date_released: continue
        
        sqlite_cursor.execute("""
            INSERT INTO tblLoan (
                loan_code, customer_id, principal, interest_rate, loan_period,
                date_released, date_maturity, amortization, total_amortization,
                balance, total_paid, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (loan_code, new_cust_id, principal, interest_rate, loan_period,
              date_released, date_maturity, amortization, total_amortization,
              balance, total_paid, status, date_released))
              
        loan_id_map[old_loan_id] = sqlite_cursor.lastrowid
        inserted_loans += 1

    print(f"Inserted {inserted_loans} new loans (skipped existing).")

    # MIGRATION: Payments
    sqlite_cursor.execute("SELECT or_number FROM tblPayment")
    existing_payments = {row[0] for row in sqlite_cursor.fetchall()}
    
    inserted_payments = 0
    payment_batch = []
    
    for p in payments:
        old_loan_id = str(p.get('LoanID'))
        new_loan_id = loan_id_map.get(old_loan_id)
        if not new_loan_id: continue
        
        cust_code = safe_str(p.get('Code'))
        new_cust_id = customer_id_map.get(cust_code)
        if not new_cust_id: continue
        
        # Payment might not have OR number, use ID
        payment_id = str(p.get('ID'))
        or_number = f"P-{payment_id}"
        
        if or_number in existing_payments:
            continue
            
        date_paid = format_date(p.get('Date'))
        amount_paid = safe_float(p.get('TotalPayment'))
        if amount_paid == 0:
            amount_paid = safe_float(p.get('Amortization'))
            
        balance_after = safe_float(p.get('NewBalance'))
        balance_before = safe_float(p.get('TotalBalance'))
        
        if not date_paid: continue
        
        payment_batch.append((new_loan_id, new_cust_id, or_number, date_paid, amount_paid, balance_before, balance_after, date_paid))
        existing_payments.add(or_number)
        inserted_payments += 1
        
    sqlite_cursor.executemany("""
        INSERT INTO tblPayment (
            loan_id, customer_id, or_number, date_paid, amount_paid,
            balance_before, balance_after, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    """, payment_batch)

    print(f"Inserted {inserted_payments} new payments (skipped existing).")

    sqlite_conn.commit()
    print("Migration finished successfully!")

except Exception as e:
    sqlite_conn.rollback()
    print(f"Error during migration: {e}")

finally:
    mdb_conn.close()
    sqlite_conn.close()
