import os
import json
import urllib.request
import ssl
import sys

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

# 8 SKUs of Sejong Multi Useful Sheet
SEJONG_SHEET_SKUS = [
    {
        "code": "SD-GUDT0608U",
        "name": "[세종] 멸균소공포 U-Type (60*60cm / Hole 8cm)",
        "spec": "60*60cm, Hole 8cm, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "유틸리티", "U-Type", "60*60", "8cm", "BM5104SJ", "세종", "신경차단술", "생검"],
        "aliases": ["소공포 60*60 8cm", "소공포 8cm", "소공포 u타입 8", "세종 소공포 0608U"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GUDT0610U",
        "name": "[세종] 멸균소공포 U-Type (60*60cm / Hole 10cm)",
        "spec": "60*60cm, Hole 10cm, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "유틸리티", "U-Type", "60*60", "10cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 60*60 10cm", "소공포 10cm", "소공포 u타입 10", "세종 소공포 0610U"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GUDT0912U",
        "name": "[세종] 멸균소공포 U-Type (90*90cm / Hole 12cm)",
        "spec": "90*90cm, Hole 12cm, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "유틸리티", "U-Type", "90*90", "12cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 90*90 12cm", "소공포 12cm", "소공포 u타입 12", "세종 소공포 0912U", "대형소공포"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GUDT0914U",
        "name": "[세종] 멸균소공포 U-Type (90*90cm / Hole 14cm)",
        "spec": "90*90cm, Hole 14cm, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "유틸리티", "U-Type", "90*90", "14cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 90*90 14cm", "소공포 14cm", "소공포 u타입 14", "세종 소공포 0914U"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GSHD0608C",
        "name": "[세종] 멸균소공포 C-Type (60*60cm / Hole 8cm)",
        "spec": "60*60cm, Hole 8cm, 센터테이프, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "센터테이프", "C-Type", "60*60", "8cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 c타입 8", "소공포 센터테이프 8", "세종 소공포 0608C"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GSHD0610C",
        "name": "[세종] 멸균소공포 C-Type (60*60cm / Hole 10cm)",
        "spec": "60*60cm, Hole 10cm, 센터테이프, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "센터테이프", "C-Type", "60*60", "10cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 c타입 10", "소공포 센터테이프 10", "세종 소공포 0610C"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GSHD0912C",
        "name": "[세종] 멸균소공포 C-Type (90*90cm / Hole 12cm)",
        "spec": "90*90cm, Hole 12cm, 센터테이프, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "센터테이프", "C-Type", "90*90", "12cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 c타입 12", "소공포 센터테이프 12", "세종 소공포 0912C"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    },
    {
        "code": "SD-GSHD0914C",
        "name": "[세종] 멸균소공포 C-Type (90*90cm / Hole 14cm)",
        "spec": "90*90cm, Hole 14cm, 센터테이프, 100ea/box, 비급여 BM5104SJ",
        "vendor": "세종헬스케어",
        "category": "외과용드레이프",
        "keywords": ["소공포", "멸균소공포", "드레이프", "센터테이프", "C-Type", "90*90", "14cm", "BM5104SJ", "세종"],
        "aliases": ["소공포 c타입 14", "소공포 센터테이프 14", "세종 소공포 0914C"],
        "parent_group": "GROUP-SEJONG-SHEET",
        "edi": "BM5104SJ"
    }
]

# Parent Product Group Master
PARENT_GROUP_PRODUCT = {
    "id": "GROUP-SEJONG-SHEET",
    "code": "GROUP-SEJONG-SHEET",
    "name": "[세종] 멸균 소공포 (MULTI USEFUL SHEET)",
    "spec": "U-Type/C-Type 8개 규격 통합 (비급여: BM5104SJ)",
    "vendor": "세종헬스케어",
    "category": "외과용드레이프",
    "edi": "BM5104SJ",
    "keywords": ["소공포", "멸균소공포", "세종소공포", "드레이프", "MULTI USEFUL SHEET", "BM5104SJ", "유틸리티", "센터테이프"],
    "aliases": ["소공포", "세종 소공포", "멸균 소공포", "일회용 소공포", "외과용 드레이프", "외과용소공포"],
    "is_group": True,
    "skus": SEJONG_SHEET_SKUS
}

def update_local_and_supabase():
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    erp_json_path = os.path.join(cur_dir, "erp_products.json")
    db_json_path = os.path.join(cur_dir, "sales_database.json")
    db_js_path = os.path.join(cur_dir, "sales_database.js")
    
    # 1. Update erp_products.json
    with open(erp_json_path, 'r', encoding='utf-8') as f:
        erp_list = json.load(f)
    
    # Add parent group product & 8 SKUs if not existing
    code_map = {p['code']: p for p in erp_list if 'code' in p}
    
    if PARENT_GROUP_PRODUCT['code'] not in code_map:
        erp_list.insert(0, PARENT_GROUP_PRODUCT)
    else:
        code_map[PARENT_GROUP_PRODUCT['code']].update(PARENT_GROUP_PRODUCT)
        
    for sku in SEJONG_SHEET_SKUS:
        if sku['code'] not in code_map:
            erp_list.insert(1, sku)
        else:
            code_map[sku['code']].update(sku)
            
    with open(erp_json_path, 'w', encoding='utf-8') as f:
        json.dump(erp_list, f, ensure_ascii=False, indent=2)
    print(f"Updated erp_products.json with {len(SEJONG_SHEET_SKUS)} SKUs and Parent Group!")

    # 2. Update sales_database.json
    with open(db_json_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    # Check db['products']
    db_prod_map = {p.get('id', p.get('code')): p for p in db.get('products', [])}
    if 'GROUP-SEJONG-SHEET' not in db_prod_map:
        db.setdefault('products', []).insert(0, PARENT_GROUP_PRODUCT)
    for sku in SEJONG_SHEET_SKUS:
        sku_prod = dict(sku)
        sku_prod['id'] = sku['code']
        if sku['code'] not in db_prod_map:
            db['products'].insert(1, sku_prod)

    # Remap existing 55 "소공포" pipelines to GROUP-SEJONG-SHEET
    remap_count = 0
    for deal in db.get('pipeline', []):
        p_name = deal.get('product_name', '')
        p_id = deal.get('product_id', '')
        if '소공포' in p_name or p_id in ['GROUP-SEJONG-SHEET', 'PROD_SO_GONG_PO', 'SD-GUDT0608U']:
            deal['product_id'] = 'GROUP-SEJONG-SHEET'
            deal['product_name'] = '[세종] 멸균 소공포 (MULTI USEFUL SHEET)'
            remap_count += 1
            
    print(f"Remapped {remap_count} deals in pipeline to '[세종] 멸균 소공포' parent group!")

    # Save local DB
    with open(db_json_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    with open(db_js_path, 'w', encoding='utf-8') as f:
        f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

    # 3. Upload to Supabase erp_products & pipeline
    supabase_erp_items = []
    for item in [PARENT_GROUP_PRODUCT] + SEJONG_SHEET_SKUS:
        supabase_erp_items.append({
            "code": item["code"],
            "name": item["name"],
            "spec": item["spec"],
            "vendor": item["vendor"],
            "category": item["category"],
            "keywords": item["keywords"],
            "aliases": item["aliases"],
            "price_in": 0,
            "price_out": 0
        })
        
    url_erp = f"{SUPABASE_URL}/rest/v1/erp_products"
    req_erp = urllib.request.Request(url_erp, data=json.dumps(supabase_erp_items).encode('utf-8'), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req_erp, context=ctx) as res:
            print("Uploaded Sejong Sheet SKUs to Supabase erp_products successfully! HTTP", res.status)
    except Exception as e:
        print("Supabase erp_products error:", e)

    # Update pipeline in Supabase
    url_pipe = f"{SUPABASE_URL}/rest/v1/pipeline"
    pipe_payload = []
    for d in db.get('pipeline', []):
        pipe_payload.append({
            "hospital": d.get("hospital"),
            "region": d.get("region", "세종충북"),
            "sales_rep": d.get("sales_rep"),
            "product_id": d.get("product_id"),
            "product_name": d.get("product_name"),
            "status": d.get("status"),
            "last_date": d.get("last_date"),
            "latest_action": d.get("latest_action"),
            "latest_note": d.get("latest_note"),
            "demo_info": d.get("demo_info"),
            "as_info": d.get("as_info"),
            "fail_reasons": d.get("fail_reasons", [])
        })
        
    # Post in batches of 100
    for i in range(0, len(pipe_payload), 100):
        batch = pipe_payload[i:i+100]
        req_pipe = urllib.request.Request(url_pipe, data=json.dumps(batch).encode('utf-8'), headers=HEADERS, method='POST')
        try:
            with urllib.request.urlopen(req_pipe, context=ctx) as res:
                pass
        except Exception as e:
            print(f"Pipeline batch {i} error:", e)
            
    print(f"Uploaded {len(pipe_payload)} pipelines to Supabase successfully!")

if __name__ == '__main__':
    update_local_and_supabase()
