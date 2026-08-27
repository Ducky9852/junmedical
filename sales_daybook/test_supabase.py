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

# 1. Test OpenAPI schema endpoint
url = f"{supabase_url}/rest/v1/"
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx) as res:
        data = json.loads(res.read().decode('utf-8'))
        print("Connected to Supabase successfully!")
        print("API Title:", data.get('info', {}).get('title'))
        print("Existing Tables / Paths in REST API:", list(data.get('definitions', {}).keys()))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.read().decode('utf-8', errors='replace')}")
except Exception as e:
    print(f"Connection Error: {e}")
