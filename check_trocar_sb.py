import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

url_base = 'https://hkvguhttmxclyaeskznk.supabase.co/rest/v1/'
key = 'sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ'

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Range': '0-9999'
}

req = urllib.request.Request(f"{url_base}pipeline?product_id=eq.101.011A", headers=headers)
with urllib.request.urlopen(req) as res:
    trocar_deals = json.load(res)

print(f"📊 Supabase 101.011A 잔존 딜 건수: {len(trocar_deals)}")
for t in trocar_deals:
    print(f"ID: {t.get('id')} | Hosp: [{t.get('hospital')}] | Status: {t.get('status')} | Note: {(t.get('latest_note') or '')[:50]}")
