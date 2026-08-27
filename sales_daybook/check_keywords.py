import zipfile
import csv
import io
import sys
import re
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

zip_path = 'notion_data/ExportBlock-b14e7eb7-547c-47c1-aece-aae9b121b8fa-Part-1.zip'

with zipfile.ZipFile(zip_path, 'r') as zf:
    with zf.open('영업관리 3cbe476c01fb4d9f8d78f00cb9dc182a.csv') as f:
        text = f.read().decode('utf-8-sig')
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        rows = list(reader)

# Let's inspect unique hospitals clean
hospitals = set()
for r in rows:
    row_dict = dict(zip(header, r))
    raw_hosp = row_dict.get('거래처', '')
    clean_hosp = re.sub(r'\s*\(https://[^\)]+\)', '', raw_hosp).strip()
    if clean_hosp:
        hospitals.add(clean_hosp)

print(f"Total Unique Clean Hospitals: {len(hospitals)}")

# Check action keywords in text
demo_cases = []
as_cases = []
fail_cases = []

for r in rows:
    row_dict = dict(zip(header, r))
    text = f"{row_dict.get('영업 내용', '')} {row_dict.get('업무 내용', '')}"
    hosp = re.sub(r'\s*\(https://[^\)]+\)', '', row_dict.get('거래처', '')).strip()
    date = row_dict.get('영업일', '')
    
    if re.search(r'데모|샘플|sample|demo', text, re.IGNORECASE):
        demo_cases.append((date, hosp, text[:80]))
    if re.search(r'A/S|AS|에이에스|클레임|수리|불량|파손|교환|교체', text, re.IGNORECASE):
        as_cases.append((date, hosp, text[:80]))
    if re.search(r'실패|거부|거절|안함|힘들|어렵|반응\s*없|취소|드랍|drop', text, re.IGNORECASE) or row_dict.get('상태') == '영업실패':
        fail_cases.append((date, hosp, text[:80]))

print(f"Found Demo/Sample related logs: {len(demo_cases)}")
print(f"Found A/S / Claim / Defect related logs: {len(as_cases)}")
print(f"Found Rejection / Difficulty / Failure related logs: {len(fail_cases)}")

print("\n--- Demo Cases Sample (5) ---")
for c in demo_cases[:5]:
    print(" ", c)

print("\n--- A/S Cases Sample (5) ---")
for c in as_cases[:5]:
    print(" ", c)

print("\n--- Failure/Rejection Cases Sample (5) ---")
for c in fail_cases[:5]:
    print(" ", c)
