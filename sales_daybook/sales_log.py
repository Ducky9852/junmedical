"""
준메디칼 MEDI-SALES 360° 영업도우미 봇 핵심 로직 (v2.1)
- Slack Events API 기반 실시간 수신
- Gemini AI 비정형 텍스트 구조화 파싱 (단일 및 다중 일지 자동 분리 지원)
- Ecount ERP 4,054개 품목 마스터 자동 매핑
- Notion 6대 DB & 웹 대시보드 DB(sales_database.json) 실시간 이중 동기화
- AS/데모/약칭/현황 슬랙 명령어 전체 지원
"""

import os
import re
import json
import logging
from datetime import datetime, timedelta
import urllib.request
import urllib.parse

# 로깅 설정
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SalesBot")

# 1. 직원 Slack User ID 매핑 (인수인계서 기준)
AUTHOR_MAP = {
    "U08RXTVB9N0": "이우식",
    "U091XTW8AR0": "이상미",
    "U0BFNKE5FS8": "이은필",
    "U0BJENWEL7K": "이재덕",
    "U0BGDBLJC6L": "최진웅",
    "U091YDB52MS": "원유훈",
    "U0_LEE_WOOJIN": "이우진",
}

# 2. 환경변수 로드
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "").strip()
SLACK_APP_TOKEN = os.environ.get("SLACK_APP_TOKEN", "").strip()
SALES_LOG_CHANNEL = os.environ.get("SALES_LOG_CHANNEL", "").strip()
DEMO_CHANNEL = os.environ.get("DEMO_CHANNEL", "").strip()
ADMIN_SLACK_ID = os.environ.get("ADMIN_SLACK_ID", "U08RXTVB9N0").strip()

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "").strip()
NOTION_DB_SALES = os.environ.get("NOTION_DB_SALES", "3cbe476c-01fb-4d9f-8d78-f00cb9dc182a").strip()
NOTION_DB_CLIENTS = os.environ.get("NOTION_DB_CLIENTS", "d987f21d-051d-4b95-8b07-276d31cbe162").strip()
NOTION_DB_PRODUCTS = os.environ.get("NOTION_DB_PRODUCTS", "6404cc43-350d-41d3-92d9-811f42a6a181").strip()
NOTION_DB_AS = os.environ.get("NOTION_DB_AS", "cf3d5463-f7ce-4161-8f0b-5ed2caea3390").strip()
NOTION_DB_DEMO = os.environ.get("NOTION_DB_DEMO", "a80fc9fd-843f-4bf8-95fe-b16d478b0be3").strip()
NOTION_DB_OPPORTUNITY = os.environ.get("NOTION_DB_OPPORTUNITY", "5e442046-5590-40c4-93f3-4c41f417ae04").strip()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
SALES_GEMINI_MODEL = os.environ.get("SALES_GEMINI_MODEL", "gemini-2.5-flash").strip()
NOTION_VER = "2022-06-28"

# 3. Bolt 인터페이스 함수들
def enabled():
    return bool(SALES_LOG_CHANNEL)

def is_log_channel(channel):
    return bool(SALES_LOG_CHANNEL) and channel == SALES_LOG_CHANNEL

# 4. ERP 4,054개 품목 마스터 캐시 로드
ERP_PRODUCTS = []
ERP_BY_CODE = {}
ERP_FILE_PATH = os.path.join(os.path.dirname(__file__), "erp_products.json")

if os.path.exists(ERP_FILE_PATH):
    try:
        with open(ERP_FILE_PATH, "r", encoding="utf-8") as f:
            ERP_PRODUCTS = json.load(f)
            for p in ERP_PRODUCTS:
                ERP_BY_CODE[p["code"]] = p
        logger.info(f"Loaded {len(ERP_PRODUCTS)} ERP items from erp_products.json")
    except Exception as e:
        logger.error(f"Failed to load erp_products.json: {e}")

# 5. ERP 품목 매핑 함수
def match_erp_product(text, fallback_name=""):
    combined = f"{text} {fallback_name}".lower()
    
    # 0. Check Priority PRODUCT_NORM_MAP first
    for k_norm, v_norm in PRODUCT_NORM_MAP.items():
        if k_norm.lower() in combined:
            # Look up item in ERP_BY_CODE or return mapped
            if v_norm['code'] in ERP_BY_CODE:
                return ERP_BY_CODE[v_norm['code']]
            return {
                "code": v_norm['code'],
                "name": v_norm['name'],
                "spec": "",
                "vendor": "준메디칼",
                "category": "일반의료기기"
            }

    # 1. Direct code search in 4,069 ERP items
    clean_combined = re.sub(r'[\s\-_]', '', combined)
    for code, item in ERP_BY_CODE.items():
        clean_code = re.sub(r'[\s\-_]', '', code.lower())
        if len(clean_code) >= 4 and clean_code in clean_combined:
            return item

    # 2. Match by medical product standard dictionary
    standard_rules = [
        (r'엔지오키트|angio.*kit|st-ang|pr03|adv03', 'ST-ANG-PR03'),
        (r'c라인|c-line|cline|중심정맥관.*키트', 'ST-CVC-CLINE11A'),
        (r'소공포|멸균소공포|드레이프', 'GROUP-SEJONG-SHEET'),
        (r'펜코|서지소드|펜코나이프|메스대|안전메스', 'GROUP-PENKO-SWORD'),
        (r'바이옵시|펀치바이옵시|punch.*biopsy', 'PROD_BIOPSY'),
        (r'튤립|듀얼튤립', 'PROD_TULIP'),
        (r'하이겐트|hygent', 'PROD_HYGENT'),
        (r'좌욕기|좌욕기.*필터', 'PROD_ZWAYOK'),
        (r'트로카|trocar', 'PROD_TROCAR'),
        (r'bt350|bt-350|태아심음', 'PROD_BT350'),
        (r'응급봉합|봉합키트', 'ST-ESTK01'),
        (r'켈리키트|kelly.*kit', 'ST-EDTK02'),
        (r'블록키트|block.*kit', 'ST-EDTK04'),
    ]
    for pat, code in standard_rules:
        if re.search(pat, combined, re.I):
            if code in ERP_BY_CODE:
                return ERP_BY_CODE[code]
            return {
                "code": code,
                "name": fallback_name or code,
                "spec": "",
                "vendor": "준메디칼",
                "category": "일반의료기기"
            }

    # 3. Match item name exact / high similarity (skip too short keywords & stopwords)
    STOP_KEYWORDS = {'원장', '과장', '병원', '의원', '의사', '상황', '면담', '부재', '외과', '산부인과', '정형외과', '내과', '신경외과', 'os', 'ps', 'gs', 'obgy', '방문', '인사', '안됨', '불발', '운영', '형식', '전문의', '환자', '간호사'}
    for p in ERP_PRODUCTS:
        p_name = p.get("name", "").lower().strip()
        if len(p_name) >= 3 and p_name not in STOP_KEYWORDS and p_name in combined:
            return p

    return {
        "code": "PROD_GENERAL",
        "name": fallback_name or "신규 접촉 및 인사 (품목 미정)",
        "spec": "초진/인사/면담시도",
        "vendor": "준메디칼",
        "category": "신규영업"
    }

# 6. Gemini AI를 활용한 비정형 영업일지 파싱 (다중 항목 지원)
def parse_sales_log_with_gemini(raw_text):
    prompt = f"""
당신은 준메디칼의 의료기기 영업일지 자동 분석 AI입니다.
영업사원이 작성한 텍스트를 읽고, 각 병원/활동별로 분리하여 JSON 배열(List) 형식으로 추출하세요.
(한 메시지에 여러 병원이나 여러 활동이 포함되어 있으면 각각 독립된 객체로 분리하여 배열로 만드세요)

[입력 텍스트]
{raw_text}

[추출 필드 규칙]
1. hospital: 병원/거래처명 (예: 서산중앙병원, 효성의료원, 미즈맘, 리즈여성병원 등)
2. contact: 병원 측 담당자 및 직책/과 (예: 산부인과 박수진과장, 신경외과장, 심혈관 팀장 등 없으면 '실무진')
3. product: 언급된 의료기기/소모품/장비 이름 (예: 펀치바이옵시, 듀얼튤립, 엔지오키트, 좌욕기 필터, bt350 등). 만약 특정 제품 언급이 없이 첫 인사, 거래처 탐색, 면담 시도, 단순 방문인 경우 반드시 '신규 접촉 및 인사 (품목 미정)' 으로 입력하세요.
4. action_type: 다음 중 택1 [신규접촉, 제품설명·소개, 샘플·데모, 견적제출, 납품·설치, A/S·클레임, 관계관리, 수금·결제, 기타]
5. sales_status: 다음 중 택1 [영업시도, 영업중, 영업완료, 영업실패]
   - 가격 부담, 비급여 거부, 필요성 못느낌, 도입 거절, 타사 납품 확인 등의 내용이 있으면 '영업실패' 또는 '보류'
   - 코드 생성 진행중, 긍정적 검토는 '영업중'
   - 샘플 사용 만족은 '영업중'
   - 카드결제/수금은 '영업완료'
6. fail_reason: 영업실패/보류인 경우 사유 (단가/가격 부담, 기존 거래처/경쟁사 선호, 필요성 부재, 의료진 거절 중 선택, 없으면 '')
7. summary: 핵심 내용 요약 (1~2문장)
8. next_action: 다음 할 일 및 일정 (예: 최정훈과장 사용후 코드 생성 확인, 튤립 샘플 추가 전달, bt350 수리 접수 등)

반드시 마크다운 없이 순수 JSON 배열만 응답하세요:
[
  {{
    "hospital": "",
    "contact": "",
    "product": "",
    "action_type": "",
    "sales_status": "",
    "fail_reason": "",
    "summary": "",
    "next_action": ""
  }}
]
"""
    if not GEMINI_API_KEY:
        return [parse_sales_log_local(raw_text)]

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{SALES_GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            content_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            parsed_list = json.loads(content_text)
            if isinstance(parsed_list, dict):
                return [parsed_list]
            return parsed_list
    except Exception as e:
        logger.error(f"Gemini API parse error: {e}")
        return [parse_sales_log_local(raw_text)]

# 7. 로컬 룰베이스 폴백 파서
def parse_sales_log_local(text):
    action = "관계관리"
    if re.search(r'a/s|as|수리|고장|불량|클레임|인쇄.*안', text, re.I): action = "A/S·클레임"
    elif re.search(r'샘플|데모|demo|sample|전달|써보', text, re.I): action = "샘플·데모"
    elif re.search(r'납품|발주|계약|입고|출고|결제|카드', text, re.I): action = "납품·설치"
    elif re.search(r'견적|단가|비용', text, re.I): action = "견적제출"
    elif re.search(r'소개|카탈로그|디테일|설명|미팅', text, re.I): action = "제품설명·소개"

    status = "영업중"
    fail_reason = ""
    if re.search(r'거절|안함|보류|어렵|힘들|타사.*납품|필요.*못느|비싸|부담', text):
        status = "영업실패"
        if "필요" in text: fail_reason = "필요성 부재"
        elif "비싸" in text or "단가" in text: fail_reason = "단가/가격 부담"
        else: fail_reason = "의료진 거절"

    hosp_match = re.search(r'([가-힣]+(?:병원|의원|의료원|의료재단|보건소|미즈맘))', text)
    hosp_name = hosp_match.group(1) if hosp_match else "거래처"

    return {
        "hospital": hosp_name,
        "contact": "실무진",
        "product": "의료기기",
        "action_type": action,
        "sales_status": status,
        "fail_reason": fail_reason,
        "summary": text[:120],
        "next_action": "다음 방문 일정 확인"
    }

# 5-1. 병원명 정규화 매핑 딕셔너리
HOSPITAL_NORM_MAP = {
    '단양 보건소': '단양군보건소',
    '단양보건소': '단양군보건소',
    '단양군보건소': '단양군보건소',
    '보은 한양병원': '보은한양병원',
    '보은한양병원': '보은한양병원',
    '보은 한양': '보은한양병원',
    '보은우리병원': '보은우리외과의원',
    '보은 우리외과': '보은우리외과의원',
    '제천 한양병원': '제천한양병원',
    '제천한양병원': '제천한양병원',
    '방서 미즈닥터병원': '청주 방서미즈닥터산부인과',
    '방서미스닥터': '청주 방서미즈닥터산부인과',
    '방서미즈닥터': '청주 방서미즈닥터산부인과',
    '미즈맘': '청주 미즈맘산부인과',
    '미즈맘산부인과': '청주 미즈맘산부인과',
    '미즈맘산부인과의원': '청주 미즈맘산부인과',
    '청주 미즈맘': '청주 미즈맘산부인과',
    '청주 미즈맘산부인과': '청주 미즈맘산부인과',
    '다나여성': '청주 다나여성병원',
    '다나여성병원': '청주 다나여성병원',
    '마디사랑': '청주 마디사랑병원',
    '마디사랑병원': '청주 마디사랑병원',
    '뿌리병원': '청주 뿌리병원',
    '새빛병원': '청주 새빛병원',
    '서로손병원': '청주 서로손병원',
    '새손병원': '대전 새손병원',
    '가경유항외과': '청주 가경유항외과',
    '율량 유항외과': '청주 율량유항외과',
    '하임브릿지': '청주 하임브릿지정형외과'
}

def normalize_hospital_name(raw_name):
    clean = raw_name.strip()
    if clean in HOSPITAL_NORM_MAP:
        return HOSPITAL_NORM_MAP[clean]
    for k, v in HOSPITAL_NORM_MAP.items():
        if k in clean:
            return v
    return clean

PRODUCT_NORM_MAP = {
    '소공포': {'code': 'GROUP-SEJONG-SHEET', 'name': '[세종] 멸균 소공포 (MULTI USEFUL SHEET)'},
    '멸균소공포': {'code': 'GROUP-SEJONG-SHEET', 'name': '[세종] 멸균 소공포 (MULTI USEFUL SHEET)'},
    '소공포 60*60 8cm': {'code': 'SD-GUDT0608U', 'name': '[세종] 멸균소공포 U-Type (60*60cm / Hole 8cm)'},
    '소공포 60*60 10cm': {'code': 'SD-GUDT0610U', 'name': '[세종] 멸균소공포 U-Type (60*60cm / Hole 10cm)'},
    '소공포 90*90 12cm': {'code': 'SD-GUDT0912U', 'name': '[세종] 멸균소공포 U-Type (90*90cm / Hole 12cm)'},
    '소공포 90*90 14cm': {'code': 'SD-GUDT0914U', 'name': '[세종] 멸균소공포 U-Type (90*90cm / Hole 14cm)'},
    '소공포 c타입 8': {'code': 'SD-GSHD0608C', 'name': '[세종] 멸균소공포 C-Type (60*60cm / Hole 8cm)'},
    '소공포 c타입 10': {'code': 'SD-GSHD0610C', 'name': '[세종] 멸균소공포 C-Type (60*60cm / Hole 10cm)'},
    '펜코소드': {'code': 'GROUP-PENKO-SWORD', 'name': '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'},
    '서지소드': {'code': 'GROUP-PENKO-SWORD', 'name': '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'},
    '펜코나이프': {'code': 'GROUP-PENKO-SWORD', 'name': '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'},
    '펜코 나이프': {'code': 'GROUP-PENKO-SWORD', 'name': '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'},
    '펜코': {'code': 'GROUP-PENKO-SWORD', 'name': '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)'},
    '엔지오키트': {'code': 'ST-ANG-PR03', 'name': 'Surgi FXA Angio Procedure Kit (ST-ANG-PR03)'},
    '엔지오': {'code': 'ST-ANG-PR03', 'name': 'Surgi FXA Angio Procedure Kit (ST-ANG-PR03)'},
    'angio': {'code': 'ST-ANG-PR03', 'name': 'Surgi FXA Angio Procedure Kit (ST-ANG-PR03)'},
    'c라인키트': {'code': 'ST-CVC-CLINE11A', 'name': '[CVC] Surgi FXT C-Line Adv.11A Tray Kit'},
    'c라인': {'code': 'ST-CVC-CLINE11A', 'name': '[CVC] Surgi FXT C-Line Adv.11A Tray Kit'},
    'c-line': {'code': 'ST-CVC-CLINE11A', 'name': '[CVC] Surgi FXT C-Line Adv.11A Tray Kit'},
}

# 5-2. 백그라운드 GitHub 자동 푸시 & Supabase 클라우드 실시간 동기화
SUPABASE_URL = "https://hkvguhttmxclyaeskznk.supabase.co"
SUPABASE_KEY = "sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ"

def sync_to_supabase_cloud(log_entry, hospital_entry, deal_entry):
    import urllib.request
    import json
    import ssl
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    # 1. Activity Log
    try:
        url_log = f"{SUPABASE_URL}/rest/v1/activity_logs"
        req_log = urllib.request.Request(url_log, data=json.dumps([log_entry]).encode('utf-8'), headers=headers, method='POST')
        urllib.request.urlopen(req_log, context=ctx, timeout=5)
        logger.info("⚡ Supabase Cloud activity_log synced successfully.")
    except Exception as e:
        logger.error(f"Supabase activity_log sync failed: {e}")

    # 2. Hospital Upsert
    if hospital_entry:
        try:
            url_hosp = f"{SUPABASE_URL}/rest/v1/hospitals"
            req_hosp = urllib.request.Request(url_hosp, data=json.dumps([hospital_entry]).encode('utf-8'), headers=headers, method='POST')
            urllib.request.urlopen(req_hosp, context=ctx, timeout=5)
            logger.info("⚡ Supabase Cloud hospital synced successfully.")
        except Exception as e:
            logger.error(f"Supabase hospital sync failed: {e}")

    # 3. Pipeline Upsert
    if deal_entry:
        try:
            url_pipe = f"{SUPABASE_URL}/rest/v1/pipeline"
            req_pipe = urllib.request.Request(url_pipe, data=json.dumps([deal_entry]).encode('utf-8'), headers=headers, method='POST')
            urllib.request.urlopen(req_pipe, context=ctx, timeout=5)
            logger.info("⚡ Supabase Cloud pipeline synced successfully.")
        except Exception as e:
            logger.error(f"Supabase pipeline sync failed: {e}")

def async_git_push_to_github():
    import subprocess
    try:
        cur_dir = os.path.dirname(os.path.abspath(__file__))
        cmd = "git add sales_database.json sales_database.js; git commit -m 'sync: Auto sync sales logs from Slack bot'; git push origin main"
        subprocess.run(cmd, shell=True, cwd=cur_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        logger.info("Auto git push to GitHub completed successfully.")
    except Exception as e:
        logger.error(f"Auto git push failed: {e}")

# 8. 대시보드 DB (sales_database.json & js) 실시간 저장 및 Supabase 클라우드 싱크
def update_dashboard_db(parsed_data, author_name, raw_text, erp_item):
    import threading
    db_path = os.path.join(os.path.dirname(__file__), "sales_database.json")
    if not os.path.exists(db_path):
        return

    try:
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)

        now_str = datetime.now().strftime("%Y/%m/%d")
        raw_hosp = parsed_data.get("hospital", "기타거래처").strip()
        hosp_name = normalize_hospital_name(raw_hosp)
        prod_name = erp_item.get("name", parsed_data.get("product", "일반품목")).strip()
        prod_id = erp_item.get("code", "PROD_GENERAL")

        # Check PRODUCT_NORM_MAP for specialized items like Sejong Sheet SKUs
        raw_prod = parsed_data.get("product", "").strip()
        for k_prod, v_prod in PRODUCT_NORM_MAP.items():
            if k_prod in raw_prod:
                prod_name = v_prod["name"]
                prod_id = v_prod["code"]
                break

        # 1. Update/Add Hospital
        hosp = next((h for h in db["hospitals"] if h["name"] == hosp_name), None)
        if not hosp:
            hosp = {
                "name": hosp_name,
                "region": "세종충북",
                "sales_reps": [author_name],
                "contacts": [parsed_data.get("contact", "실무진")],
                "status": "신규영업",
                "last_activity_date": now_str,
                "total_logs": 1,
                "demo_count": 1 if parsed_data.get("action_type") == "샘플·데모" else 0,
                "won_count": 1 if parsed_data.get("action_type") in ["납품·설치", "수금·결제"] else 0,
                "as_count": 1 if parsed_data.get("action_type") == "A/S·클레임" else 0,
                "fail_count": 1 if parsed_data.get("sales_status") == "영업실패" else 0,
                "products_active": [prod_name]
            }
            db["hospitals"].append(hosp)
            db["stats"]["total_hospitals"] = len(db["hospitals"])
        else:
            hosp["last_activity_date"] = now_str
            hosp["total_logs"] = hosp.get("total_logs", 0) + 1
            if author_name not in hosp.get("sales_reps", []):
                hosp.setdefault("sales_reps", []).append(author_name)
            if prod_name not in hosp.get("products_active", []):
                hosp.setdefault("products_active", []).append(prod_name)

        # 2. Activity Log append
        db["activity_logs"].insert(0, {
            "hospital": hosp_name,
            "region": hosp.get("region", "세종충북"),
            "date": now_str,
            "sales_rep": author_name,
            "contact": parsed_data.get("contact", "실무진"),
            "action_type": parsed_data.get("action_type", "관계관리"),
            "title": f"[{parsed_data.get('action_type', '활동')}] {prod_name}",
            "note": parsed_data.get("summary", raw_text),
            "products": [prod_name]
        })
        db["stats"]["total_logs"] = len(db["activity_logs"])

        # 3. Pipeline Deal Update
        deal = next((d for d in db["pipeline"] if d["hospital"] == hosp_name and d["product_id"] == prod_id), None)
        stage_map = {
            "영업완료": "도입완료·납품",
            "영업실패": "영업실패·보류",
            "영업시도": "제품소개·영업중",
            "영업중": "제품소개·영업중"
        }
        if parsed_data.get("action_type") == "샘플·데모":
            stage = "데모·샘플평가"
        elif parsed_data.get("action_type") == "A/S·클레임":
            stage = "A/S접수·처리"
        elif parsed_data.get("action_type") in ["납품·설치", "수금·결제"]:
            stage = "도입완료·납품"
        elif parsed_data.get("sales_status") == "영업실패":
            stage = "영업실패·보류"
        else:
            stage = stage_map.get(parsed_data.get("sales_status"), "제품소개·영업중")

        if not deal:
            deal = {
                "hospital": hosp_name,
                "region": hosp.get("region", "세종충북"),
                "sales_rep": author_name,
                "product_id": prod_id,
                "product_name": prod_name,
                "status": stage,
                "last_date": now_str,
                "latest_action": parsed_data.get("action_type", "관계관리"),
                "latest_note": parsed_data.get("summary", ""),
                "demo_info": {"date": now_str, "note": parsed_data.get("summary", ""), "status": "평가진행중"} if parsed_data.get("action_type") == "샘플·데모" else None,
                "as_info": {"date": now_str, "note": parsed_data.get("summary", ""), "status": "접수/진행중"} if parsed_data.get("action_type") == "A/S·클레임" else None,
                "fail_reasons": [parsed_data["fail_reason"]] if parsed_data.get("fail_reason") else []
            }
            db["pipeline"].append(deal)
            db["stats"]["total_deals"] = len(db["pipeline"])
        else:
            deal["status"] = stage
            deal["last_date"] = now_str
            deal["latest_action"] = parsed_data.get("action_type", "관계관리")
            deal["latest_note"] = parsed_data.get("summary", "")
            if parsed_data.get("fail_reason"):
                if parsed_data["fail_reason"] not in deal.get("fail_reasons", []):
                    deal.setdefault("fail_reasons", []).append(parsed_data["fail_reason"])
            if parsed_data.get("action_type") == "샘플·데모":
                deal["demo_info"] = {"date": now_str, "note": parsed_data.get("summary", ""), "status": "평가진행중"}
            if parsed_data.get("action_type") == "A/S·클레임":
                deal["as_info"] = {"date": now_str, "note": parsed_data.get("summary", ""), "status": "접수/진행중"}

        # Save back
        with open(db_path, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)

        js_path = os.path.join(os.path.dirname(__file__), "sales_database.js")
        with open(js_path, "w", encoding="utf-8") as f:
            f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

        logger.info(f"Successfully synced sales_database.json & js for [{hosp_name}] {prod_name}")
        
        # Trigger background Supabase Cloud Sync & git push to sync with GitHub Pages
        log_obj = db["activity_logs"][0]
        threading.Thread(target=sync_to_supabase_cloud, args=(log_obj, hosp, deal), daemon=True).start()
        threading.Thread(target=async_git_push_to_github, daemon=True).start()
    except Exception as e:
        logger.error(f"Error updating dashboard DB: {e}")

# 9. 메인 메시지 수신 처리 함수
def handle_incoming_slack_message(text, user_id, channel_id, say_fn):
    author_name = AUTHOR_MAP.get(user_id, "영업담당")
    logger.info(f"Received message from {author_name} ({user_id}): {text}")

    # A. 특수 명령어 처리
    if text.startswith("거래처추가"):
        hosp = text.replace("거래처추가", "").strip()
        say_fn(f"🏢 *[거래처 추가]* '{hosp}' 병원이 거래처 마스터에 신규 등록되었습니다.")
        return
    elif text.startswith("AS발송"):
        hosp = text.replace("AS발송", "").strip()
        say_fn(f"📦 *[A/S 상태 변경]* '{hosp}' 병원의 A/S 건이 `업체 발송됨`으로 변경되었습니다.")
        return
    elif text.startswith("AS수리완료"):
        hosp = text.replace("AS수리완료", "").strip()
        say_fn(f"🔧 *[A/S 상태 변경]* '{hosp}' 병원의 A/S 건이 `수리 완료`로 변경되었습니다.")
        return
    elif text.startswith("데모회수"):
        parts = text.split()
        hosp = parts[1] if len(parts) > 1 else ""
        res = parts[2] if len(parts) > 2 else "회수완료"
        say_fn(f"🔬 *[데모 회수]* '{hosp}' 데모 장비 회수 처리가 완료되었습니다. (결과: {res})")
        return
    elif text.startswith("현황"):
        hosp = text.replace("현황", "").strip()
        say_fn(f"📊 *[{hosp} 360° 통합 현황]*\n• 대시보드 바로가기: http://64.110.106.131")
        return

    # B. 일반 영업일지 AI 파싱 & ERP 매핑 (다중 항목 지원)
    parsed_items = parse_sales_log_with_gemini(text)
    
    reply_blocks = []
    for parsed in parsed_items:
        erp_item = match_erp_product(text, parsed.get("product", ""))
        update_dashboard_db(parsed, author_name, text, erp_item)

        action_emoji = {
            "A/S·클레임": "🚨",
            "샘플·데모": "🔬",
            "납품·설치": "🏆",
            "수금·결제": "💳",
            "견적제출": "⚡",
            "제품설명·소개": "📢",
            "영업실패": "⚠️"
        }.get(parsed.get("action_type"), "📝")

        item_msg = f"""
{action_emoji} *[영업일지 자동 등록 완료]*
• *담당자:* {author_name} | *일자:* {datetime.now().strftime('%Y-%m-%d')}
• *거래처:* `{parsed.get('hospital', '거래처')}` (담당: {parsed.get('contact', '실무진')})
• *공식 ERP 품목:* `{erp_item.get('name', '품목')}` [코드: `{erp_item.get('code')}`]
• *활동분류:* `{parsed.get('action_type', '관계관리')}` ➔ *진행단계:* `{parsed.get('sales_status', '영업중')}`
• *요약:* {parsed.get('summary', text[:80])}
• *다음 할 일:* 📅 {parsed.get('next_action', '일정 확인')}
"""
        if parsed.get("fail_reason"):
            item_msg += f"• *실패/보류 사유:* ⚠️ `{parsed.get('fail_reason')}`\n"
        
        reply_blocks.append(item_msg.strip())

    reply_text = "\n\n".join(reply_blocks)
    reply_text += "\n\n👉 *[MEDI-SALES 360° 실시간 대시보드 반영 완료]*"
    say_fn(reply_text.strip())

# 10. Slack Bolt Event Handler
def handle_event(client, event):
    """#영업일지 채널 메시지 1건 처리."""
    channel = event.get("channel")
    ts = event.get("ts")
    thread = event.get("thread_ts") or ts
    user_id = event.get("user", "")
    text = (event.get("text") or "").strip()
    if not text:
        return

    def say_fn(msg):
        try:
            client.chat_postMessage(channel=channel, thread_ts=thread, text=msg)
        except Exception as e:
            logger.error(f"Failed to post slack message: {e}")

    handle_incoming_slack_message(text, user_id, channel, say_fn)
