import os
import openpyxl
from collections import defaultdict

# Path to the data file
file_path = '/Users/akshatojha/Downloads/sail data.xlsx'

if not os.path.exists(file_path):
    # Fallback to local search if moved
    file_path = 'sail data.xlsx'
    if not os.path.exists(file_path):
        file_path = '../sail data.xlsx'

print(f"Loading workbook from: {file_path}...")
try:
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    print(f"Successfully loaded. Total sheet rows: {len(rows)}")
except Exception as e:
    print(f"Error loading Excel file: {e}")
    exit(1)

if not rows:
    print("The Excel sheet is empty.")
    exit(0)

headers = rows[0]
clean_rows = []
row_mappings = [] # maps clean index back to excel row number (1-based)

for idx, r in enumerate(rows[1:]):
    # Skip rows that are completely empty
    if any(val is not None and str(val).strip() != '' for val in r):
        clean_rows.append(r)
        row_mappings.append(idx + 2)

print(f"Active records (excluding empty rows): {len(clean_rows)}\n")

# Columns to check for missing values
columns_to_check = [
    'TAGGING NO.', 'Staff No.', 'Name', 'Deptt.', 'Location',
    'PC Model', 'PC Sl. No.', 'Monitor Sl. No.', 
    'Printer Sl. No.', 'Scanner Sl.No.', 'DOMAIN', 'TRINETRA'
]

# Recalculate missing counts
missing_counts = defaultdict(int)
missing_by_dept = defaultdict(list)

for c_name in columns_to_check:
    if c_name not in headers:
        print(f"Warning: Column '{c_name}' not found in sheet headers.")
        continue
    
    col_idx = headers.index(c_name)
    dept_idx = headers.index('Deptt.')
    staff_idx = headers.index('Staff No.')
    name_idx = headers.index('Name')
    
    for r_idx, r in enumerate(clean_rows):
        excel_row = row_mappings[r_idx]
        val = r[col_idx]
        
        # Check if the value is empty, None, or a common placeholder
        if val is None or str(val).strip() == '' or str(val).strip().upper() in ['NA', 'N/A', 'NIL', '-', 'NONE']:
            missing_counts[c_name] += 1
            missing_by_dept[c_name].append({
                'row': excel_row,
                'staff_no': r[staff_idx],
                'name': r[name_idx],
                'dept': r[dept_idx]
            })

print("=== Summary of Missing Fields in Active Records ===")
for c_name in columns_to_check:
    if c_name in missing_counts:
        print(f"Column '{c_name}': {missing_counts[c_name]} rows missing information.")
    else:
        print(f"Column '{c_name}': 0 rows missing information.")

print("\n=== Detailed Breakdown of Key Missing Columns ===")
# List detailed reports for columns with key missing counts
for c_name in ['PC Sl. No.', 'Monitor Sl. No.', 'Location', 'DOMAIN']:
    records = missing_by_dept[c_name]
    print(f"\nMissing '{c_name}' ({len(records)} records):")
    if not records:
        print("  None.")
        continue
        
    # Group by department for clear visualization
    dept_groups = defaultdict(int)
    for rec in records:
        dept_groups[rec['dept']] += 1
        
    print("  Grouped by Department:")
    sorted_depts = sorted(dept_groups.items(), key=lambda x: x[1], reverse=True)
    for dept, count in sorted_depts[:8]:
        print(f"    - {dept}: {count} rows missing")
    
    print("  Example Missing Rows (first 5):")
    for rec in records[:5]:
        print(f"    * Excel Row {rec['row']} | Staff No: {rec['staff_no']} | Name: {rec['name']} | Dept: {rec['dept']}")
