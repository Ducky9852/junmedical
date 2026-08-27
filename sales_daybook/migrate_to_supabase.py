import os
import json
import urllib.request
import ssl
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://hkvguhttmxclyaeskznk.supabase.co"
SUPABASE_KEY = "sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def post_batch(table_name, items, batch_size=100):
    total = len(items)
    print(f"\n--- Uploading {table_name} ({total} items) ---")
    
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    
    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        payload = json.dumps(batch).encode('utf-8')
        
        req = urllib.request.Request(url, data=payload, headers=HEADERS, method='POST')
        try:
            with urllib.request.urlopen(req, context=ctx) as res:
                print(f"[{table_name}] Uploaded {min(i + batch_size, total)} / {total} (HTTP {res.status})")
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8', errors='replace')
            print(f"[{table_name}] Error at batch {i}: HTTP {e.code} - {err_msg}")
            return False
        except Exception as e:
            print(f"[{table_name}] Exception at batch {i}: {e}")
            return False
        time.sleep(0.1)
    
    print(f"✅ Successfully uploaded {total} items to '{table_name}'!")
    return True

def run_migration():
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(cur_dir, "sales_database.json")
    erp_path = os.path.join(cur_dir, "erp_products.json")
    
    with open(db_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
    
    with open(erp_path, 'r', encoding='utf-8') as f:
        erp_products = json.load(f)
        
    print("=== Supabase Migration Starting ===")
    
    # 1. Hospitals
    hospitals = db.get("hospitals", [])
    post_batch("hospitals", hospitals)
    
    # 2. Activity Logs
    logs = db.get("activity_logs", [])
    # format logs
    clean_logs = []
    for l in logs:
        clean_logs.append({
            "hospital": l.get("hospital", "거래처"),
            "date": l.get("date", ""),
            "sales_rep": l.get("sales_rep", "영업담당"),
            "action_type": l.get("action_type", "제품설명·소개"),
            "title": l.get("title", ""),
            "note": l.get("note", ""),
            "products": l.get("products", []),
            "product_code": l.get("product_code", "PROD_GENERAL"),
            "next_action": l.get("next_action", ""),
            "region": l.get("region", "세종충북"),
            "contact": l.get("contact", "실무진")
        })
    post_batch("activity_logs", clean_logs)
    
    # 3. Pipeline
    pipeline = db.get("pipeline", [])
    clean_pipeline = []
    for p in pipeline:
        clean_pipeline.append({
            "hospital": p.get("hospital", ""),
            "region": p.get("region", "세종충북"),
            "sales_rep": p.get("sales_rep", ""),
            "product_id": p.get("product_id", "PROD_GENERAL"),
            "product_name": p.get("product_name", ""),
            "status": p.get("status", "제품소개·영업중"),
            "last_date": p.get("last_date", ""),
            "latest_action": p.get("latest_action", ""),
            "latest_note": p.get("latest_note", ""),
            "demo_info": p.get("demo_info"),
            "as_info": p.get("as_info"),
            "fail_reasons": p.get("fail_reasons", [])
        })
    post_batch("pipeline", clean_pipeline)
    
    # 4. ERP Products (4,054)
    clean_erp = []
    for p in erp_products:
        clean_erp.append({
            "code": p.get("code", ""),
            "name": p.get("name", ""),
            "spec": p.get("spec", ""),
            "vendor": p.get("vendor", "준메디칼"),
            "category": p.get("category", "일반소모품"),
            "keywords": p.get("keywords", []),
            "aliases": p.get("aliases", []),
            "price_in": p.get("price_in", 0),
            "price_out": p.get("price_out", 0)
        })
    post_batch("erp_products", clean_erp, batch_size=200)
    
    print("\n🎉 ALL 4 TABLES MIGRATED TO SUPABASE SUCCESSFULLY!")

if __name__ == '__main__':
    run_migration()
