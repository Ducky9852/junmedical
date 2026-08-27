import json
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

# 1. Comprehensive Hospital Normalization & Typo Dictionary (v2.0)
COMPREHENSIVE_NORMALIZATION_MAP = {
    # 단양군보건소
    '단양 보건소': '단양군보건소',
    '단양보건소': '단양군보건소',
    '단양군보건소': '단양군보건소',

    # 보은한양병원 / 제천한양병원 / 보은우리병원
    '보은 한양병원': '보은한양병원',
    '보은한양병원': '보은한양병원',
    '보은 한양': '보은한양병원',
    '보은우리병원': '보은우리외과의원',
    '보은 우리외과': '보은우리외과의원',
    '보은 우리외과의원': '보은우리외과의원',
    '보은우리외과의원': '보은우리외과의원',
    '제천 한양병원': '제천한양병원',
    '제천한양병원': '제천한양병원',
    '제천 한양': '제천한양병원',

    # 미즈닥터 / 미스닥터 / 방서미즈닥터
    '방서 미즈닥터병원': '청주 방서미즈닥터산부인과',
    '방서미스닥터': '청주 방서미즈닥터산부인과',
    '방서미즈닥터': '청주 방서미즈닥터산부인과',
    '방서미즈박터': '청주 방서미즈닥터산부인과',
    '청주 방서미스닥터': '청주 방서미즈닥터산부인과',
    '청주 방서미즈닥터': '청주 방서미즈닥터산부인과',
    '청주 방서미즈닥터병원': '청주 방서미즈닥터산부인과',
    '청주 방서미즈닥터산부인과': '청주 방서미즈닥터산부인과',
    '청주 방서미즈맘': '청주 방서미즈닥터산부인과',
    '청주 미즈닥터여성의원': '청주 방서미즈닥터산부인과',
    '미즈맘산부인과의원': '청주 미즈맘산부인과',

    # 씨앤씨 재활병원
    'CnC재활 재활병원': '청주 씨앤씨재활병원',
    '씨앤씨 재활병원': '청주 씨앤씨재활병원',
    '씨앤씨병원': '청주 씨앤씨재활병원',
    '청주 cnc 재활병원': '청주 씨앤씨재활병원',
    '청주 cnc재활': '청주 씨앤씨재활병원',
    '청주 씨엔씨재활': '청주 씨앤씨재활병원',
    '청주 씨앤씨재활병원': '청주 씨앤씨재활병원',

    # 가톨릭병원 / 카톨릭병원
    '가톨릭병원': '청주 가톨릭병원',
    '카톨릭병원': '청주 가톨릭병원',
    '청주 카톨릭병원': '청주 가톨릭병원',
    '청주 가톨릭병원': '청주 가톨릭병원',

    # 다나여성
    '다나여성': '청주 다나여성병원',
    '다나여성병원': '청주 다나여성병원',
    '청주 다나여성': '청주 다나여성병원',
    '청주 다나여성병원': '청주 다나여성병원',
    '청주 다나병원': '청주 다나여성병원',
    '다나산부인과': '청주 다나여성병원',

    # 닥터연여성
    '닥터연여성': '청주 닥터연여성산부인과',
    '닥터연여성산부인과': '청주 닥터연여성산부인과',
    '청주 닥터연여성': '청주 닥터연여성산부인과',
    '청주 닥터연여성산부인과': '청주 닥터연여성산부인과',
    '청주 닥터연여성의원': '청주 닥터연여성산부인과',

    # 마디사랑
    '마디사랑': '청주 마디사랑병원',
    '마디사랑병원': '청주 마디사랑병원',
    '청주 마디사랑': '청주 마디사랑병원',
    '청주 마디사랑병원': '청주 마디사랑병원',

    # 프라우삼성
    '프라우산부인과': '청주 프라우삼성산부인과',
    '프라우삼성': '청주 프라우삼성산부인과',
    '청주 프라우': '청주 프라우삼성산부인과',
    '청주 프라우산부인과': '청주 프라우삼성산부인과',
    '청주 프라우삼성': '청주 프라우삼성산부인과',
    '청주 프라우삼성산부인과': '청주 프라우삼성산부인과',

    # 아산웰마취통증
    '아산웰마취': '청주 아산웰마취통증의학과',
    '아산웰마취통증': '청주 아산웰마취통증의학과',
    '청주 아산웰마취': '청주 아산웰마취통증의학과',
    '청주 아산웰마취통증': '청주 아산웰마취통증의학과',
    '청주 아산웰통증': '청주 아산웰마취통증의학과',
    '서울웰마취통증': '청주 서울웰마취통증의학과',
    '청주 서울웰마통증': '청주 서울웰마취통증의학과',

    # 옥천성모병원 (오타 옥천상모병원 수정)
    '옥천상모병원': '옥천성모병원',
    '옥천성모병원': '옥천성모병원',

    # 서산 우리본병원 / 서산본병원
    '서산본병원': '서산 우리본병원',
    '서산 우리본병원': '서산 우리본병원',

    # 백제병원 / 백제종합병원
    '백제병원': '백제종합병원',
    '백제종합병원': '백제종합병원',

    # 뿌리병원 / 청주 뿌리병원
    '뿌리병원': '청주 뿌리병원',
    '청주 뿌리병원': '청주 뿌리병원',

    # 새빛병원 / 청주 새빛병원
    '새빛병원': '청주 새빛병원',
    '청주 새빛병원': '청주 새빛병원',

    # 서로손병원 / 청주 서로손병원
    '서로손병원': '청주 서로손병원',
    '청주 서로손병원': '청주 서로손병원',

    # 새손병원 / 대전 새손병원
    '새손병원': '대전 새손병원',
    '대전 새손병원': '대전 새손병원',

    # 킴스 / 제천 킴스정형외과
    '킴스': '제천 킴스정형외과',
    '제천 킴스정형외과': '제천 킴스정형외과',

    # 노 / 제천 노정형외과
    '노': '제천 노정형외과',
    '제천 노정형외과': '제천 노정형외과',

    # 별산부인과 / 충주별산부인과
    '별산부인과': '충주 별산부인과',
    '충주별산부인과': '충주 별산부인과',

    # 금왕삼성연합 / 음성 금왕연합정형외과
    '금왕삼성연합': '음성 금왕연합정형외과',
    '금왕연합': '음성 금왕연합정형외과',
    '음성 금왕연합정형외과': '음성 금왕연합정형외과',

    # 연세미즈
    '연세미즈': '제천 연세미즈산부인과',
    '연세미즈산부인과': '제천 연세미즈산부인과',
    '제전 연세미즈산부인과': '제천 연세미즈산부인과',
    '제천연세미즈산부인과': '제천 연세미즈산부인과',
    '제천 연세미즈산부인과': '제천 연세미즈산부인과',

    # 한기정
    '한기정': '제천 한기정산부인과',
    '한기정산부인과': '제천 한기정산부인과',
    '제천 한기정산부인과': '제천 한기정산부인과',

    # 해피맘
    '해피맘': '청주 해피맘산부인과',
    '해피맘산부인과': '청주 해피맘산부인과',
    '청주 해피맘산부인과': '청주 해피맘산부인과',

    # 유항외과
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

    # 오창
    '오창 미즈': '오창 미즈산부인과',
    '오창 미즈산부인과': '오창 미즈산부인과',
    '오창 호수h': '오창 호수병원',
    '오창 중앙병원': '오창 호수병원',
    '오창호수병원': '오창 호수병원',
    '오창 호수병원': '오창 호수병원',

    # 천안
    '천안본정형외과': '천안 본정형외과병원',
    '천안 본정형외과병원': '천안 본정형외과병원',
    '21세기병원': '천안 21세기병원',
    '천안 21세기 병원': '천안 21세기병원',
    '청주21세기병원': '청주 21세기병원',
    '평택21세기 병원': '평택 21세기병원',

    # 세종
    '세종엔케이': '세종엔케이병원',
    '세종엔케이병원': '세종엔케이병원',

    # 영동
    '영동 영동병원': '영동병원',
    '영동병원': '영동병원',

    # 충주
    '충주 세종병원': '충주 세종정형외과',
    '충주 세종정형외과': '충주 세종정형외과',

    # 진천
    '진천 중앙병원': '진천 중앙제일병원',
    '진천 중앙제일병원': '진천 중앙제일병원',

    # 자모
    '자모산부인과': '청주 자모산부인과',
    '청주자모산부인과': '청주 자모산부인과',
    '청주 자모산부인과': '청주 자모산부인과',

    # 마이크로
    '마이크로병원': '청주 마이크로병원',
    '청주 마이크로병원': '청주 마이크로병원',

    # 쉬즈
    '쉬즈산부인과': '청주 쉬즈산부인과',
    '청주 쉬즈산부인과': '청주 쉬즈산부인과',

    # 프라임
    '프라임병원': '청주 프라임병원',
    '청주프라임병원': '청주 프라임병원',
    '청주 프라임병원': '청주 프라임병원',

    # 정성내과
    '정성내과': '청주 정성내과',
    '청주 정성내과': '청주 정성내과',

    # 유성선병원
    '영훈의료재단유성선병원': '영훈의료재단 유성선병원',
    '유성선병원': '영훈의료재단 유성선병원',
    '영훈의료재단 유성선병원': '영훈의료재단 유성선병원',

    # 의료원
    '충주의료원': '충청북도 충주의료원',
    '청주의료원': '충청북도 청주의료원',
    '충청북도 청주의료원': '충청북도 청주의료원',
    '충청북도 충주의료원': '충청북도 충주의료원',

    # 원장명/복합 오타
    '류시나': '분당 류시나산부인과',
    '청담,유엔비,쉬즈메디,오월납품': '서울 청담튼튼병원'
}

def clean_hosp_name(raw):
    if not raw:
        return '기타 거래처'
    r = raw.strip()
    if r in COMPREHENSIVE_NORMALIZATION_MAP:
        return COMPREHENSIVE_NORMALIZATION_MAP[r]
    
    # Check normalized regex replacements
    r_sub = re.sub(r'\s+', ' ', r)
    if '단양' in r_sub and '보건' in r_sub:
        return '단양군보건소'
    if '미스닥터' in r_sub or '미즈닥터' in r_sub or '미즈박터' in r_sub:
        return '청주 방서미즈닥터산부인과'
    if '옥천상모' in r_sub:
        return '옥천성모병원'
    if 'CnC' in r_sub or '씨앤씨' in r_sub or '씨엔씨' in r_sub:
        return '청주 씨앤씨재활병원'
    if '카톨릭' in r_sub or '가톨릭' in r_sub:
        return '청주 가톨릭병원'
    if '다나여성' in r_sub or '다나산부' in r_sub:
        return '청주 다나여성병원'
    if '닥터연' in r_sub:
        return '청주 닥터연여성산부인과'
    if '마디사랑' in r_sub:
        return '청주 마디사랑병원'
    if '프라우' in r_sub:
        return '청주 프라우삼성산부인과'
    if '미즈맘' in r_sub:
        return '청주 미즈맘산부인과'

    return r

# Load DB
with open('sales_database.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

# Normalize Logs
for log in db['activity_logs']:
    t = log.get('title', '')
    if '미즈맘' in t:
        log['hospital'] = '청주 미즈맘산부인과'
    else:
        log['hospital'] = clean_hosp_name(log['hospital'])

# Normalize Pipeline Deals
merged_pipeline = {}
for deal in db['pipeline']:
    norm_hosp = clean_hosp_name(deal['hospital'])
    deal['hospital'] = norm_hosp
    
    key = f"{norm_hosp}___{deal['product_id']}"
    if key not in merged_pipeline:
        merged_pipeline[key] = deal
    else:
        existing = merged_pipeline[key]
        if deal['last_date'] >= existing['last_date']:
            existing['last_date'] = deal['last_date']
            existing['latest_action'] = deal['latest_action']
            existing['latest_note'] = deal['latest_note']
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

# Rebuild Hospitals Master with exact matching schema
hospitals_map = {}
for log in db['activity_logs']:
    h_name = log['hospital']
    if h_name not in hospitals_map:
        hospitals_map[h_name] = {
            "name": h_name,
            "region": log.get('region', '세종충북'),
            "sales_reps": set(),
            "contacts": set(),
            "status": "활동병원",
            "last_activity_date": log.get('date', '2026/01/01'),
            "total_logs": 0,
            "demo_count": 0,
            "won_count": 0,
            "as_count": 0,
            "fail_count": 0,
            "products_active": []
        }
    h = hospitals_map[h_name]
    h['total_logs'] += 1
    if log.get('date', '') > h['last_activity_date']:
        h['last_activity_date'] = log['date']
    if log.get('sales_rep'):
        h['sales_reps'].add(log['sales_rep'])
    if log.get('contact'):
        h['contacts'].add(log['contact'])

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

# Convert sets to lists
hospitals_list = []
for h in hospitals_map.values():
    h['contacts'] = sorted(list(h['contacts'])) if h['contacts'] else ['실무진']
    h['sales_reps'] = sorted(list(h['sales_reps'])) if h['sales_reps'] else ['영업담당']
    hospitals_list.append(h)

db['hospitals'] = sorted(hospitals_list, key=lambda x: x['name'])

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

print(f"🎉 Fully Cleaned & Deduplicated Hospitals: {len(db['hospitals'])} (from 242)")
print(f"🎉 Cleaned Deals: {len(db['pipeline'])}")

# Save to JSON and JS
with open('sales_database.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

with open('sales_database.js', 'w', encoding='utf-8') as f:
    f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

print("Saved cleanly!")
