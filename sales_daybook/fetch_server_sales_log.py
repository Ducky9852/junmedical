import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "cat /home/ubuntu/bot/sales_log.py"
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
with open('server_sales_log.py', 'w', encoding='utf-8') as f:
    f.write(res.stdout)
print(f"Read {len(res.stdout)} chars from server sales_log.py")
