import pyodbc
import json

db_path = r"D:\Users\Mel Rodriguez\Documents\FOR MELANN DEPLOYMENT - Copy\DB\jcashdb.mdb"
conn_str = rf"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={db_path};PWD=kim123;"

try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Get all tables
    tables = [table.table_name for table in cursor.tables(tableType='TABLE')]
    
    schema = {}
    for table in tables:
        # Ignore system tables
        if table.startswith("MSys"):
            continue
            
        cursor.execute(f"SELECT TOP 1 * FROM [{table}]")
        columns = [column[0] for column in cursor.description]
        schema[table] = columns
        
    print(json.dumps(schema, indent=2))
    conn.close()
except Exception as e:
    print(f"Error: {e}")
