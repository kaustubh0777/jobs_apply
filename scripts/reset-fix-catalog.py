import json, re

catalog_path = '/Users/kaustubhpathak/jobs_apply/src/data/company-catalog.json'

with open(catalog_path, 'r') as f:
    catalog_data = json.load(f)
catalog_companies = catalog_data['companies']

# Real SR companies that actually have jobs (verified manually)
REAL_SR = {'arista networks', 'ixigo', 'grab'}

# Known Workday career portals for Indian MNCs
# Format: company_name_lower -> (workday_subdomain, workday_tenant)
KNOWN_WORKDAY = {
    'flipkart': ('flipkart', 'Flipkart_External'),
    'walmart global tech india': ('walmart', 'WalmartExternalUSA'),
    'walmart': ('walmart', 'WalmartExternalUSA'),
    'swiggy': ('swiggy', 'Swiggy_External'),
    'zomato': ('zomato', 'zomato_External'),
    'oracle india': ('oracle', 'OracleExternalCareer'),
    'oracle': ('oracle', 'OracleExternalCareer'),
    'sap india': ('sap', 'SAP_External'),
    'sap labs india': ('sap', 'SAP_External'),
    'sap': ('sap', 'SAP_External'),
    'deloitte india': ('deloitte', 'dttus_External'),
    'deloitte': ('deloitte', 'dttus_External'),
    'ernst & young (ey) india': ('ey', 'EY_External'),
    'ey india': ('ey', 'EY_External'),
    'accenture india': ('accenture', 'accenture_External'),
    'accenture': ('accenture', 'accenture_External'),
    'kpmg india': ('kpmg', 'KPMG_IN_External'),
    'kpmg': ('kpmg', 'KPMG_IN_External'),
    'pwc india': ('pwc', 'PWCUS_External'),
    'citi india tech': ('citi', 'citi_External'),
    'citi': ('citi', 'citi_External'),
    'jpmorgan chase tech india': ('jpmc', 'jpmcc_External'),
    'jp morgan': ('jpmc', 'jpmcc_External'),
    'mckinsey & company india': ('mckinsey', 'McKinsey_Experienced'),
    'mckinsey & company': ('mckinsey', 'McKinsey_Experienced'),
    'boston consulting group india': ('bcg', 'BCG_External'),
    'bcg india': ('bcg', 'BCG_External'),
    'tcs (tata consultancy services)': ('tcs', 'tcs_External'),
    'tata consultancy services': ('tcs', 'tcs_External'),
    'tcs': ('tcs', 'tcs_External'),
    'wipro': ('wipro', 'Wipro_External'),
    'wipro technologies': ('wipro', 'Wipro_External'),
    'hcl technologies': ('hcl', 'hcl_External'),
    'hcl tech': ('hcl', 'hcl_External'),
    'tech mahindra': ('techmahindra', 'tech_mahindra_External'),
    'tech mahindra worldwide': ('techmahindra', 'tech_mahindra_External'),
    'mahindra & mahindra': ('mahindra', 'MahindraGroup_External'),
    'mahindra group': ('mahindra', 'MahindraGroup_External'),
    'l&t technology services': ('ltts', 'LTTSExternal'),
    'larsen & toubro': ('lntinfotech', 'lntinfotech_External'),
    'ltimindtree': ('ltimindtree', 'ltimindtree_External'),
    'mphasis': ('mphasis', 'MphasisExternal'),
    'hexaware technologies': ('hexaware', 'Hexaware_External'),
    'zensar technologies': ('zensar', 'Zensar_External'),
    'persistent systems': ('persistent', 'persistent_external'),
    'cyient': ('cyient', 'Cyient_External'),
    'niit technologies': ('niit', 'NIIT_External'),
    'mastech digital': ('mastech', 'Mastech_External'),
    'bajaj finserv tech': ('bajajfinserv', 'bajajfinserv_External'),
    'bajaj finserv': ('bajajfinserv', 'bajajfinserv_External'),
    'hdfc bank technology': ('hdfcbank', 'HdfcBank_External'),
    'hdfc bank': ('hdfcbank', 'HdfcBank_External'),
    'icici bank technology': ('icicibank', 'icicibank_External'),
    'icici bank': ('icicibank', 'icicibank_External'),
    'kotak mahindra bank tech': ('kotak', 'KotakMahindra_External'),
    'kotak mahindra bank': ('kotak', 'KotakMahindra_External'),
    'axis bank': ('axisbank', 'AxisBank_External'),
    'state bank of india': ('sbi', 'SBI_External'),
    'amazon india': ('amazon', 'amazon_External'),
    'google india': ('google', 'googlejobs'),
    'google': ('google', 'googlejobs'),
    'microsoft india': ('microsoft', 'microsoft_External'),
    'microsoft': ('microsoft', 'microsoft_External'),
    'apple india': ('apple', 'apple_External'),
    'apple': ('apple', 'apple_External'),
    'meta india': ('meta', 'meta_External'),
    'meta': ('meta', 'meta_External'),
    'uber india': ('uber', 'Uber_External'),
    'uber': ('uber', 'Uber_External'),
    'linkedin india': ('linkedin', 'LinkedIn_External'),
    'linkedin': ('linkedin', 'LinkedIn_External'),
    'intel india': ('intel', 'Intel_External'),
    'intel': ('intel', 'Intel_External'),
    'qualcomm india': ('qualcomm', 'qualcomm_External'),
    'qualcomm': ('qualcomm', 'qualcomm_External'),
    'ibm india': ('ibm', 'IBM_External'),
    'ibm': ('ibm', 'IBM_External'),
    'capgemini india': ('capgemini', 'capgemini_External'),
    'accenture technology india': ('accenture', 'accenture_External'),
    'cyient limited': ('cyient', 'Cyient_External'),
    'hexaware': ('hexaware', 'Hexaware_External'),
    'persistent': ('persistent', 'persistent_external'),
    'zensar': ('zensar', 'Zensar_External'),
    'jp morgan chase': ('jpmc', 'jpmcc_External'),
    'jp morgan chase india': ('jpmc', 'jpmcc_External'),
    'jpmorgan chase & co. india': ('jpmc', 'jpmcc_External'),
}

def normalize(name):
    return name.lower().strip()

reset_count = 0
workday_count = 0

for c in catalog_companies:
    name_norm = normalize(c['name'])
    
    # Reset wrongly-tagged SR companies (except real ones)
    if c.get('source') == 'smartrecruiters' and name_norm not in REAL_SR:
        c['source'] = None
        c['boardSlugGuess'] = re.sub(r'[^a-z0-9]+', '', name_norm)
        reset_count += 1
    
    # Also reset wrongly-tagged Ashby companies where we're unsure
    # (we'll let them be re-discovered with the fixed probe)
    if c.get('source') == 'ashby':
        c['source'] = None
        c['boardSlugGuess'] = re.sub(r'[^a-z0-9]+', '', name_norm)
        reset_count += 1

    # Apply known Workday portals
    if name_norm in KNOWN_WORKDAY:
        subdomain, tenant = KNOWN_WORKDAY[name_norm]
        c['source'] = 'workday'
        c['boardSlugGuess'] = subdomain
        c['workdayTenant'] = tenant
        workday_count += 1

print(f"Reset wrongly-tagged companies: {reset_count}")
print(f"Applied Workday configurations: {workday_count}")
print(f"Total companies: {len(catalog_companies)}")

with open(catalog_path, 'w') as f:
    json.dump({**catalog_data, 'companies': catalog_companies}, f, indent=2)

print("\nDone!")
