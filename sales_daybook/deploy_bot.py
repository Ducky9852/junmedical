import subprocess

# 1. Copy sales_log.py to server
cmd_scp = [
    "scp",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "sales_log.py",
    "ubuntu@64.110.106.131:/home/ubuntu/bot/sales_log.py"
]
res_scp = subprocess.run(cmd_scp, capture_output=True, encoding='utf-8', errors='replace')
print("SCP STDOUT:", res_scp.stdout)
print("SCP STDERR:", res_scp.stderr)

# 2. Restart salesbot service
cmd_restart = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "sudo systemctl daemon-reload; sudo systemctl restart salesbot; sleep 2; sudo systemctl status salesbot"
]
res_restart = subprocess.run(cmd_restart, capture_output=True, encoding='utf-8', errors='replace')
print("RESTART STDOUT:\n", res_restart.stdout)
print("RESTART STDERR:\n", res_restart.stderr)
