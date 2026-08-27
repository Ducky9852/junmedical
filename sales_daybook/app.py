"""
준메디칼 MEDI-SALES 360° 서버 진입점 (app.py)
- Slack Bolt 리스너 (Events API & Socket Mode)
- 대시보드 웹 정적 서빙 및 REST API 제공
"""

import os
import sys
import json
import logging
from threading import Thread
from http.server import HTTPServer, SimpleHTTPRequestHandler

from sales_log import (
    SLACK_BOT_TOKEN,
    SLACK_SIGNING_SECRET,
    SALES_LOG_CHANNEL,
    DEMO_CHANNEL,
    handle_incoming_slack_message
)

# 로깅 설정
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AppServer")

# Slack Bolt App 초기화
try:
    from slack_bolt import App
    from slack_bolt.adapter.socket_mode import SocketModeHandler
    bolt_app = App(token=SLACK_BOT_TOKEN, signing_secret=SLACK_SIGNING_SECRET)
    SLACK_BOLT_AVAILABLE = True
except ImportError:
    logger.warning("slack_bolt package not found. Running in web dashboard standalone mode.")
    SLACK_BOLT_AVAILABLE = False
    bolt_app = None

# 슬랙 메시지 이벤트 핸들러
if SLACK_BOLT_AVAILABLE and bolt_app:
    @bolt_app.event("message")
    def handle_message_events(body, logger, say):
        event = body.get("event", {})
        text = event.get("text", "").strip()
        user_id = event.get("user", "")
        channel_id = event.get("channel", "")
        subtype = event.get("subtype", "")

        # 봇 자신의 메시지이거나 빈 메시지, 스레드 답글 제외
        if subtype or not text or event.get("bot_id"):
            return

        # 영업일지 채널 또는 데모 채널 메시지 처리
        try:
            handle_incoming_slack_message(text, user_id, channel_id, say)
        except Exception as e:
            logger.error(f"Error processing slack message: {e}")
            say(f"⚠️ 일지 처리 중 일시적 오류가 발생했습니다: {e}")

# 정적 웹 대시보드 서버 (포트 8080)
class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

def run_web_server(port=8080):
    server_address = ("", port)
    httpd = HTTPServer(server_address, DashboardHandler)
    logger.info(f"🌐 MEDI-SALES 360° Dashboard Server running on http://0.0.0.0:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    logger.info("Starting MEDI-SALES 360 Server & Slack Bot...")
    
    # 1. Start Web Dashboard in background thread
    web_thread = Thread(target=run_web_server, args=(8080,), daemon=True)
    web_thread.start()

    # 2. Start Slack Bot
    if SLACK_BOLT_AVAILABLE and bolt_app and SLACK_BOT_TOKEN:
        app_token = os.getenv("SLACK_APP_TOKEN", "")
        if app_token and app_token.startswith("xapp-"):
            logger.info("Connecting to Slack via Socket Mode...")
            handler = SocketModeHandler(bolt_app, app_token)
            handler.start()
        else:
            logger.info("Starting Slack Bolt HTTP receiver...")
            bolt_app.start(port=int(os.getenv("PORT", 3000)))
    else:
        logger.info("Web Dashboard only mode. Keeping main thread alive.")
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Server terminated.")
