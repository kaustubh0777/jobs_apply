import pandas as pd
import json
import re
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent.parent
excel_files = [
    root / 'Top_1000_Companies_India_SDE.xlsx',
    root / 'Top_1000_Companies_India_SDE_Hiring.xlsx',
]
catalog_path = root / 'src' / 'data' / 'company-catalog.json'

source_fields_to_preserve = [
    'source',
    'boardSlugGuess',
    'workdayTenant',
    'workdaySubdomain',
    'careersUrl',
    'officialCareerUrl',
    'icimsId',
    'discoveryAttemptedAt',
    'discoveryFailed',
    'genericAttemptedAt',
    'webDiscoveryAttemptedAt',
    'webDiscoveryFailed',
]

career_url_columns = [
    'Career Site',
    'Career Site URL',
    'Careers URL',
    'Career URL',
    'Official Career Site',
    'Official Careers URL',
    'Official Careers Site',
    'Jobs URL',
]

# Some companies publish jobs on official career sites that are not one of the
# ATS APIs this app already supports. Keep these as explicit official sources
# instead of letting name-based Workday guesses overwrite them later.
official_source_overrides = {
    'google': {
        'source': 'generic',
        'boardSlugGuess': 'google',
        'careersUrl': 'https://www.google.com/about/careers/applications/jobs/results/',
    },
    'microsoft': {
        'source': 'microsoft',
        'boardSlugGuess': 'microsoft',
        'careersUrl': 'https://careers.microsoft.com/professionals/us/en/l-india',
    },
    'amazon': {
        'source': 'generic',
        'boardSlugGuess': 'amazon',
        'careersUrl': 'https://www.amazon.jobs/en/search.json?base_query=sde&country=IND&result_limit=100&sort=recent',
    },
    'amazon india (it services)': {
        'source': 'generic',
        'boardSlugGuess': 'amazon',
        'careersUrl': 'https://www.amazon.jobs/en/search.json?base_query=sde&country=IND&result_limit=100&sort=recent',
    },
    'apple': {
        'source': 'generic',
        'boardSlugGuess': 'apple',
        'careersUrl': 'https://jobs.apple.com/en-in/search?search=software%20developer&location=india-INDC',
    },
    'flipkart': {
        'source': 'generic',
        'boardSlugGuess': 'flipkart',
        'careersUrl': 'https://www.flipkartcareers.com/jobslist',
    },
    'meta': {
        'source': 'generic',
        'boardSlugGuess': 'meta',
        'careersUrl': 'https://www.metacareers.com/jobsearch/?q=software%20developer&location=India',
    },
    'meta india': {
        'source': 'generic',
        'boardSlugGuess': 'meta',
        'careersUrl': 'https://www.metacareers.com/jobsearch/?q=software%20developer&location=India',
    },
    'uber': {
        'source': 'generic',
        'boardSlugGuess': 'uber',
        'careersUrl': 'https://www.uber.com/in/en/careers/list/?query=software%20developer&location=IND',
    },
    'uber india': {
        'source': 'generic',
        'boardSlugGuess': 'uber',
        'careersUrl': 'https://www.uber.com/in/en/careers/list/?query=software%20developer&location=IND',
    },
}

# Load Catalog
with open(catalog_path, 'r') as f:
    catalog_data = json.load(f)
catalog_companies = catalog_data['companies']

print(f"Current catalog count: {len(catalog_companies)}")

excel_rows = []

for excel_path in excel_files:
    if not excel_path.exists():
        print(f"Warning: Excel file not found: {excel_path}")
        continue

    xl = pd.ExcelFile(excel_path)
    for sheet in xl.sheet_names:
        df_excel = xl.parse(sheet)
        if 'Company Name' not in df_excel.columns:
            continue

        if 'Type (Product/Service)' in df_excel.columns:
            type_field = 'Type (Product/Service)'
        elif 'Type' in df_excel.columns:
            type_field = 'Type'
        else:
            raise ValueError(f"Cannot determine type column for {excel_path} sheet {sheet}")

        for _, row in df_excel.iterrows():
            excel_name = str(row.get('Company Name', '')).strip()
            if not excel_name:
                continue

            excel_type_raw = str(row.get(type_field, '')).strip()
            excel_type = 'Product' if 'product' in excel_type_raw.lower() else 'Service'
            careers_url = ''
            for url_column in career_url_columns:
                if url_column in df_excel.columns:
                    raw_url = row.get(url_column, '')
                    if pd.notna(raw_url) and str(raw_url).strip():
                        careers_url = str(raw_url).strip()
                        break
            excel_rows.append({
                'name': excel_name,
                'type': excel_type,
                'careersUrl': careers_url,
            })

print(f"Excel company rows loaded: {len(excel_rows)}")

# Normalization helper for name matching
def clean_name(n):
    n = str(n).lower()
    # Remove common corporate suffixes
    n = re.sub(r'\b(general insurance|insurance|technology|technologies|tech|solutions|services|systems|software|india|ltd|limited|pvt|private|corp|corporation|co|inc|llc|holdings|group|networks|worldwide|music|insider|cliq|general)\b', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n.strip()

# Build lookups of catalog companies
catalog_by_clean = {}
for c in catalog_companies:
    cl = clean_name(c['name'])
    if cl:
        # Prioritize keeping configured sources if there are duplicate cleaned names
        if cl not in catalog_by_clean or c.get('source') is not None:
            catalog_by_clean[cl] = c

# Build new catalog
new_companies = []
matched_count = 0
seen_names = set()
seen_clean_names = set()

for row in excel_rows:
    excel_name = row['name']
    excel_type = row['type']
    normalized_name = excel_name.strip().lower()
    cl_excel = clean_name(excel_name)
    if normalized_name in seen_names or (cl_excel and cl_excel in seen_clean_names):
        continue
    seen_names.add(normalized_name)
    if cl_excel:
        seen_clean_names.add(cl_excel)

    match = catalog_by_clean.get(cl_excel)
    company_entry = {
        "name": excel_name,
        "boardSlugGuess": re.sub(r'[^a-z0-9]+', '', excel_name.lower()),
        "type": excel_type,
        "source": None,
    }

    if match:
        matched_count += 1
        for field in source_fields_to_preserve:
            if field in match and match.get(field) is not None:
                company_entry[field] = match.get(field)

    # Career URL from Excel always wins — set source to generic
    # (This was the bug: if match had source=None, careersUrl from Excel was lost)
    if row.get('careersUrl'):
        company_entry['source'] = 'generic'
        company_entry['careersUrl'] = row['careersUrl']
        # Clear ATS-specific fields that conflict with generic source
        company_entry.pop('workdayTenant', None)
        company_entry.pop('workdaySubdomain', None)
        company_entry.pop('icimsId', None)

    override = official_source_overrides.get(excel_name.strip().lower())
    if override:
        company_entry.update(override)

    if company_entry.get('source') != 'workday':
        company_entry.pop('workdayTenant', None)
        company_entry.pop('workdaySubdomain', None)

    new_companies.append(company_entry)

# Sort companies alphabetically by name
new_companies.sort(key=lambda x: x['name'].lower())

# Save to catalog file
new_catalog_data = {
    "generatedAt": datetime.utcnow().isoformat() + "Z",
    "companyCatalogSize": len(new_companies),
    "companies": new_companies
}

with open(catalog_path, 'w') as f:
    json.dump(new_catalog_data, f, indent=2)

print(f"\n✅ Merged and updated company-catalog.json!")
print(f"   Total companies in new catalog: {len(new_companies)}")
print(f"   Successfully matched with old configurations: {matched_count}")
