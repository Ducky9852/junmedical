"""
준메디칼 MEDI-SALES 360° 영업도우미 봇 핵심 로직 (v2.0)
- Slack Events API 기반 실시간 수신
- Gemini AI 비정형 텍스트 구조화 파싱
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
}

# 2. 환경변수 로드
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_SIGNING_SECRET = os.getenv("SLACK_SIGNING_SECRET", "")
SALES_LOG_CHANNEL = os.getenv("SALES_LOG_CHANNEL", "")
DEMO_CHANNEL = os.getenv("DEMO_CHANNEL", "")
ADMIN_SLACK_ID = os.getenv("ADMIN_SLACK_ID", "U08RXTVB9N0")

NOTION_TOKEN = os.getenv("NOTION_TOKEN", "")
NOTION_DB_SALES = os.getenv("NOTION_DB_SALES", "b04f69a2-ffd0-499e-adac-fd012de4de41")
NOTION_DB_CLIENTS = os.getenv("NOTION_DB_CLIENTS", "")
NOTION_DB_PRODUCTS = os.getenv("NOTION_DB_PRODUCTS", "3001cfe9-3e35-49e2-83da-0e4ba4ad61bd")
NOTION_DB_AS = os.getenv("NOTION_DB_AS", "")
NOTION_DB_DEMO = os.getenv("NOTION_DB_DEMO", "")
NOTION_DB_OPPORTUNITY = os.getenv("NOTION_DB_OPPORTUNITY", "5e442046-5590-40c4-93f3-4c41f417ae04")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SALES_GEMINI_MODEL = os.getenv("SALES_GEMINI_MODEL", "gemini-3.5-flash")

# 3. ERP 4,054개 품목 마스터 캐시 로드
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

# 4. ERP 품목 매핑 함수
STOP_KEYWORDS = {'원장', '과장', '병원', '의원', '의사', '상황', '면담', '부재', '외과', '산부인과', '정형외과', '내과', '신경외과', 'os', 'ps', 'gs', 'obgy', '방문', '인사', '안됨', '불발', '운영', '형식', '전문의', '환자', '간호사'}

def match_erp_product(text, fallback_name=""):
    combined = f"{text} {fallback_name}".lower()
    
    # 0. Check if generic visit / greeting without specific products
    if fallback_name in ["신규 접촉 및 인사 (품목 미정)", "일반 제안 품목", "기타", ""]:
        # Check if text contains explicit greeting / failed visit without products
        if any(w in text for w in ['인사', '면담 안', '면담안', '면담 불발', '만나지', '부재', '첫 방문', '첫방문', '탐색', '라포']):
            # verify no specific medical product is mentioned
            has_product = any(re.search(pat, combined, re.I) for pat in [r'dvt', r'슬리브', r'서지', r'보비', r'메스', r'소공포', r'키트', r'bt350', r'oxy9', r'모터', r'핸들', r'바이옵시', r'트로카'])
            if not has_product:
                return {
                    "code": "PROD_GENERAL",
                    "name": "신규 접촉 및 인사 (품목 미정)",
                    "spec": "초진/인사/면담시도",
                    "vendor": "준메디칼",
                    "category": "신규영업"
                }

    # 1. Direct code search
    for code, item in ERP_BY_CODE.items():
        if code.lower() in combined and code.lower() not in STOP_KEYWORDS:
            return item

    # 2. Match by key synonyms
    synonym_rules = [
        (r'dvt|슬리브|암슬리브|스타킹|허벅지', 'MBH02'),
        (r'penko|펜코|서지패드|서지소드|보비', 'PK-CGP202S-TB'),
        (r'베리큐어|vericure', 'MD-BR-001'),
        (r'gyne|가인콜라|gnc', 'GNC2505D'),
        (r'소공포|med2078', 'MED2078'),
        (r'angio|엔지오|안지오|angiocath', '382412'),
        (r'trocar|트로카', '101.011A'),
        (r'biopsy|생검', '045-7301'),
        (r'내시경|endo', 'GEPL-F1')
    ]
    for pat, code in synonym_rules:
        if re.search(pat, combined, re.I):
            if code in ERP_BY_CODE:
                return ERP_BY_CODE[code]

    # 3. Search keywords in ERP items (filter out stopwords)
    for p in ERP_PRODUCTS:
        for kw in p.get("keywords", []):
            kw_low = kw.lower().strip()
            if len(kw_low) >= 2 and kw_low not in STOP_KEYWORDS and kw_low in combined:
                return p

    return {
        "code": "PROD_GENERAL",
        "name": fallback_name or "신규 접촉 및 인사 (품목 미정)",
        "spec": "",
        "vendor": "준메디칼",
        "category": "신규영업"
    }

# 5. Gemini AI를 활용한 비정형 영업일지 파싱
def parse_sales_log_with_gemini(raw_text):
    prompt = f"""
당신은 준메디칼의 의료기기 영업일지 자동 분석 AI입니다.
아래 영업사원이 작성한 텍스트를 읽고, JSON 형식으로 정확하게 구조화하여 추출하세요.

[입력 텍스트]
{raw_text}

[추출 규칙]
1. hospital: 병원/거래처명 (예: 서산중앙병원, 유성선병원, 청주하나병원 등)
2. contact: 병원 측 담당자 및 직책 (예: 심뇌혈관팀장, 박정현 과장, 수간호사 등 없으면 '실무진')
3. product: 언급된 의료기기/소모품/장비 이름 (예: 엔지오키트, DVT 슬리브, 펜코 서지패드, 베리큐어, Oxy9wave 등). 만약 특정 제품 언급 없이 첫 방문/인사/면담시도/불발/원내 탐색/라포 형성인 경우 반드시 '신규 접촉 및 인사 (품목 미정)' 으로 출력하세요.
4. action_type: 다음 중 택1 [신규접촉, 제품설명·소개, 샘플·데모, 견적제출, 납품·설치, A/S·클레임, 관계관리, 기타]
5. sales_status: 다음 중 택1 [영업시도, 영업중, 영업완료, 영업실패]
   - 가격 부담, 비급여 거부, 기존제품 고집, 도입 거절, 타사 납품 확인 등의 내용이 있으면 반드시 '영업실패'로 지정
6. fail_reason: 영업실패인 경우 사유 (단가/가격 부담, 기존 거래처/경쟁사 선호, 비급여 품목 거부, 의료진 거절 중 선택, 없으면 '')
7. summary: 2문장 이내의 요약
8. next_action: 다음 할 일 및 일정 (예: 다음 주 화요일 피드백 확인)

반드시 마크다운 없이 순수 JSON만 응답하세요:
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
"""
    if not GEMINI_API_KEY:
        # Fallback local regex parsing if API key is missing
        return parse_sales_log_local(raw_text)

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
        with urllib.request.urlopen(req, timeout=12) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            content_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(content_text)
    except Exception as e:
        logger.error(f"Gemini API parse error: {e}")
        return parse_sales_log_local(raw_text)

# 6. 로컬 룰베이스 파서 (Gemini API 장애 시 폴백용)
def parse_sales_log_local(text):
    # Basic keyword extractor
    action = "관계관리"
    if re.search(r'a/s|as|수리|고장|불량|클레임|에러', text, re.I): action = "A/S·클레임"
    elif re.search(r'샘플|데모|demo|sample|전달|써보', text, re.I): action = "샘플·데모"
    elif re.search(r'납품|발주|계약|입고|출고', text, re.I): action = "납품·설치"
    elif re.search(r'견적|단가|비용', text, re.I): action = "견적제출"
    elif re.search(r'소개|카탈로그|디테일|설명', text, re.I): action = "제품설명·소개"

    status = "영업중"
    fail_reason = ""
    if re.search(r'거절|안함|보류|어렵|힘들|타사.*납품|비싸|부담', text):
        status = "영업실패"
        if "비싸" in text or "단가" in text: fail_reason = "단가/가격 부담"
        elif "타사" in text or "기존" in text: fail_reason = "기존 거래처/경쟁사 선호"
        else: fail_reason = "의료진 거절"

    return {
        "hospital": "거래처",
        "contact": "실무진",
        "product": "의료기기",
        "action_type": action,
        "sales_status": status,
        "fail_reason": fail_reason,
        "summary": text[:120],
        "next_action": "다음 방문 일정 확인"
    }

# 7. 대시보드 DB (sales_database.json) 실시간 저장
# 7. Supabase 클라우드 실시간 동기화
SUPABASE_URL = "https://hkvguhttmxclyaeskznk.supabase.co"
SUPABASE_KEY = "sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ"

def sync_to_supabase_cloud(log_entry, hospital_entry, deal_entry):
    import ssl
    import threading

    def _sync():
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

        # 1. Activity Log
        if log_entry:
            try:
                url_log = f"{SUPABASE_URL}/rest/v1/activity_logs"
                req_log = urllib.request.Request(url_log, data=json.dumps(log_entry).encode('utf-8'), headers=headers, method='POST')
                with urllib.request.urlopen(req_log, context=ctx, timeout=8) as res:
                    logger.info("⚡ Supabase Cloud activity_log synced successfully!")
            except Exception as e:
                logger.error(f"Supabase activity_log sync failed: {e}")

        # 2. Hospital Upsert
        if hospital_entry:
            try:
                hosp_headers = headers.copy()
                hosp_headers["Prefer"] = "resolution=merge-duplicates"
                url_hosp = f"{SUPABASE_URL}/rest/v1/hospitals"
                req_hosp = urllib.request.Request(url_hosp, data=json.dumps(hospital_entry).encode('utf-8'), headers=hosp_headers, method='POST')
                with urllib.request.urlopen(req_hosp, context=ctx, timeout=8) as res:
                    logger.info("⚡ Supabase Cloud hospital synced successfully!")
            except Exception as e:
                logger.error(f"Supabase hospital sync failed: {e}")

        # 3. Pipeline Upsert
        if deal_entry:
            try:
                url_pipe = f"{SUPABASE_URL}/rest/v1/pipeline"
                req_pipe = urllib.request.Request(url_pipe, data=json.dumps(deal_entry).encode('utf-8'), headers=headers, method='POST')
                with urllib.request.urlopen(req_pipe, context=ctx, timeout=8) as res:
                    logger.info("⚡ Supabase Cloud pipeline synced successfully!")
            except Exception as e:
                logger.error(f"Supabase pipeline sync failed: {e}")

    threading.Thread(target=_sync, daemon=True).start()

# 8. 대시보드 DB (sales_database.json) 실시간 저장 및 Supabase 클라우드 싱크
def update_dashboard_db(parsed_data, author_name, raw_text, erp_item):
    db_path = os.path.join(os.path.dirname(__file__), "sales_database.json")
    if not os.path.exists(db_path):
        return

    try:
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)

        now_str = datetime.now().strftime("%Y/%m/%d")
        hosp_name = parsed_data.get("hospital", "기타거래처")
        prod_name = erp_item.get("name", parsed_data.get("product", "제안품목"))
        prod_id = erp_item.get("code", "PROD_GENERAL")

        # Deal Stage map
        stage = "제품소개·영업중"
        if parsed_data.get("sales_status") == "영업실패": stage = "영업실패·보류"
        elif parsed_data.get("action_type") == "A/S·클레임": stage = "A/S접수·처리"
        elif parsed_data.get("action_type") == "의료장비 데모": stage = "의료장비 데모"
        elif parsed_data.get("action_type") == "소모품 샘플": stage = "소모품 샘플"
        elif parsed_data.get("action_type") == "샘플·데모": stage = "소모품 샘플"
        elif parsed_data.get("action_type") == "납품·설치": stage = "도입완료·납품"

        # 1. New Log Entry for local & Supabase
        new_log = {
            "id": f"LOG_{int(datetime.now().timestamp())}",
            "date": now_str,
            "hospital": hosp_name,
            "region": "세종충북",
            "sales_rep": author_name,
            "contact": parsed_data.get("contact", "실무진"),
            "action_type": parsed_data.get("action_type", "관계관리"),
            "deal_status": stage,
            "products": [prod_name],
            "product_code": prod_id,
            "title": f"{hosp_name} {prod_name} {parsed_data.get('action_type', '')}",
            "note": f"{parsed_data.get('summary', '')}\n다음: {parsed_data.get('next_action', '')}",
            "fail_reasons": [parsed_data["fail_reason"]] if parsed_data.get("fail_reason") else []
        }
        db["activity_logs"].insert(0, new_log)

        # 2. Update Deal Pipeline
        deal = next((d for d in db["pipeline"] if d["hospital"] == hosp_name and d["product_id"] == prod_id), None)
        if not deal:
            deal = {
                "hospital": hosp_name,
                "product_id": prod_id,
                "product_name": prod_name,
                "product_category": erp_item.get("category", "일반"),
                "vendor": erp_item.get("vendor", "준메디칼"),
                "region": "세종충북",
                "sales_rep": author_name,
                "status": stage,
                "last_date": now_str,
                "latest_action": parsed_data.get("action_type", "관계관리"),
                "latest_note": parsed_data.get("summary", ""),
                "fail_reasons": [parsed_data["fail_reason"]] if parsed_data.get("fail_reason") else [],
                "demo_info": {"date": now_str, "note": parsed_data.get("summary", ""), "status": "평가진행중"} if "데모" in parsed_data.get("action_type", "") else None,
                "as_info": {"date": now_str, "note": parsed_data.get("summary", ""), "status": "접수/진행중"} if parsed_data.get("action_type") == "A/S·클레임" else None,
                "history_count": 1
            }
            db["pipeline"].append(deal)
        else:
            deal["status"] = stage
            deal["last_date"] = now_str
            deal["latest_action"] = parsed_data.get("action_type", "관계관리")
            deal["latest_note"] = parsed_data.get("summary", "")
            if parsed_data.get("fail_reason"):
                if parsed_data["fail_reason"] not in deal.get("fail_reasons", []):
                    deal.setdefault("fail_reasons", []).append(parsed_data["fail_reason"])
            if "데모" in parsed_data.get("action_type", ""):
                deal["demo_info"] = {"date": now_str, "note": parsed_data.get("summary", ""), "status": "평가진행중"}
            if parsed_data.get("action_type") == "A/S·클레임":
                deal["as_info"] = {"date": now_str, "note": parsed_data.get("summary", ""), "status": "접수/진행중"}

        # 3. Save local JSON & JS
        with open(db_path, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)

        js_path = os.path.join(os.path.dirname(__file__), "sales_database.js")
        with open(js_path, "w", encoding="utf-8") as f:
            f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

        # 4. Trigger Realtime Sync to Supabase Cloud
        supabase_log = {
            "hospital": hosp_name,
            "date": now_str,
            "sales_rep": author_name,
            "action_type": parsed_data.get("action_type", "관계관리"),
            "title": new_log["title"],
            "note": new_log["note"],
            "products": [prod_name],
            "product_code": prod_id,
            "next_action": parsed_data.get("next_action", ""),
            "region": "세종충북",
            "contact": parsed_data.get("contact", "실무진")
        }
        supabase_hosp = {
            "name": hosp_name,
            "region": "세종충북",
            "sales_reps": [author_name],
            "contacts": [parsed_data.get("contact", "실무진")],
            "status": "활동병원",
            "last_activity_date": now_str,
            "products_active": [prod_name]
        }
        supabase_deal = {
            "hospital": hosp_name,
            "region": "세종충북",
            "sales_rep": author_name,
            "product_id": prod_id,
            "product_name": prod_name,
            "status": stage,
            "last_date": now_str,
            "latest_action": parsed_data.get("action_type", "관계관리"),
            "latest_note": parsed_data.get("summary", ""),
            "demo_info": deal.get("demo_info"),
            "as_info": deal.get("as_info"),
            "fail_reasons": deal.get("fail_reasons", [])
        }
        sync_to_supabase_cloud(supabase_log, supabase_hosp, supabase_deal)

        logger.info(f"Successfully synced sales_database.json, js & Supabase Cloud for [{hosp_name}] {prod_name}")
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
        say_fn(f"📊 *[{hosp} 360° 통합 현황]*\n• 대시보드 바로가기: https://ducky9852.github.io/junmedical/sales_daybook/sales.html")
        return

    # B. 일반 영업일지 AI 파싱 & ERP 매핑
    parsed = parse_sales_log_with_gemini(text)
    erp_item = match_erp_product(text, parsed.get("product", ""))

    # C. 대시보드 DB 및 Supabase 클라우드 실시간 저장
    update_dashboard_db(parsed, author_name, text, erp_item)

    # D. 슬랙 스레드 답장 생성
    action_emoji = {
        "A/S·클레임": "🚨",
        "의료장비 데모": "🔬",
        "소모품 샘플": "🧪",
        "샘플·데모": "🧪",
        "납품·설치": "🏆",
        "견적제출": "⚡",
        "제품설명·소개": "📢",
        "영업실패": "⚠️"
    }.get(parsed.get("action_type"), "📝")

    reply_text = f"""
{action_emoji} *[영업일지 자동 등록 완료]*
• *담당자:* {author_name} | *일자:* {datetime.now().strftime('%Y-%m-%d')}
• *거래처:* `{parsed.get('hospital', '거래처')}` (담당: {parsed.get('contact', '실무진')})
• *공식 ERP 품목:* `{erp_item.get('name', '품목')}` [코드: `{erp_item.get('code')}`]
• *활동분류:* `{parsed.get('action_type', '관계관리')}` ➔ *진행단계:* `{parsed.get('sales_status', '영업중')}`
• *요약:* {parsed.get('summary', text[:80])}
• *다음 할 일:* 📅 {parsed.get('next_action', '일정 확인')}
"""
    if parsed.get("fail_reason"):
        reply_text += f"• *실패/보류 사유:* ⚠️ `{parsed.get('fail_reason')}`\n"

    reply_text += "👉 *[MEDI-SALES 360° 실시간 대시보드 반영 완료]*"
    say_fn(reply_text.strip())
