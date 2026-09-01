import sys, openpyxl, re, json

def get_region(addr, name):
    text = (str(addr or '') + ' ' + str(name or '')).strip()
    if any(k in text for k in ['천안', '아산', '앙즈로', '연세하임']):
        return '천안아산'
    if any(k in text for k in ['대전', '논산', '공주', '부여', '금산', '계룡']):
        return '대전논산'
    if any(k in text for k in ['서산', '당진', '홍성', '예산', '태안', '보령', '서천']):
        return '서산당진'
    if any(k in text for k in ['청주', '진천', '음성', '충주', '제천', '괴산', '단양', '보은', '영동', '옥천', '증평', '세종', '충북']):
        return '세종충북'
    if any(k in text for k in ['평택', '안성', '수원', '성남', '용인', '화성', '경기', '인천']):
        return '경기'
    if any(k in text for k in ['서울', '강남', '서초', '송파', '강서', '영등포', '마포', '구로']):
        return '서울'
    return '기타'

def clean_hosp_name(name):
    # If name is like '(의)영서의료재단(천안충무병원)', extract '천안충무병원'
    inner_match = re.search(r'\(([^)]*(?:병원|의원|조리원|센터|외과|내과|산부인과)[^)]*)\)', name)
    if inner_match:
        return inner_match.group(1).strip()
    
    # Otherwise remove leading (주), (의), (재), (자), (의료법인), etc.
    s = re.sub(r'^\s*\([^)]*\)\s*', '', name)
    return s.strip()

wb = openpyxl.load_workbook('sales_daybook/subdata/ERP거래처.xlsx', data_only=True)
ws = wb.active

items = []
for r in range(3, ws.max_row + 1):
    c_code = str(ws.cell(r, 1).value or '').strip()
    c_name = str(ws.cell(r, 2).value or '').strip()
    c_rep = str(ws.cell(r, 3).value or '').strip()
    c_phone = str(ws.cell(r, 4).value or '').strip()
    c_addr = str(ws.cell(r, 7).value or '').strip()
    if not c_name:
        continue
    reg = get_region(c_addr, c_name)
    c_clean = clean_hosp_name(c_name)
    items.append({
        'code': c_code,
        'name': c_name,
        'clean_name': c_clean,
        'rep': c_rep,
        'phone': c_phone,
        'address': c_addr,
        'region': reg
    })

print(f'Total ERP customers: {len(items)}')
print('\nSample 20 processed items:')
for it in items[:20]:
    print(f"  [{it['code']}] '{it['name']}' -> '{it['clean_name']}' ({it['region']}) | {it['rep']} | {it['address'][:25]}")

print('\nCheck specific targets:')
for it in items:
    if any(k in it['name'] for k in ['지엔', '백제', '시온', '미즈맘']):
        print(f"  Target found: [{it['code']}] '{it['name']}' -> '{it['clean_name']}' ({it['region']}) | {it['address']}")
