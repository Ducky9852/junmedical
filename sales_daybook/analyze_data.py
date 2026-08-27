import zipfile
import csv
import io
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

zip_path = 'notion_data/ExportBlock-b14e7eb7-547c-47c1-aece-aae9b121b8fa-Part-1.zip'

with zipfile.ZipFile(zip_path, 'r') as zf:
    for filename in zf.namelist():
        print("="*60)
        print("FILE:", filename)
        with zf.open(filename) as f:
            text = f.read().decode('utf-8-sig')
            reader = csv.reader(io.StringIO(text))
            header = next(reader)
            print("HEADER:", header)
            rows = list(reader)
            print("TOTAL ROWS:", len(rows))
            
            print("\n--- SAMPLE ROWS (3 rows) ---")
            for i, r in enumerate(rows[:3]):
                print(f"\n[Row {i+1}]")
                for col_name, val in zip(header, r):
                    if val.strip():
                        print(f"  {col_name}: {val}")

            print("\n--- COLUMN SUMMARY ---")
            col_data = {col: [] for col in header}
            for r in rows:
                for col_name, val in zip(header, r):
                    col_data[col_name].append(val)
            for col, vals in col_data.items():
                non_empty = [v for v in vals if v.strip()]
                unique = set(non_empty)
                print(f"Column: [{col}] | Filled: {len(non_empty)}/{len(rows)} | Unique count: {len(unique)}")
                if len(unique) <= 20:
                    print(f"   Values: {list(unique)}")
                else:
                    sample = list(unique)[:6]
                    print(f"   Sample: {sample}")
