import pandas as pd
import json
import re
from datetime import datetime

excel_path = '/Users/kaustubhpathak/Downloads/Top_1000_Companies_India_SDE.xlsx'
catalog_path = '/Users/kaustubhpathak/jobs_apply/src/data/company-catalog.json'

# Load Catalog
with open(catalog_path, 'r') as f:
    catalog_data = json.load(f)
catalog_companies = catalog_data['companies']

print(f"Current catalog size: {len(catalog_companies)}")

# Normalization helper for name matching
def clean_name(n):
    n = str(n).lower()
    # Remove common corporate suffixes
    n = re.sub(r'\b(general insurance|insurance|technology|technologies|tech|solutions|services|systems|software|india|ltd|limited|pvt|private|corp|corporation|co|inc|llc|holdings|group|networks|worldwide|music|insider|cliq|general)\b', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n.strip()

# Build set of cleaned names in existing catalog
existing_cleaned = set(clean_name(c['name']) for c in catalog_companies if clean_name(c['name']))

# Load new Excel
df_excel = pd.read_excel(excel_path)
print(f"Companies in new Excel file: {len(df_excel)}")

added_count = 0
skipped_count = 0

for idx, row in df_excel.iterrows():
    excel_name = str(row['Company Name']).strip()
    excel_type_raw = str(row['Type']).strip()
    
    # Map type
    if 'product' in excel_type_raw.lower():
        excel_type = 'Product'
    else:
        
        excel_type = 'Service'
        
    cl_excel = clean_name(excel_name)
    
    # Check if already present (by cleaned name or exact name)
    is_duplicate = False
    if cl_excel in existing_cleaned:
        is_duplicate = True
    else:
        # Also double check exact match case-insensitive
        for c in catalog_companies:
            if c['name'].lower() == excel_name.lower():
                is_duplicate = True
                break
                
    if is_duplicate:
        skipped_count += 1
    else:
        added_count += 1
        slug = re.sub(r'[^a-z0-9]+', '', excel_name.lower())
        new_entry = {
            "name": excel_name,
            "boardSlugGuess": slug,
            "type": excel_type,
            "source": None
        }
        catalog_companies.append(new_entry)
        # Add to existing_cleaned to prevent adding duplicates from the new Excel itself
        if cl_excel:
            existing_cleaned.add(cl_excel)

# Sort catalog alphabetically by name
catalog_companies.sort(key=lambda x: x['name'].lower())

# Save back to catalog file
catalog_data['generatedAt'] = datetime.utcnow().isoformat() + "Z"
catalog_data['companyCatalogSize'] = len(catalog_companies)
catalog_data['companies'] = catalog_companies

with open(catalog_path, 'w') as f:
    json.dump(catalog_data, f, indent=2)

print(f"\n✅ Merged and updated company-catalog.json!")
print(f"   Skipped (already added): {skipped_count}")
print(f"   Added (new companies): {added_count}")
print(f"   Total companies in catalog now: {len(catalog_companies)}")
