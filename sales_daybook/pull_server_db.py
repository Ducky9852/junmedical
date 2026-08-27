import subprocess
import json

# 1. Pull latest DB from Ubuntu server
cmd = [
    "scp",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131:/home/ubuntu/bot/sales_database.json",
    "sales_database.json"
]
res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("SCP STDOUT:", res.stdout)

with open('sales_database.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

print("Total logs:", len(db.get('activity_logs', [])))
print("Total hospitals:", len(db.get('hospitals', [])))

# 2. Check Boeun Hanyang logs
boeun_logs = [l for l in db.get('activity_logs', []) if '보은' in l.get('hospital', '') or '한양' in l.get('hospital', '')]
print(f"Boeun logs ({len(boeun_logs)}):")
for l in boeun_logs:
    print(f"[{l.get('date')}] ({l.get('sales_rep')}) {l.get('hospital')} - {l.get('title')}: {l.get('note')}")
