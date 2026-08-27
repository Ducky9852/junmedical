import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "head -n 50 /home/ubuntu/bot/todo_log.py"
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("STDOUT:\n", res.stdout)
