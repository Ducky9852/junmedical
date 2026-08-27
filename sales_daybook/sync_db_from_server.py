import subprocess

# Pull updated DB from server
cmd = [
    "scp",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131:/home/ubuntu/bot/sales_database.json",
    "sales_database.json"
]
res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("SCP DB STDOUT:", res.stdout)

# Generate sales_database.js
import json
with open('sales_database.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
with open('sales_database.js', 'w', encoding='utf-8') as f:
    f.write('window.SALES_DB = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
print(f"Updated sales_database.js with {len(data['activity_logs'])} logs.")
