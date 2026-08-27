import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Load and clean erp_products.json
with open("sales_daybook/erp_products.json", "r", encoding="utf-8") as f:
    erp = json.load(f)

print("Original ERP count:", len(erp))
clean_erp = []
for p in erp:
    code = (p.get("code") or p.get("id") or "").strip()
    use_by = p.get("use_by", "Y")
    status = p.get("status", "")
    is_active = p.get("is_active", True)
    
    # Check if discontinued
    if code in ["EN-SB024B", "EN-SB024B-1"] or use_by == "N" or use_by == "n" or is_active is False or "중단" in str(status) or "중지" in str(status):
        print(f"REMOVING discontinued item from ERP: {code} ({p.get('name')})")
        continue
    clean_erp.append(p)

print("Cleaned ERP count:", len(clean_erp))

with open("sales_daybook/erp_products.json", "w", encoding="utf-8") as f:
    json.dump(clean_erp, f, ensure_ascii=False, indent=2)

# 2. Load and clean sales_database.json
with open("sales_daybook/sales_database.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("Original DB products count:", len(db.get("products", [])))
clean_db_prods = []
for p in db.get("products", []):
    code = (p.get("code") or p.get("id") or "").strip()
    use_by = p.get("use_by", "Y")
    status = p.get("status", "")
    is_active = p.get("is_active", True)
    
    if code in ["EN-SB024B", "EN-SB024B-1"] or use_by == "N" or use_by == "n" or is_active is False or "중단" in str(status) or "중지" in str(status):
        print(f"REMOVING discontinued item from DB: {code} ({p.get('name')})")
        continue
    clean_db_prods.append(p)

print("Cleaned DB products count:", len(clean_db_prods))
db["products"] = clean_db_prods

with open("sales_daybook/sales_database.json", "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

with open("sales_daybook/sales_database.js", "w", encoding="utf-8") as f:
    f.write("window.SALES_DB = " + json.dumps(db, ensure_ascii=False, indent=2) + ";\n")

print("✅ Completely removed discontinued items from all master DBs!")
