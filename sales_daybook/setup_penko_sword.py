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

# 10 SKUs of Penko Surgi Sword (5 DF non-pay, 5 Strip pay)
PENKO_SWORD_SKUS = [
    # 1. DF Series (비급여: BM5131JP)
    {
        "code": "PK-10DM02",
        "name": "[펜코] DF 서지 소드 10번 (Blade 7.2*29.5mm / Df 5*10cm)",
        "spec": "Blade 7.2*29.5mm, Df 5*10cm, 10ea/box, 비급여 BM5131JP",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "DF소드", "10번", "PK-10DM02", "안전메스", "수술칼", "BM5131JP", "비급여"],
        "aliases": ["펜코소드 10번", "서지소드 10번", "펜코 10번 df", "PK10DM02"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "BM5131JP"
    },
    {
        "code": "PK-11DM02",
        "name": "[펜코] DF 서지 소드 11번 (Blade 5.7*41.2mm / Df 5*10cm)",
        "spec": "Blade 5.7*41.2mm, Df 5*10cm, 10ea/box, 비급여 BM5131JP",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "DF소드", "11번", "PK-11DM02", "안전메스", "수술칼", "BM5131JP", "비급여"],
        "aliases": ["펜코소드 11번", "서지소드 11번", "펜코 11번 df", "PK11DM02"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "BM5131JP"
    },
    {
        "code": "PK-12DM02",
        "name": "[펜코] DF 서지 소드 12번 (Blade 8.2*38.5mm / Df 5*10cm)",
        "spec": "Blade 8.2*38.5mm, Df 5*10cm, 10ea/box, 비급여 BM5131JP",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "DF소드", "12번", "PK-12DM02", "안전메스", "수술칼", "BM5131JP", "비급여"],
        "aliases": ["펜코소드 12번", "서지소드 12번", "펜코 12번 df", "PK12DM02"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "BM5131JP"
    },
    {
        "code": "PK-15DM02",
        "name": "[펜코] DF 서지 소드 15번 (Blade 3.3*37.1mm / Df 5*10cm)",
        "spec": "Blade 3.3*37.1mm, Df 5*10cm, 10ea/box, 비급여 BM5131JP",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "DF소드", "15번", "PK-15DM02", "안전메스", "수술칼", "BM5131JP", "비급여"],
        "aliases": ["펜코소드 15번", "서지소드 15번", "펜코 15번 df", "PK15DM02"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "BM5131JP"
    },
    {
        "code": "PK-20DM02",
        "name": "[펜코] DF 서지 소드 20번 (Blade 9.4*46.2mm / Df 5*10cm)",
        "spec": "Blade 9.4*46.2mm, Df 5*10cm, 10ea/box, 비급여 BM5131JP",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "DF소드", "20번", "PK-20DM02", "안전메스", "수술칼", "BM5131JP", "비급여"],
        "aliases": ["펜코소드 20번", "서지소드 20번", "펜코 20번 df", "PK20DM02"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "BM5131JP"
    },

    # 2. STRIP Series (급여: B3130125)
    {
        "code": "PK-10DMS",
        "name": "[펜코] STRIP 서지 소드 10번 (Blade 7.2*29.5mm / Strip 2.5*10cm)",
        "spec": "Blade 7.2*29.5mm, Strip 2.5*10cm, 10ea/box, 급여 B3130125",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "스트립소드", "10번", "PK-10DMS", "안전메스", "수술칼", "B3130125", "급여"],
        "aliases": ["스트립 서지소드 10번", "펜코 스트립 10번", "PK10DMS"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "B3130125"
    },
    {
        "code": "PK-11DMS",
        "name": "[펜코] STRIP 서지 소드 11번 (Blade 5.7*41.2mm / Strip 2.5*10cm)",
        "spec": "Blade 5.7*41.2mm, Strip 2.5*10cm, 10ea/box, 급여 B3130125",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "스트립소드", "11번", "PK-11DMS", "안전메스", "수술칼", "B3130125", "급여"],
        "aliases": ["스트립 서지소드 11번", "펜코 스트립 11번", "PK11DMS"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "B3130125"
    },
    {
        "code": "PK-12DMS",
        "name": "[펜코] STRIP 서지 소드 12번 (Blade 8.2*38.5mm / Strip 2.5*10cm)",
        "spec": "Blade 8.2*38.5mm, Strip 2.5*10cm, 10ea/box, 급여 B3130125",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "스트립소드", "12번", "PK-12DMS", "안전메스", "수술칼", "B3130125", "급여"],
        "aliases": ["스트립 서지소드 12번", "펜코 스트립 12번", "PK12DMS"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "B3130125"
    },
    {
        "code": "PK-15DMS",
        "name": "[펜코] STRIP 서지 소드 15번 (Blade 3.3*37.1mm / Strip 2.5*10cm)",
        "spec": "Blade 3.3*37.1mm, Strip 2.5*10cm, 10ea/box, 급여 B3130125",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "스트립소드", "15번", "PK-15DMS", "안전메스", "수술칼", "B3130125", "급여"],
        "aliases": ["스트립 서지소드 15번", "펜코 스트립 15번", "PK15DMS"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "B3130125"
    },
    {
        "code": "PK-20DMS",
        "name": "[펜코] STRIP 서지 소드 20번 (Blade 9.4*46.2mm / Strip 2.5*10cm)",
        "spec": "Blade 9.4*46.2mm, Strip 2.5*10cm, 10ea/box, 급여 B3130125",
        "vendor": "펜타스코리아",
        "category": "수술용칼/안전메스",
        "keywords": ["펜코", "펜코소드", "서지소드", "스트립소드", "20번", "PK-20DMS", "안전메스", "수술칼", "B3130125", "급여"],
        "aliases": ["스트립 서지소드 20번", "펜코 스트립 20번", "PK20DMS"],
        "parent_group": "GROUP-PENKO-SWORD",
        "edi": "B3130125"
    }
]

# Parent Product Group Master for Penko Surgi Sword
PARENT_GROUP_PENKO_SWORD = {
    "id": "GROUP-PENKO-SWORD",
    "code": "GROUP-PENKO-SWORD",
    "name": "[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)",
    "spec": "DF(비급여: BM5131JP) 5종 + STRIP(급여: B3130125) 5종 10개 규격 통합",
    "vendor": "펜타스코리아",
    "category": "수술용칼/안전메스",
    "edi": "비급여 BM5131JP / 급여 B3130125",
    "keywords": ["펜코", "펜코소드", "서지소드", "펜코나이프", "펜코나이프", "안전메스", "수술용칼", "SURGI SWORD", "PENTAS", "BM5131JP", "B3130125"],
    "aliases": ["펜코소드", "서지소드", "펜코나이프", "펜코 나이프", "펜코 디에프", "펜코 스트립", "펜코 메스", "펜코 칼"],
    "is_group": True,
    "skus": PENKO_SWORD_SKUS
}

def update_penko_sword():
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    erp_json_path = os.path.join(cur_dir, "erp_products.json")
    db_json_path = os.path.join(cur_dir, "sales_database.json")
    db_js_path = os.path.join(cur_dir, "sales_database.js")
    
    # 1. Update erp_products.json
    with open(erp_json_path, 'r', encoding='utf-8') as f:
        erp_list = json.load(f)
        
    code_map = {p['code']: p for p in erp_list if 'code' in p}
    
    if PARENT_GROUP_PENKO_SWORD['code'] not in code_map:
        erp_list.insert(0, PARENT_GROUP_PENKO_SWORD)
    else:
        code_map[PARENT_GROUP_PENKO_SWORD['code']].update(PARENT_GROUP_PENKO_SWORD)
        
    for sku in PENKO_SWORD_SKUS:
        if sku['code'] not in code_map:
            erp_list.insert(1, sku)
        else:
            code_map[sku['code']].update(sku)
            
    with open(erp_json_path, 'w', encoding='utf-8') as f:
        json.dump(erp_list, f, ensure_ascii=False, indent=2)
    print(f"Updated erp_products.json with {len(PENKO_SWORD_SKUS)} Penko SKUs and Parent Group!")

    # 2. Update sales_database.json
    with open(db_json_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    # Check db['products']
    db_prod_map = {p.get('id', p.get('code')): p for p in db.get('products', [])}
    if 'GROUP-PENKO-SWORD' not in db_prod_map:
        db.setdefault('products', []).insert(0, PARENT_GROUP_PENKO_SWORD)
    for sku in PENKO_SWORD_SKUS:
        sku_prod = dict(sku)
        sku_prod['id'] = sku['code']
        if sku['code'] not in db_prod_map:
            db['products'].insert(1, sku_prod)

    # Remap existing Penko / Surgi Sword pipelines to GROUP-PENKO-SWORD
    penko_remap_count = 0
    for deal in db.get('pipeline', []):
        p_name = deal.get('product_name', '')
        p_id = deal.get('product_id', '')
        if any(kw in p_name.lower() or kw in p_id.lower() for kw in ['펜코', 'penko', '서지소드', 'surgi sword', 'surgi', 'sword', '나이프']):
            deal['product_id'] = 'GROUP-PENKO-SWORD'
            deal['product_name'] = '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'
            penko_remap_count += 1
            
    print(f"Remapped {penko_remap_count} deals in pipeline to '[펜코] 서지 소드' parent group!")

    # Save local DB
    with open(db_json_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    with open(db_js_path, 'w', encoding='utf-8') as f:
        f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

    # 3. Upload to Supabase erp_products & pipeline
    supabase_erp_items = []
    for item in [PARENT_GROUP_PENKO_SWORD] + PENKO_SWORD_SKUS:
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
            print("Uploaded Penko Sword SKUs to Supabase erp_products successfully! HTTP", res.status)
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
    update_penko_sword()
