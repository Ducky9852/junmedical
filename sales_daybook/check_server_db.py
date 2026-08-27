import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "python3 -c \"import json; db = json.load(open('/home/ubuntu/bot/sales_database.json', encoding='utf-8')); print('Total logs:', len(db.get('activity_logs', []))); print('Total hospitals:', len(db.get('hospitals', []))); print('Recent logs:', [(l.get('date'), l.get('sales_rep'), l.get('hospital'), l.get('title')) for l in db.get('activity_logs', [])[:8]])\""
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
