import subprocess

cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    "sudo journalctl -u salesbot -n 25 --no-pager"
]
res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("JOURNAL LOGS:\n", res.stdout)
