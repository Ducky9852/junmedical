import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('sales_database.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

for i, log in enumerate(db.get('activity_logs', [])):
    h = log.get('hospital', '')
    t = log.get('title', '')
    d = log.get('date', '')
    r = log.get('sales_rep', '')
    if '모태안' in h or '모태안' in t or '미즈맘' in t or '미즈맘' in h:
        print(f"Idx {i}: Hosp={h} | Title={t} | Date={d} | Rep={r}")
