import os
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

cur_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(cur_dir, "sales_database.json")
erp_path = os.path.join(cur_dir, "erp_products.json")

with open(db_path, 'r', encoding='utf-8') as f:
    db = json.load(f)

with open(erp_path, 'r', encoding='utf-8') as f:
    erp_list = json.load(f)

print(f"Total current activity logs: {len(db['activity_logs'])}")
print(f"Total current pipelines: {len(db['pipeline'])}")

# Analyze multi-product notes
PRODUCT_KEYWORDS = [
    ("소공포", "GROUP-SEJONG-SHEET", "[세종] 멸균 소공포 (MULTI USEFUL SHEET)"),
    ("하이겐트", "PROD_HYGENT", "[하이겐트] Hygent 수액세트/치료재료"),
    ("Hygent", "PROD_HYGENT", "[하이겐트] Hygent 수액세트/치료재료"),
    ("바이옵시", "PROD_BIOPSY", "일회용 펀치 생검기 (Punch Biopsy)"),
    ("펀치", "PROD_BIOPSY", "일회용 펀치 생검기 (Punch Biopsy)"),
    ("튤립", "PROD_TULIP", "듀얼 튤립 카테터 (Dual Tulip)"),
    ("엔지오", "ST-ANG-PR03", "Angio Kit 앤지오키트 (ST-ANG-PR03)"),
    ("BT350", "PROD_BT350", "태아심음측정기 BT-350"),
    ("bt350", "PROD_BT350", "태아심음측정기 BT-350"),
    ("좌욕기", "PROD_ZWAYOK", "병원용 자동 멸균 좌욕기"),
    ("스테이플러", "PROD_STAPLER", "일회용 스킨 스테이플러 & 리무버"),
    ("리무버", "PROD_STAPLER", "일회용 스킨 스테이플러 & 리무버"),
    ("트로카", "PROD_TROCAR", "복강경용 멸균 트로카 (Trocar)"),
    ("봉합사", "PROD_SUTURE", "외과용 흡수성/비흡수성 봉합사"),
]

split_candidates = []
for idx, log in enumerate(db['activity_logs']):
    text = (log.get('note', '') + " " + log.get('title', '')).strip()
    hosp = log.get('hospital', '')
    
    found_prods = set()
    for kw, p_id, p_name in PRODUCT_KEYWORDS:
        if kw.lower() in text.lower():
            found_prods.add((p_id, p_name))
            
    if len(found_prods) >= 2:
        split_candidates.append({
            "index": idx,
            "hospital": hosp,
            "date": log.get('date'),
            "sales_rep": log.get('sales_rep'),
            "title": log.get('title'),
            "note": log.get('note'),
            "products_found": list(found_prods)
        })

print(f"\nFound {len(split_candidates)} multi-product activity logs that can be split into separate entries!")
for c in split_candidates[:10]:
    print(f"\n- [{c['hospital']} | {c['date']} | {c['sales_rep']}]")
    print(f"  Note: {c['note']}")
    print(f"  Found Products: {[p[1] for p in c['products_found']]}")
