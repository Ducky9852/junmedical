import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "cat /home/ubuntu/bot/todo_log.py"
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
with open('server_todo_log.py', 'w', encoding='utf-8') as f:
    f.write(res.stdout)
print("Saved server_todo_log.py successfully.")
