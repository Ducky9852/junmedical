import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('sales_daybook/sales_database.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

pipeline = db.get('pipeline', [])
logs = db.get('activity_logs', [])

print(f"Total pipeline deals: {len(pipeline)}")
print(f"Total logs: {len(logs)}")

print("\n" + "="*60)
print("🔍 1. 의심 항목: 범용 임시 제품명(PROD_GENERAL 등)으로 등록된 파이프라인")
print("="*60)
for d in pipeline:
    pid = d.get('product_id', '')
    pname = d.get('product_name', '')
    note = d.get('latest_note', '') or ''
    if pid in ['PROD_GENERAL', 'PROD_MISC', ''] or '일반' in pname or '신규' in pname or '기타' in pname:
        print(f"🏥 병원: {d.get('hospital')}")
        print(f"   현재 품목: [{pid}] {pname} | 상태: {d.get('status')}")
        print(f"   최근 일지 내용: {note}")
        print("-" * 50)

print("\n" + "="*60)
print("🔍 2. 의심 항목: 내용(일지)과 제품명이 불일치해 보이는 파이프라인")
print("="*60)
keywords_map = {
    "DVT": ["dvt", "슬리브", "sleeve", "압박"],
    "드레이프": ["드레이프", "drape", "소공포", "시트", "포"],
    "바이옵시": ["biopsy", "바이옵시", "펀치", "punch", "en-shot", "생검"],
    "보비": ["bovie", "보비", "소작", "zeus", "prime", "전기"],
    "소독제": ["hygent", "하이지엔트", "소독", "세척"],
    "모슬레이터": ["모슬레이터", "morcellator", "rotocut", "소드", "칼날", "blade"]
}

for d in pipeline:
    pname = (d.get('product_name', '') or '').lower()
    note = (d.get('latest_note', '') or '').lower()
    hosp = d.get('hospital', '')
    
    # Check if note talks about a totally different product category
    for cat, kws in keywords_map.items():
        if any(k in note for k in kws):
            # If note has strong keyword for `cat`, but `pname` doesn't match at all
            if not any(k in pname for k in kws):
                # Only flag if pname is something specific
                print(f"🏥 병원: {hosp}")
                print(f"   현재 매핑된 제품: [{d.get('product_id')}] {d.get('product_name')}")
                print(f"   일지 키워드 추정: [{cat}] 관련 내용 감지")
                print(f"   일지 내용: {d.get('latest_note')}")
                print("-" * 50)
                break
