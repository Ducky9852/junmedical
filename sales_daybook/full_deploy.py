import subprocess

# 1. SCP sales_log.py, app.js, index.html, sales.html, sales_database.json, sales_database.js to server
files = ["sales_log.py", "app.js", "app.css", "index.html", "sales.html", "sales_database.json", "sales_database.js"]
for f in files:
    cmd_scp = [
        "scp",
        "-o", "StrictHostKeyChecking=no",
        "-i", "ssh-key-2026-07-06.key",
        f,
        f"ubuntu@64.110.106.131:/home/ubuntu/bot/{f}"
    ]
    subprocess.run(cmd_scp, capture_output=True)

# 2. Test Git Push from server to GitHub
commands = """
cd /home/ubuntu/bot
cp index.html sales.html
git add sales_database.json sales_database.js sales.html index.html app.js app.css
git commit -m "sync: Full sync with normalized 758 logs and real-time auto push"
git push origin main
sudo systemctl daemon-reload
sudo systemctl restart salesbot
sudo systemctl status salesbot
"""
cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-i", "ssh-key-2026-07-06.key",
    "ubuntu@64.110.106.131",
    commands
]
res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace')
print("STDOUT:\n", res.stdout)
print("STDERR:\n", res.stderr)
