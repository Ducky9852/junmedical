import json
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

# 1. Hospital Canonical Normalization Mapping Rules
HOSPITAL_NORMALIZATION_MAP = {
    # 청주 다나여성
    '다나여성': '청주 다나여성병원',
    '다나여성병원': '청주 다나여성병원',
    '청주 다나여성': '청주 다나여성병원',
    '청주 다나여성병원': '청주 다나여성병원',
    '청주 다나병원': '청주 다나여성병원',

    # 청주 닥터연여성
    '닥터연여성': '청주 닥터연여성산부인과',
    '닥터연여성산부인과': '청주 닥터연여성산부인과',
    '청주 닥터연여성': '청주 닥터연여성산부인과',
    '청주 닥터연여성산부인과': '청주 닥터연여성산부인과',
    '청주 닥터연여성의원': '청주 닥터연여성산부인과',

    # 청주 마디사랑
    '마디사랑': '청주 마디사랑병원',
    '마디사랑병원': '청주 마디사랑병원',
    '청주 마디사랑': '청주 마디사랑병원',
    '청주 마디사랑병원': '청주 마디사랑병원',

    # 청주 프라우삼성
    '프라우산부인과': '청주 프라우삼성산부인과',
    '프라우삼성': '청주 프라우삼성산부인과',
    '청주 프라우': '청주 프라우삼성산부인과',
    '청주 프라우산부인과': '청주 프라우삼성산부인과',
    '청주 프라우삼성': '청주 프라우삼성산부인과',
    '청주 프라우삼성산부인과': '청주 프라우삼성산부인과',

    # 청주 방서미즈닥터
    '방서미즈닥터': '청주 방서미즈닥터산부인과',
    '방서미스닥터': '청주 방서미즈닥터산부인과',
    '청주 방서미스닥터': '청주 방서미즈닥터산부인과',
    '청주 방서미즈닥터': '청주 방서미즈닥터산부인과',
    '청주 방서미즈닥터병원': '청주 방서미즈닥터산부인과',
    '청주 방서미즈맘': '청주 방서미즈닥터산부인과',

    # 청주 아산웰마취통증
    '아산웰마취': '청주 아산웰마취통증의학과',
    '아산웰마취통증': '청주 아산웰마취통증의학과',
    '청주 아산웰마취': '청주 아산웰마취통증의학과',
    '청주 아산웰마취통증': '청주 아산웰마취통증의학과',
    '청주 아산웰통증': '청주 아산웰마취통증의학과',

    # 청주 씨앤씨재활병원
    '씨앤씨 재활병원': '청주 씨앤씨재활병원',
    '씨앤씨병원': '청주 씨앤씨재활병원',
    '청주 cnc 재활병원': '청주 씨앤씨재활병원',
    '청주 cnc재활': '청주 씨앤씨재활병원',
    '청주 씨엔씨재활': '청주 씨앤씨재활병원',

    # 유항외과 계열
    '가경유항외과': '청주 가경유항외과',
    '청주 가경유항외과': '청주 가경유항외과',
    '율량 유항외과': '청주 율량유항외과',
    '청주 율량유항외과': '청주 율량유항외과',
    '유항': '청주 유항외과',
    '유항외과': '청주 유항외과',
    '청주 유항외과': '청주 유항외과',

    # 하임브릿지
    '하임브릿지': '청주 하임브릿지정형외과',
    '하임브릿지정형외과': '청주 하임브릿지정형외과',
    '청주 하임브릿지정형외과': '청주 하임브릿지정형외과',

    # 한기정산부인과
    '한기정': '제천 한기정산부인과',
    '한기정산부인과': '제천 한기정산부인과',
    '제천 한기정산부인과': '제천 한기정산부인과',

    # 해피맘산부인과
    '해피맘': '청주 해피맘산부인과',
    '해피맘산부인과': '청주 해피맘산부인과',
    '청주 해피맘산부인과': '청주 해피맘산부인과',

    # 연세미즈산부인과
    '연세미즈': '제천 연세미즈산부인과',
    '연세미즈산부인과': '제천 연세미즈산부인과',
    '제전 연세미즈산부인과': '제천 연세미즈산부인과',
    '제천연세미즈산부인과': '제천 연세미즈산부인과',

    # 오창 계열
    '오창 미즈': '오창 미즈산부인과',
    '오창 미즈산부인과': '오창 미즈산부인과',
    '오창 호수h': '오창 호수병원',
    '오창 중앙병원': '오창 호수병원',
    '오창호수병원': '오창 호수병원',

    # 천안 계열
    '천안본정형외과': '천안 본정형외과병원',
    '천안 본정형외과병원': '천안 본정형외과병원',
    '21세기병원': '천안 21세기병원',
    '천안 21세기 병원': '천안 21세기병원',
    '청주21세기병원': '청주 21세기병원',
    '평택21세기 병원': '평택 21세기병원',

    # 기타 중복 정리
    '세종엔케이': '세종엔케이병원',
    '세종엔케이병원': '세종엔케이병원',
    '영동 영동병원': '영동병원',
    '영동병원': '영동병원',
    '충주 세종병원': '충주 세종정형외과',
    '충주 세종정형외과': '충주 세종정형외과',
    '진천 중앙병원': '진천 중앙제일병원',
    '진천 중앙제일병원': '진천 중앙제일병원',
    '자모산부인과': '청주 자모산부인과',
    '청주자모산부인과': '청주 자모산부인과',
    '금왕연합': '음성 금왕연합정형외과',
    '음성 금왕연합정형외과': '음성 금왕연합정형외과',
    '마이크로병원': '청주 마이크로병원',
    '청주 마이크로병원': '청주 마이크로병원',
    '쉬즈산부인과': '청주 쉬즈산부인과',
    '청주 쉬즈산부인과': '청주 쉬즈산부인과',
    '카톨릭병원': '청주 카톨릭병원',
    '청주 카톨릭병원': '청주 카톨릭병원',
    '프라임병원': '청주 프라임병원',
    '청주프라임병원': '청주 프라임병원',
    '정성내과': '청주 정성내과',
    '청주 정성내과': '청주 정성내과',
    '영훈의료재단유성선병원': '영훈의료재단 유성선병원',
    '유성선병원': '영훈의료재단 유성선병원',
    '충주의료원': '충청북도 충주의료원',
    '청주의료원': '충청북도 청주의료원',
    '청주 한국병원': '청주 한국병원',
    '청주 하나병원': '청주 하나병원',
    '천안우리병원': '천안우리병원'
}

def normalize_hospital_name(raw_name):
    if not raw_name:
        return '기타 거래처'
    raw = raw_name.strip()
    if raw in HOSPITAL_NORMALIZATION_MAP:
        return HOSPITAL_NORMALIZATION_MAP[raw]
    # Check partial
    for k, v in HOSPITAL_NORMALIZATION_MAP.items():
        if raw == k:
            return v
    return raw

# 2. Load DB
with open('sales_database.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

print(f"Original Hospitals: {len(db['hospitals'])}")
print(f"Original Pipeline Deals: {len(db['pipeline'])}")
print(f"Original Logs: {len(db['activity_logs'])}")

# 3. Normalize Logs
for log in db['activity_logs']:
    log['hospital'] = normalize_hospital_name(log['hospital'])

# 4. Normalize and Merge Pipeline Deals
merged_pipeline = {}
for deal in db['pipeline']:
    norm_hosp = normalize_hospital_name(deal['hospital'])
    deal['hospital'] = norm_hosp
    
    key = f"{norm_hosp}___{deal['product_id']}"
    if key not in merged_pipeline:
        merged_pipeline[key] = deal
    else:
        existing = merged_pipeline[key]
        # Merge info (take latest date & most active status)
        if deal['last_date'] >= existing['last_date']:
            existing['last_date'] = deal['last_date']
            existing['latest_action'] = deal['latest_action']
            existing['latest_note'] = deal['latest_note']
        # If one has demo, keep it
        if deal.get('demo_info'):
            existing['demo_info'] = deal['demo_info']
        if deal.get('as_info'):
            existing['as_info'] = deal['as_info']
        if deal.get('fail_reasons'):
            for fr in deal['fail_reasons']:
                if fr not in existing.setdefault('fail_reasons', []):
                    existing['fail_reasons'].append(fr)
        existing['history_count'] = existing.get('history_count', 1) + 1

db['pipeline'] = list(merged_pipeline.values())

# 5. Rebuild Hospitals Master from Normalized Logs & Pipeline
hospitals_map = {}
for log in db['activity_logs']:
    h_name = log['hospital']
    if h_name not in hospitals_map:
        hospitals_map[h_name] = {
            "name": h_name,
            "region": log.get('region', '세종충북'),
            "sales_rep": log.get('sales_rep', '영업담당'),
            "key_doctor": log.get('contact', '원장/과장'),
            "status": "활동병원",
            "last_visit": log.get('date', '2026/01/01'),
            "total_logs": 0,
            "demo_count": 0,
            "won_count": 0,
            "as_count": 0,
            "fail_count": 0,
            "products_active": []
        }
    h = hospitals_map[h_name]
    h['total_logs'] += 1
    if log.get('date', '') > h['last_visit']:
        h['last_visit'] = log['date']
    if log.get('sales_rep') and not h['sales_rep']:
        h['sales_rep'] = log['sales_rep']
    if log.get('contact') and h['key_doctor'] == '원장/과장':
        h['key_doctor'] = log['contact']

# Update hospital status counts from pipeline
for deal in db['pipeline']:
    h_name = deal['hospital']
    if h_name in hospitals_map:
        h = hospitals_map[h_name]
        if deal['product_name'] not in h['products_active']:
            h['products_active'].append(deal['product_name'])
        if deal['status'] == '도입완료·납품':
            h['won_count'] += 1
        elif deal['status'] == '데모·샘플평가':
            h['demo_count'] += 1
        elif deal['status'] == 'A/S접수·처리':
            h['as_count'] += 1
        elif deal['status'] == '영업실패·보류':
            h['fail_count'] += 1

db['hospitals'] = sorted(list(hospitals_map.values()), key=lambda x: x['name'])

# Update Stats
won_count = len([d for d in db['pipeline'] if d['status'] == '도입완료·납품'])
demo_count = len([d for d in db['pipeline'] if d.get('demo_info') and d['demo_info']['status'] == '평가진행중'])
as_count = len([d for d in db['pipeline'] if d.get('as_info') and d['as_info']['status'] == '접수/진행중'])
lost_count = len([d for d in db['pipeline'] if d['status'] == '영업실패·보류'])

db['stats']['total_hospitals'] = len(db['hospitals'])
db['stats']['total_deals'] = len(db['pipeline'])
db['stats']['won_deals'] = won_count
db['stats']['active_demos'] = demo_count
db['stats']['active_as'] = as_count
db['stats']['lost_deals'] = lost_count

print(f"\n✅ Normalized Hospitals: {len(db['hospitals'])} (Deduplicated)")
print(f"✅ Normalized Pipeline Deals: {len(db['pipeline'])}")

# Save to JSON and JS
with open('sales_database.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

with open('sales_database.js', 'w', encoding='utf-8') as f:
    f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

print("Saved sales_database.json and sales_database.js successfully!")
