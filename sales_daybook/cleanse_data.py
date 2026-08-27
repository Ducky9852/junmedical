import zipfile
import csv
import io
import sys
import re
import json
from collections import defaultdict, Counter

sys.stdout.reconfigure(encoding='utf-8')

# Canonical Product Catalog
PRODUCT_CATALOG = [
    {
        "id": "PROD_ANGIO",
        "name": "ANGIO 시술용 키트 (PR03 / Adv.)",
        "category": "시술용 키트",
        "keywords": ["ANGIO", "엔지오", "안지오", "PR03", "시술용04", "ANGIO 시술용 키트"]
    },
    {
        "id": "PROD_PENKO",
        "name": "PENKO 서지패드 / 서포트 플레이트 / 서지소드",
        "category": "수술방 소모품",
        "keywords": ["PENKO", "펜코", "SURGI PAD", "SURGI SWORD", "서포트 플레이트", "서지패드", "서지소드", "보비패드"]
    },
    {
        "id": "PROD_EZQBOND",
        "name": "이지큐본드 (EG-Q BOND N)",
        "category": "조직접착제",
        "keywords": ["이지큐본드", "이지큐 본드", "EG-Q", "EZ-Q", "EzQbond", "EG-Q BOND N"]
    },
    {
        "id": "PROD_DVT",
        "name": "DVT SLEEVE (압박 슬리브 / 스타킹)",
        "category": "혈전예방",
        "keywords": ["DVT", "DVT SLEEVE", "슬리브", "암슬리브", "스타킹", "허벅지부분"]
    },
    {
        "id": "PROD_CUREFORM",
        "name": "큐어폼 (Cureform 드레싱)",
        "category": "창상피복재",
        "keywords": ["큐어폼", "Cureform", "Cureform 4x5cm", "Cureform 5x7cm"]
    },
    {
        "id": "PROD_VERICURE",
        "name": "베리큐어 로션 & 스프레이",
        "category": "스킨케어/보호",
        "keywords": ["베리큐어", "Vericure", "베리큐어 로션", "베리큐어 스프레이"]
    },
    {
        "id": "PROD_SCARNOS",
        "name": "스카노스겔 (Scarnos Gel)",
        "category": "흉터치료제",
        "keywords": ["스카노스", "스카노스겔", "Scarnos"]
    },
    {
        "id": "PROD_GYNECOLLA",
        "name": "가인콜라 (GYNE COLLA)",
        "category": "여성질환/콜라겐",
        "keywords": ["GYNE COLLA", "가인콜라", "GYNE"]
    },
    {
        "id": "PROD_LAPARO",
        "name": "복강경 & 자궁경 기구 / 아티센셜 트로카",
        "category": "수술기구",
        "keywords": ["복강경", "자궁경", "트로카", "아티센셜", "Bipolar", "Maryland", "Dissector"]
    },
    {
        "id": "PROD_ENSHOT",
        "name": "EN-Shot Biopsy 생검기구",
        "category": "생검용기구",
        "keywords": ["EN-Shot", "엔샷", "Biopsy", "생검", "생검포셉"]
    },
    {
        "id": "PROD_HYGENT",
        "name": "HYGENT (하이젠트 살균소독)",
        "category": "소독/방역",
        "keywords": ["HYGENT", "하이젠트", "하이겐트"]
    },
    {
        "id": "PROD_MINDRAY",
        "name": "마인드레이 장비 (Mindray 초음파/진단)",
        "category": "진단장비",
        "keywords": ["마인드레이", "Mindray"]
    },
    {
        "id": "PROD_EQUIP_AS",
        "name": "의료장비 A/S 및 수리 (Oxy9wave/BT350/올림푸스)",
        "category": "장비유지보수",
        "keywords": ["Oxy9wave", "BT350", "bt350", "b400", "올림푸스", "올림프스", "발판", "태아심전도", "장비수리"]
    },
    {
        "id": "PROD_GENERAL",
        "name": "일반 원내 소모품 (소공포/내시경바지/드레싱키트)",
        "category": "일반소모품",
        "keywords": ["소공포", "내시경바지", "내시경 바지", "드레싱키트", "드레싱", "소모품"]
    }
]

def extract_products(text, prod_col_text):
    matched_prods = []
    combined = f"{prod_col_text} {text}"
    
    for prod in PRODUCT_CATALOG:
        found = False
        for kw in prod["keywords"]:
            if re.search(re.escape(kw), combined, re.IGNORECASE):
                found = True
                break
        if found:
            matched_prods.append(prod)
            
    if not matched_prods:
        # Check if generic mention
        if prod_col_text.strip():
            clean_p = re.sub(r'\(https://[^\)]+\)', '', prod_col_text).strip()
            matched_prods.append({
                "id": "PROD_OTHER",
                "name": clean_p or "기타 제안 품목",
                "category": "기타",
                "keywords": []
            })
    return matched_prods

def extract_action_type(raw_action, text):
    if raw_action and raw_action in ['A/S·클레임', '샘플·데모', '제품설명·소개', '납품·설치', '견적제출', '관계관리']:
        return raw_action
    
    # Text mining
    if re.search(r'A/S|AS|에이에스|수리|불량|파손|고장|클레임|의뢰', text, re.IGNORECASE):
        return 'A/S·클레임'
    if re.search(r'데모|샘플|sample|demo|시연|회수|수거|써보|전달|테스트', text, re.IGNORECASE):
        return '샘플·데모'
    if re.search(r'납품|설치|입고|출고|발주|배송', text, re.IGNORECASE):
        return '납품·설치'
    if re.search(r'견적|단가|비용|가격|DC|할인', text, re.IGNORECASE):
        return '견적제출'
    if re.search(r'소개|카탈로그|카다록|브로셔|설명|디테일|안내', text, re.IGNORECASE):
        return '제품설명·소개'
    return '관계관리'

def extract_pipeline_status_and_failure(raw_status, action_type, text):
    # Detect failure or rejection or competitor delivery
    fail_reasons = []
    
    # Check competitor delivery first (e.g. '타사에서 납품', '타사 납품', '타업체 납품')
    if re.search(r'타사.*납품|타업체.*납품|타사에서\s*납품', text):
        fail_reasons.append("기존 거래처/경쟁사 선호")
        
    if re.search(r'가격|단가|비싸|금액', text) and re.search(r'어렵|힘들|안함|거절|반응|부담', text):
        fail_reasons.append("단가/가격 부담")
    if re.search(r'기존|타사|타업체|쓰던|고집|계약', text) and re.search(r'유지|사용|거절|안바꿈|어렵', text):
        if "기존 거래처/경쟁사 선호" not in fail_reasons:
            fail_reasons.append("기존 거래처/경쟁사 선호")
    if re.search(r'비급여', text) and re.search(r'거부|부담|어렵|안함', text):
        fail_reasons.append("비급여 품목 거부")
    if re.search(r'면담\s*안\s*됨|부재|만나지\s*못|응급\s*일정|바쁨', text):
        fail_reasons.append("의료진 부재/면담 불가")
    if re.search(r'불편|작다|거부|거절|사용\s*안|안함|취소|드랍|drop', text, re.IGNORECASE) or raw_status == '영업실패':
        if not fail_reasons:
            fail_reasons.append("의료진 거절/사용 불가 피드백")

    if fail_reasons:
        return "영업실패·보류", fail_reasons
    
    if action_type == 'A/S·클레임':
        return "A/S접수·처리", []
    if action_type == '샘플·데모' or re.search(r'샘플|데모|평가|회수|피드백', text):
        return "데모·샘플평가", []
    if action_type == '납품·설치' or re.search(r'납품|입고|사용중|정기', text):
        return "도입완료·납품", []
    if action_type == '견적제출':
        return "견적·의사결정", []
    if action_type == '제품설명·소개':
        return "제품소개·영업중", []
        
    return "관계관리·접촉", []

def clean_hospital_name(raw):
    clean = re.sub(r'\s*\(https://[^\)]+\)', '', raw).strip()
    clean = re.sub(r'^\(의\)|^\(의료법인\)|^\(사\)', '', clean).strip()
    return clean

# Read ZIP
zip_path = 'notion_data/ExportBlock-b14e7eb7-547c-47c1-aece-aae9b121b8fa-Part-1.zip'

with zipfile.ZipFile(zip_path, 'r') as zf:
    with zf.open('영업관리 3cbe476c01fb4d9f8d78f00cb9dc182a.csv') as f:
        text = f.read().decode('utf-8-sig')
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        raw_rows = list(reader)

print(f"Loaded {len(raw_rows)} raw records.")

hospitals_map = {}
products_map = {p["id"]: p for p in PRODUCT_CATALOG}
activity_logs = []
pipeline_deals = defaultdict(lambda: {
    "status": "관계관리·접촉",
    "last_date": "",
    "latest_action": "",
    "sales_rep": "",
    "fail_reasons": set(),
    "demo_info": None,
    "as_info": None,
    "history_count": 0,
    "latest_note": ""
})

for idx, r in enumerate(raw_rows):
    row = dict(zip(header, r))
    raw_hosp = row.get('거래처', '')
    hosp_name = clean_hospital_name(raw_hosp)
    if not hosp_name:
        continue
        
    region = row.get('지역그룹', '').strip() or '기타'
    raw_contact = row.get('거래처 담당자', '').strip()
    sales_rep = row.get('담당자', '').strip()
    date = row.get('영업일', '').strip()
    title = row.get('영업 내용', '').strip()
    biz_note = row.get('업무 내용', '').strip()
    raw_prod = row.get('영업 제품', '').strip()
    raw_action = row.get('Action_Type', '').strip()
    raw_status = row.get('상태', '').strip()
    new_or_existing = row.get('신규or기존', '').strip()
    
    full_text = f"{title} {biz_note}"
    
    # Parse items
    matched_prods = extract_products(full_text, raw_prod)
    action_type = extract_action_type(raw_action, full_text)
    deal_status, fail_reasons = extract_pipeline_status_and_failure(raw_status, action_type, full_text)
    
    # Store Hospital Master
    if hosp_name not in hospitals_map:
        hospitals_map[hosp_name] = {
            "name": hosp_name,
            "region": region,
            "contacts": set(),
            "sales_reps": set(),
            "type": new_or_existing or "기존 병원",
            "last_activity_date": date,
            "total_logs": 0
        }
    
    if raw_contact:
        hospitals_map[hosp_name]["contacts"].add(raw_contact)
    if sales_rep:
        hospitals_map[hosp_name]["sales_reps"].add(sales_rep)
    hospitals_map[hosp_name]["total_logs"] += 1
    if date > hospitals_map[hosp_name]["last_activity_date"]:
        hospitals_map[hosp_name]["last_activity_date"] = date
        
    # Activity Log item
    log_id = f"LOG_{idx+1}"
    prod_names = [p["name"] for p in matched_prods]
    
    activity_log = {
        "id": log_id,
        "date": date,
        "hospital": hosp_name,
        "region": region,
        "sales_rep": sales_rep,
        "contact": raw_contact,
        "action_type": action_type,
        "deal_status": deal_status,
        "products": prod_names,
        "title": title,
        "note": biz_note,
        "fail_reasons": fail_reasons
    }
    activity_logs.append(activity_log)
    
    # Update Pipeline Deals
    for prod in matched_prods:
        deal_key = f"{hosp_name}___{prod['id']}"
        deal = pipeline_deals[deal_key]
        deal["hospital"] = hosp_name
        deal["product_id"] = prod["id"]
        deal["product_name"] = prod["name"]
        deal["product_category"] = prod["category"]
        deal["region"] = region
        deal["sales_rep"] = sales_rep or deal["sales_rep"]
        deal["history_count"] += 1
        
        if date >= deal["last_date"]:
            deal["last_date"] = date
            deal["status"] = deal_status
            deal["latest_action"] = action_type
            deal["latest_note"] = biz_note or title
            
        if fail_reasons:
            deal["fail_reasons"].update(fail_reasons)
            deal["status"] = "영업실패·보류"
            
        if action_type == '샘플·데모' or '데모' in full_text or '샘플' in full_text:
            deal["demo_info"] = {
                "date": date,
                "note": (title + " " + biz_note)[:100],
                "status": "회수완료" if "회수" in full_text or "수거" in full_text else "평가진행중"
            }
            if deal["status"] != "영업실패·보류" and deal["status"] != "도입완료·납품":
                deal["status"] = "데모·샘플평가"
                
        if action_type == 'A/S·클레임' or '수리' in full_text or 'AS' in full_text:
            deal["as_info"] = {
                "date": date,
                "note": (title + " " + biz_note)[:100],
                "status": "처리완료" if "완료" in full_text else "접수/진행중"
            }
            if deal["status"] != "영업실패·보류":
                deal["status"] = "A/S접수·처리"

print(f"Total Clean Hospitals: {len(hospitals_map)}")
print(f"Total Pipeline Deals: {len(pipeline_deals)}")
print(f"Total Structured Activity Logs: {len(activity_logs)}")

# Convert sets to lists for JSON serialization
hospitals_list = []
for h_name, h_data in hospitals_map.items():
    h_data["contacts"] = sorted(list(h_data["contacts"]))
    h_data["sales_reps"] = sorted(list(h_data["sales_reps"]))
    hospitals_list.append(h_data)

pipeline_list = []
for d_key, d_data in pipeline_deals.items():
    d_data["fail_reasons"] = sorted(list(d_data["fail_reasons"]))
    pipeline_list.append(d_data)

# Sort
hospitals_list.sort(key=lambda x: (x["region"], x["name"]))
activity_logs.sort(key=lambda x: x["date"], reverse=True)
pipeline_list.sort(key=lambda x: (x["product_id"], x["hospital"]))

# Output JSON bundle for Web App
bundle = {
    "products": PRODUCT_CATALOG,
    "hospitals": hospitals_list,
    "pipeline": pipeline_list,
    "activity_logs": activity_logs,
    "stats": {
        "total_logs": len(activity_logs),
        "total_hospitals": len(hospitals_list),
        "total_deals": len(pipeline_list),
        "active_demos": len([d for d in pipeline_list if d.get("demo_info") and d["demo_info"]["status"] == "평가진행중"]),
        "active_as": len([d for d in pipeline_list if d.get("as_info") and d["as_info"]["status"] == "접수/진행중"]),
        "won_deals": len([d for d in pipeline_list if d["status"] == "도입완료·납품"]),
        "lost_deals": len([d for d in pipeline_list if d["status"] == "영업실패·보류"]),
        "eval_deals": len([d for d in pipeline_list if d["status"] == "데모·샘플평가"]),
        "progress_deals": len([d for d in pipeline_list if d["status"] in ["제품소개·영업중", "견적·의사결정", "관계관리·접촉"]])
    }
}

with open('sales_database.json', 'w', encoding='utf-8') as f:
    json.dump(bundle, f, ensure_ascii=False, indent=2)

with open('sales_database.js', 'w', encoding='utf-8') as f:
    f.write("window.SALES_DB = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n")

print("\n=== Data Cleansing Complete ===")
print("Summary Stats:", bundle["stats"])
