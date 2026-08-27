import urllib.request
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')

supabase_url = "https://hkvguhttmxclyaeskznk.supabase.co"
supabase_key = "sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json"
}

# Test querying a table
for tbl in ["hospitals", "activity_logs", "pipeline", "erp_products", "sales_logs"]:
    url = f"{supabase_url}/rest/v1/{tbl}?select=*&limit=1"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx) as res:
            data = json.loads(res.read().decode('utf-8'))
            print(f"[Table Exists] {tbl}: {len(data)} rows")
    except urllib.error.HTTPError as e:
        print(f"[Table Missing/Error] {tbl}: HTTP {e.code} - {e.read().decode('utf-8', errors='replace')}")
    except Exception as e:
        print(f"[Error] {tbl}: {e}")
