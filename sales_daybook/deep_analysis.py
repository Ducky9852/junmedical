import zipfile
import csv
import io
import sys
import re
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

zip_path = 'notion_data/ExportBlock-b14e7eb7-547c-47c1-aece-aae9b121b8fa-Part-1.zip'

with zipfile.ZipFile(zip_path, 'r') as zf:
    with zf.open('영업관리 3cbe476c01fb4d9f8d78f00cb9dc182a.csv') as f:
        text = f.read().decode('utf-8-sig')
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        rows = list(reader)

print(f"Total Rows: {len(rows)}")

# 1. Product mention analysis in 업무 내용 & 영업 내용 vs 영업 제품 column
product_dict = [
    "ANGIO", "엔지오", "안지오",
    "PENKO", "펜코", "SURGI PAD", "SURGI SWORD", "서포트 플레이트", "DF",
    "DVT", "슬리브", "SLEEVE",
    "이지큐", "EG-Q", "EZ-Q", "본드", "EzQbond",
    "스카노스", "스카노스겔",
    "베리큐어", "Vericure",
    "큐어폼", "Cureform",
    "GYNE COLLA", "가인콜라", "자궁경", "복강경", "트로카", "아티센셜",
    "EN-Shot", "엔샷", "Biopsy", "생검",
    "내시경바지", "내시경 바지", "소공포", "드레싱", "드레싱키트",
    "맘모톰", "패치", "카테터", "석션", "Bipolar", "메릴랜드", "Dissector", "헤모스탯"
]

records_with_product_col = 0
records_with_product_in_text = 0
found_keywords = Counter()
status_counter = Counter()
action_counter = Counter()
hospital_status = {}

for r in rows:
    row_dict = dict(zip(header, r))
    prod_col = row_dict.get('영업 제품', '').strip()
    biz_content = row_dict.get('업무 내용', '')
    title_content = row_dict.get('영업 내용', '')
    combined_text = f"{title_content} {biz_content}"
    status = row_dict.get('상태', '').strip()
    action = row_dict.get('Action_Type', '').strip()
    hospital = re.sub(r'\s*\(https://[^\)]+\)', '', row_dict.get('거래처', '').strip())
    
    if prod_col:
        records_with_product_col += 1
    
    matched = []
    for kw in product_dict:
        if re.search(re.escape(kw), combined_text, re.IGNORECASE):
            matched.append(kw)
            found_keywords[kw] += 1
            
    if matched:
        records_with_product_in_text += 1
        
    status_counter[status] += 1
    if action:
        action_counter[action] += 1
        
    if hospital:
        if hospital not in hospital_status:
            hospital_status[hospital] = Counter()
        hospital_status[hospital][status] += 1

print(f"\n[제품 데이터 입력 누락 통계]")
print(f"- '영업 제품' 필드에 정형 입력된 건수: {records_with_product_col} / {len(rows)} ({records_with_product_col/len(rows)*100:.1f}%)")
print(f"- 본문 텍스트 내에서 제품 키워드가 발견된 건수: {records_with_product_in_text} / {len(rows)} ({records_with_product_in_text/len(rows)*100:.1f}%)")
print(f"- 'Action_Type' 필드 입력된 건수: {sum(action_counter.values())} / {len(rows)} ({sum(action_counter.values())/len(rows)*100:.1f}%)")

print("\n[자주 언급되는 제품/품목 키워드 Top 20 (본문 파싱)]")
for kw, cnt in found_keywords.most_common(20):
    print(f"  {kw}: {cnt}회")

print("\n[상태 분포]")
for st, cnt in status_counter.items():
    print(f"  {st}: {cnt}건")

print("\n[Action_Type 분포]")
for act, cnt in action_counter.items():
    print(f"  {act}: {cnt}건")

print("\n[샘플 텍스트 분석 - 비정형 데이터 사례 5개]")
sample_unstructured = [r for r in rows if not r[header.index('영업 제품')].strip() and len(r[header.index('업무 내용')].strip()) > 30][:5]
for i, r in enumerate(sample_unstructured):
    row_dict = dict(zip(header, r))
    hosp = re.sub(r'\s*\(https://[^\)]+\)', '', row_dict.get('거래처', '').strip())
    print(f"\n--- 사례 {i+1} ---")
    print(f"병원: {hosp} | 일자: {row_dict.get('영업일')} | 상태: {row_dict.get('상태')} | 액션: {row_dict.get('Action_Type') or '(미입력)'}")
    print(f"영업내용: {row_dict.get('영업 내용')}")
    print(f"업무내용: {row_dict.get('업무 내용')}")
