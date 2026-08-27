import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "grep -n -C 3 'sales_log' /home/ubuntu/bot/sales_bot.py"
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("STDOUT:\n", res.stdout)
