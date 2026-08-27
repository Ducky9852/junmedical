import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "cat /etc/systemd/system/salesbot.service; cat /home/ubuntu/bot/salesbot.env"
]

res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
with open('server_env.txt', 'w', encoding='utf-8') as f:
    f.write(res.stdout)
print("Saved server_env.txt")
