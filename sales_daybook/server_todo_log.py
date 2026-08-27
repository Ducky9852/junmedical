# -*- coding: utf-8 -*-
"""
할 일 자동화 — #할일 채널 처리 (영업도우미봇에 통합).

흐름: 슬랙 #할일 채널 메시지 → Gemini 파싱 (제목·우선순위·분류·마감일 추출)
      → 노션 ✅ 할 일 관리 DB 저장 → 스레드에 결과 댓글.

환경변수(salesbot.service에 추가):
  TODO_CHANNEL   : #할일 Slack 채널 ID  (예: C08XXXXXXXX)
  NOTION_TOKEN   : 기존 영업일지 봇 공용 (이미 설정됨)
  NOTION_DB_TODO : ✅ 할 일 관리 DB ID  (기본값 내장)
  GEMINI_API_KEY : 기존 공용 (이미 설정됨)
  SALES_GEMINI_MODEL : (선택) Gemini 모델명, 기본 gemini-2.5-flash
  ADMIN_SLACK_ID : (선택) 오류 알림 받을 관리자 Slack ID
"""

import os
import re
import json
import time
import urllib.request

TODO_CHANNEL      = os.environ.get("TODO_CHANNEL", "").strip()
NOTION_TOKEN      = os.environ.get("NOTION_TOKEN", "").strip()
# 기본값: ✅ 할 일 관리 DB (3e587523-ca24-4412-9ac0-04b2e753e942)
NOTION_DB_TODO    = os.environ.get(
    "NOTION_DB_TODO", "3e587523-ca24-4412-9ac0-04b2e753e942").strip()
GEMINI_API_KEY    = os.environ.get("GEMINI_API_KEY", "").strip()
TODO_GEMINI_MODEL = os.environ.get("SALES_GEMINI_MODEL", "gemini-2.5-flash").strip()
NOTION_VER        = "2022-06-28"

# 노션 DB 옵션값 (스키마 그대로)
PRIORITY_OPTIONS = ["🔴 긴급", "🟡 중요", "🟢 일반"]
CATEGORY_OPTIONS = ["병원 영업", "입찰·납품", "행정·세무", "제품 조사", "기타", "홈페이지"]


def enabled():
    return bool(TODO_CHANNEL and NOTION_TOKEN and NOTION_DB_TODO)


def is_todo_channel(channel):
    return bool(TODO_CHANNEL) and channel == TODO_CHANNEL


# ── 노션 REST ────────────────────────────────────────────────────────
def _notion(method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        "https://api.notion.com/v1" + path, data=data, method=method,
        headers={
            "Authorization": "Bearer " + NOTION_TOKEN,
            "Notion-Version": NOTION_VER,
            "Content-Type": "application/json",
        })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


# ── Gemini 파싱 ──────────────────────────────────────────────────────
PROMPT = """당신은 할 일 메모를 구조화하는 어시스턴트입니다.
아래 메모에서 정보를 추출해 JSON으로만 답하세요. 설명·마크다운 없이 순수 JSON만.

[오늘 날짜]
{today}

[규칙]
1. title: 할 일 제목 (핵심 동작+대상, 간결하게 15자 이내)
2. priority: 아래 중 정확히 하나
   - "🔴 긴급": 🔴·빨강·긴급·급함·시급·오늘까지·당장·꼭이 있거나 명백히 급한 경우
   - "🟡 중요": 🟡·중요·노랑·이번 주·important
   - "🟢 일반": 그 외 또는 언급 없는 경우
3. category: 아래 중 하나
   - "병원 영업": 병원 방문·미팅·영업 활동
   - "입찰·납품": 견적·납품·입찰·계약
   - "행정·세무": 세금·서류·계산서·행정·세무사·급여
   - "제품 조사": 제품 리서치·조사·분석
   - "홈페이지": 웹사이트·홈페이지·도메인·GitHub
   - "기타": 그 외
4. due_date: YYYY-MM-DD 형식, 없으면 null
   - "오늘" → {today}
   - "내일" → {tomorrow}
   - "이번 주" / "이번주" → {this_friday}
   - "다음 주" / "다음주" → {next_friday}
   - "~까지" 표현에서 날짜 추출
   - 명시된 날짜(예: 8/20, 20일) → 해당 날짜 (올해 기준)
5. hospital: 관련 병원·거래처명 (없으면 "")
6. memo: title에 담기 어려운 추가 세부사항 (없으면 "")

[출력 형식 - 이것만 출력]
{{"title":"","priority":"🟢 일반","category":"기타","due_date":null,"hospital":"","memo":""}}

[메모 원문]
{raw}"""


def _date_kst(offset_days=0):
    """KST 기준 날짜 반환 (YYYY-MM-DD)."""
    t = time.gmtime(time.time() + 9 * 3600 + offset_days * 86400)
    return time.strftime("%Y-%m-%d", t)


def _this_friday():
    """이번 주 금요일 (KST). 이미 금요일이면 오늘."""
    t = time.gmtime(time.time() + 9 * 3600)
    days = (4 - t.tm_wday) % 7
    return _date_kst(days)


def _next_friday():
    """다음 주 금요일 (KST)."""
    days = (4 - time.gmtime(time.time() + 9 * 3600).tm_wday) % 7
    return _date_kst(days + 7)


def gemini_extract(raw: str) -> dict:
    from google import genai  # google-genai 패키지 (기존 봇과 동일)
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY 미설정")

    prompt = PROMPT.format(
        today=_date_kst(0),
        tomorrow=_date_kst(1),
        this_friday=_this_friday(),
        next_friday=_next_friday(),
        raw=raw,
    )
    client = genai.Client(api_key=GEMINI_API_KEY)
    it = client.interactions.create(
        model=TODO_GEMINI_MODEL,
        input=[{"type": "text", "text": prompt}])
    text = re.sub(
        r"^```(json)?|```$", "",
        (it.output_text or "").strip(), flags=re.MULTILINE).strip()
    return json.loads(text)


# ── 노션 저장 ────────────────────────────────────────────────────────
def create_todo_page(title, priority, category, due_date, hospital, memo):
    """✅ 할 일 관리 DB에 새 항목 생성. page_id 반환."""
    props = {
        "할 일": {"title": [{"text": {"content": title[:200]}}]},
        "상태":  {"select": {"name": "해야 함"}},
    }
    if priority in PRIORITY_OPTIONS:
        props["우선순위"] = {"select": {"name": priority}}
    if category in CATEGORY_OPTIONS:
        props["분류"] = {"select": {"name": category}}
    if due_date:
        props["마감일"] = {"date": {"start": due_date}}
    if hospital:
        props["관련 병원"] = {"rich_text": [{"text": {"content": hospital[:200]}}]}
    if memo:
        props["메모"] = {"rich_text": [{"text": {"content": memo[:1900]}}]}

    r = _notion("POST", "/pages",
                {"parent": {"database_id": NOTION_DB_TODO}, "properties": props})
    return r.get("id")


# ── 메인 처리 ────────────────────────────────────────────────────────
def _dm_admin(client, msg):
    admin_id = os.environ.get("ADMIN_SLACK_ID", "").strip()
    if not admin_id:
        return
    try:
        client.chat_postMessage(channel=admin_id, text=f"[할일봇 오류] {msg}")
    except Exception:  # noqa: BLE001
        pass


def handle_event(client, event):
    """#할일 채널 메시지 1건 처리."""
    channel = event["channel"]
    ts      = event.get("ts")
    thread  = event.get("thread_ts") or ts
    text    = (event.get("text") or "").strip()
    if not text:
        return

    # 1) Gemini 파싱
    try:
        data = gemini_extract(text)
    except Exception as e:  # noqa: BLE001
        _dm_admin(client, f"Gemini 파싱 실패: {e}\n원문: {text[:200]}")
        client.chat_postMessage(
            channel=channel, thread_ts=thread,
            text=f"⚠️ 자동 저장 실패(Gemini 오류): {e}")
        return

    # 2) 값 보정
    title    = (data.get("title") or text[:50]).strip()
    priority = data.get("priority") or "🟢 일반"
    category = data.get("category") or "기타"
    due_date = data.get("due_date") or None
    hospital = (data.get("hospital") or "").strip()
    memo     = (data.get("memo") or "").strip()

    if priority not in PRIORITY_OPTIONS:
        priority = "🟢 일반"
    if category not in CATEGORY_OPTIONS:
        category = "기타"

    # 3) 노션 저장
    try:
        page_id = create_todo_page(title, priority, category, due_date, hospital, memo)
    except Exception as e:  # noqa: BLE001
        _dm_admin(client, f"노션 저장 실패: {e}\n원문: {text[:200]}")
        client.chat_postMessage(
            channel=channel, thread_ts=thread,
            text=f"⚠️ 노션 저장 실패: {e}")
        return

    # 4) 스레드에 결과 회신
    due_str  = f" · 마감 {due_date}" if due_date else ""
    hosp_str = f" · {hospital}" if hospital else ""
    notion_url = f"https://www.notion.so/{page_id.replace('-', '')}"
    reply = (
        f"✅ 할 일 저장됨\n"
        f"*{title}*\n"
        f"{priority} · {category}{due_str}{hosp_str}\n"
        f"<{notion_url}|노션에서 보기>"
    )
    client.chat_postMessage(channel=channel, thread_ts=thread, text=reply)
