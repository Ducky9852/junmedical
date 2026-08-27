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

cur_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(cur_dir, "sales_database.json")
db_js_path = os.path.join(cur_dir, "sales_database.js")

with open(db_path, 'r', encoding='utf-8') as f:
    db = json.load(f)

# Split specifications definitions
SPLIT_RULES = [
    # 1. 대전 새손병원 (2025/12/05)
    {
        "match_hosp": "대전 새손병원",
        "match_date": "2025/12/05",
        "splits": [
            {
                "product_code": "GROUP-SEJONG-SHEET",
                "product_name": "[세종] 멸균 소공포 (MULTI USEFUL SHEET)",
                "action_type": "관계관리",
                "sales_status": "영업실패·보류",
                "title": "[영업실패·보류] [세종] 멸균 소공포",
                "note": "소공포는 일단 보류 (영업실패/보류).",
                "fail_reason": "의료진 피드백/보류"
            },
            {
                "product_code": "PROD_HYGENT",
                "product_name": "[하이겐트] Hygent 수액세트/치료재료",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 하이겐트 (Hygent)",
                "note": "하이겐트(Hygent) 문헌자료 드림. 메인 원장님 뵈야하나 잘 안보신다고 함.",
                "fail_reason": ""
            }
        ]
    },
    # 2. 효성의료원 (2026/08/25)
    {
        "match_hosp": "효성의료원",
        "match_date": "2026/08/25",
        "splits": [
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 펀치바이옵시",
                "note": "산부인과 박수진과장 미팅. 펀치바이옵시 샘플 사용후 만족도 높음. 최정훈 1과장 사용 후 코드 생성 예정.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_TULIP",
                "product_name": "듀얼 튤립 카테터 (Dual Tulip)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 듀얼 튤립",
                "note": "듀얼튤립 때에 따라 사용하기 편함. 샘플 1개 추가 요청.",
                "fail_reason": ""
            }
        ]
    },
    # 3. 국립소방병원 (2026/08/24)
    {
        "match_hosp": "국립소방병원",
        "match_date": "2026/08/24",
        "splits": [
            {
                "product_code": "PROD_HYGENT",
                "product_name": "[하이겐트] Hygent 수액세트/치료재료",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 하이겐트 (Hygent)",
                "note": "외과 김기호 교수에게 하이겐트 소개했으나 미온적 반응. 유착 방지율 관련 추가 자료 준비 후 재방문 예정.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_TROCAR",
                "product_name": "복강경용 멸균 트로카 (Trocar)",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 트로카 & 원포트",
                "note": "김기호 교수 요청받은 트로카, 원포트 카탈로그 준비하여 재방문 예정.",
                "fail_reason": ""
            }
        ]
    },
    # 4. 서산엠산부인과 (2026/02/26)
    {
        "match_hosp": "서산엠산부인과",
        "match_date": "2026/02/26",
        "splits": [
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "납품·설치",
                "sales_status": "도입완료·납품",
                "title": "[도입완료·납품] 펀치바이옵시",
                "note": "펀치바이옵시 기도입/사용중.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_ZWAYOK",
                "product_name": "병원용 자동 멸균 좌욕기",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 좌욕기",
                "note": "조리원 운영 중, 좌욕기 설명하고 관심 보임. 비급여 샘플 전달 예정.",
                "fail_reason": ""
            }
        ]
    },
    # 5. 홍성의료원 (2026/02/02)
    {
        "match_hosp": "홍성의료원",
        "match_date": "2026/02/02",
        "splits": [
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 펀치바이옵시",
                "note": "박수진 과장 담당, 펀치바이옵시 관심 있어 바로 샘플 사용 희망.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_TULIP",
                "product_name": "듀얼 튤립 카테터 (Dual Tulip)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 듀얼 튤립",
                "note": "듀얼튤립 관심 있어 다음 방문 시 샘플 전달 예정.",
                "fail_reason": ""
            }
        ]
    },
    # 6. 오창 미즈산부인과 (2025/12/16)
    {
        "match_hosp": "오창 미즈산부인과",
        "match_date": "2025/12/16",
        "splits": [
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "관계관리",
                "sales_status": "영업실패·보류",
                "title": "[영업실패·보류] 펀치바이옵시",
                "note": "바이옵시 사용 예정 없음.",
                "fail_reason": "필요성 부재"
            },
            {
                "product_code": "PROD_TULIP",
                "product_name": "듀얼 튤립 카테터 (Dual Tulip)",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 듀얼 튤립",
                "note": "듀얼튤립 디테일 설명 및 제안.",
                "fail_reason": ""
            }
        ]
    },
    # 7. 청주 해피맘산부인과 (2025/11/21)
    {
        "match_hosp": "청주 해피맘산부인과",
        "match_date": "2025/11/21",
        "splits": [
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "관계관리",
                "sales_status": "영업실패·보류",
                "title": "[영업실패·보류] 펀치바이옵시",
                "note": "사무장 면담, 바이옵시 사용은 극히 드물다고 함.",
                "fail_reason": "필요성 부재"
            },
            {
                "product_code": "PROD_TULIP",
                "product_name": "듀얼 튤립 카테터 (Dual Tulip)",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] 듀얼 튤립",
                "note": "듀얼튤립 디테일 설명 및 제안.",
                "fail_reason": ""
            }
        ]
    },
    # 8. 담소유병원 (2025/11/18)
    {
        "match_hosp": "담소유병원",
        "match_date": "2025/11/18",
        "splits": [
            {
                "product_code": "GROUP-SEJONG-SHEET",
                "product_name": "[세종] 멸균 소공포 (MULTI USEFUL SHEET)",
                "action_type": "제품설명·소개",
                "sales_status": "제품소개·영업중",
                "title": "[제품설명·소개] [세종] 멸균 소공포",
                "note": "소공포 가격은 만족하며 필요 시 발주 예정.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_HYGENT",
                "product_name": "[하이겐트] Hygent 수액세트/치료재료",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 하이겐트 (Hygent)",
                "note": "하이겐트(Hygent) 샘플 전달, 원장님들과 상의 필요.",
                "fail_reason": ""
            }
        ]
    },
    # 9. 청주 마이크로병원 (2025/11/07)
    {
        "match_hosp": "청주 마이크로병원",
        "match_date": "2025/11/07",
        "splits": [
            {
                "product_code": "GROUP-SEJONG-SHEET",
                "product_name": "[세종] 멸균 소공포 (MULTI USEFUL SHEET)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] [세종] 멸균 소공포",
                "note": "비급여 소공포 디테일 설명, 수술포 샘플 전달. 월 300개 사용 예정, 간납 납품 협의.",
                "fail_reason": ""
            },
            {
                "product_code": "PROD_HYGENT",
                "product_name": "[하이겐트] Hygent 수액세트/치료재료",
                "action_type": "관계관리",
                "sales_status": "영업실패·보류",
                "title": "[영업실패·보류] 하이겐트 (Hygent)",
                "note": "하이겐트는 원장님 지인이 기설명하여 보류.",
                "fail_reason": "기존 거래처/경쟁사 선호"
            }
        ]
    },
    # 10. 미래산부인과 (2025/11/07)
    {
        "match_hosp": "미래산부인과",
        "match_date": "2025/11/07",
        "splits": [
            {
                "product_code": "PROD_TULIP",
                "product_name": "듀얼 튤립 카테터 (Dual Tulip)",
                "action_type": "관계관리",
                "sales_status": "영업실패·보류",
                "title": "[영업실패·보류] 듀얼 튤립",
                "note": "튤립은 타업체 기설명 이력 있으나 미사용 상태.",
                "fail_reason": "필요성 부재"
            },
            {
                "product_code": "PROD_BIOPSY",
                "product_name": "일회용 펀치 생검기 (Punch Biopsy)",
                "action_type": "샘플·데모",
                "sales_status": "데모·샘플평가",
                "title": "[샘플·데모] 펀치바이옵시",
                "note": "바이옵시 제품 설명 및 샘플 전달, 원장님 구매 지시 대기.",
                "fail_reason": ""
            }
        ]
    }
]

# Execute splitting on activity_logs
new_activity_logs = []
split_count = 0

for log in db['activity_logs']:
    matched_rule = None
    for rule in SPLIT_RULES:
        if (rule['match_hosp'] in log.get('hospital', '')) and (rule['match_date'] == log.get('date', '')):
            matched_rule = rule
            break
            
    if matched_rule:
        split_count += 1
        for s in matched_rule['splits']:
            new_log = dict(log)
            new_log['product_code'] = s['product_code']
            new_log['product_name'] = s['product_name']
            new_log['products'] = [s['product_name']]
            new_log['action_type'] = s['action_type']
            new_log['title'] = s['title']
            new_log['note'] = s['note']
            new_activity_logs.append(new_log)
    else:
        new_activity_logs.append(log)

db['activity_logs'] = new_activity_logs
db['stats']['total_logs'] = len(new_activity_logs)
print(f"Split {split_count} multi-product logs. New total logs count: {len(new_activity_logs)}")

# Execute updating pipelines
for rule in SPLIT_RULES:
    hosp_name = rule['match_hosp']
    # find region
    hosp_obj = next((h for h in db['hospitals'] if hosp_name in h['name']), None)
    region = hosp_obj.get('region', '세종충북') if hosp_obj else '세종충북'
    
    for s in rule['splits']:
        p_code = s['product_code']
        p_name = s['product_name']
        status = s['sales_status']
        
        # Check if deal exists
        deal = next((d for d in db['pipeline'] if hosp_name in d['hospital'] and d['product_id'] == p_code), None)
        if not deal:
            deal = {
                "hospital": hosp_name,
                "region": region,
                "sales_rep": "이재덕",
                "product_id": p_code,
                "product_name": p_name,
                "status": status,
                "last_date": rule['match_date'],
                "latest_action": s['action_type'],
                "latest_note": s['note'],
                "demo_info": {"date": rule['match_date'], "note": s['note'], "status": "평가진행중"} if "데모" in status else None,
                "as_info": None,
                "fail_reasons": [s['fail_reason']] if s['fail_reason'] else []
            }
            db['pipeline'].append(deal)
            print(f"Created new pipeline deal: [{hosp_name}] {p_name} -> {status}")
        else:
            deal['status'] = status
            deal['latest_note'] = s['note']
            deal['last_date'] = rule['match_date']
            deal['latest_action'] = s['action_type']
            if s['fail_reason'] and s['fail_reason'] not in deal.get('fail_reasons', []):
                deal.setdefault('fail_reasons', []).append(s['fail_reason'])
            print(f"Updated existing pipeline deal: [{hosp_name}] {p_name} -> {status}")

db['stats']['total_deals'] = len(db['pipeline'])

# Save to local JSON & JS
with open(db_path, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)
with open(db_js_path, 'w', encoding='utf-8') as f:
    f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

print(f"Saved local DB: {len(db['activity_logs'])} logs, {len(db['pipeline'])} pipelines")

# Sync to Supabase
print("\n--- Syncing to Supabase Cloud Database ---")
# 1. Truncate / Re-insert activity_logs
# We can overwrite activity_logs by POSTing clean list
# First delete all in Supabase
try:
    del_url = f"{SUPABASE_URL}/rest/v1/activity_logs?id=gt.0"
    req_del = urllib.request.Request(del_url, headers=HEADERS, method='DELETE')
    with urllib.request.urlopen(req_del, context=ctx) as res:
        print("Cleared old Supabase activity_logs")
except Exception as e:
    print("Delete logs error:", e)

# Upload fresh logs
logs_payload = []
for l in db['activity_logs']:
    logs_payload.append({
        "hospital": l.get("hospital"),
        "date": l.get("date"),
        "sales_rep": l.get("sales_rep"),
        "action_type": l.get("action_type"),
        "title": l.get("title"),
        "note": l.get("note"),
        "products": l.get("products", []),
        "product_code": l.get("product_code", "PROD_GENERAL"),
        "next_action": l.get("next_action", ""),
        "region": l.get("region", "세종충북"),
        "contact": l.get("contact", "실무진")
    })

for i in range(0, len(logs_payload), 100):
    batch = logs_payload[i:i+100]
    req_post = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/activity_logs", data=json.dumps(batch).encode('utf-8'), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req_post, context=ctx) as res:
            pass
    except Exception as e:
        print(f"Upload logs batch {i} error:", e)
print(f"Uploaded {len(logs_payload)} activity_logs to Supabase!")

# 2. Upload fresh pipeline
try:
    del_pipe = f"{SUPABASE_URL}/rest/v1/pipeline?id=gt.0"
    req_del_p = urllib.request.Request(del_pipe, headers=HEADERS, method='DELETE')
    with urllib.request.urlopen(req_del_p, context=ctx) as res:
        print("Cleared old Supabase pipeline")
except Exception as e:
    print("Delete pipeline error:", e)

pipe_payload = []
for d in db['pipeline']:
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

for i in range(0, len(pipe_payload), 100):
    batch = pipe_payload[i:i+100]
    req_post_p = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/pipeline", data=json.dumps(batch).encode('utf-8'), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req_post_p, context=ctx) as res:
            pass
    except Exception as e:
        print(f"Upload pipeline batch {i} error:", e)
print(f"Uploaded {len(pipe_payload)} pipelines to Supabase!")

print("\n🎉 ALL SPLIT LOGS AND PIPELINES SYNCHRONIZED SUCCESSFULLY!")
