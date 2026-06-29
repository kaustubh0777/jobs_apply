import { mkdir, writeFile, readFile } from 'node:fs/promises'

const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
// Shorter timeout for discovery probes, longer for actual fetches
const probeTimeoutMs = 5000
const fetchTimeoutMs = 8000
// Concurrency for parallel probes and fetches
const discoveryConcurrency = 60
const fetchConcurrency = 40

const sdeTitleTerms = [
  'software engineer',
  'software developer',
  'application developer',
  'frontend',
  'front end',
  'backend',
  'back end',
  'full stack',
  'fullstack',
  'platform engineer',
  'systems engineer',
  'architect',
  'infrastructure engineer',
  'mobile engineer',
  'android engineer',
  'ios engineer',
  'machine learning engineer',
  'data engineer',
  'devops engineer',
  'site reliability engineer',
  'sre',
  'member of technical staff',
  'mts',
  'technical staff',
]

const microsoftPages = [
  'https://careers.microsoft.com/professionals/us/en/l-india',
  'https://careers.microsoft.com/professionals/us/en/l-bengaluru',
  'https://careers.microsoft.com/professionals/us/en/l-hyderabad',
  'https://careers.microsoft.com/professionals/us/en/l-noida',
]

const KNOWN_WORKDAY = {
  'walmart global tech india': ['walmart', 'WalmartExternalUSA'],
  'walmart': ['walmart', 'WalmartExternalUSA'],
  'swiggy': ['swiggy', 'Swiggy_External'],
  'zomato': ['zomato', 'zomato_External'],
  'oracle india': ['oracle', 'OracleExternalCareer'],
  'oracle': ['oracle', 'OracleExternalCareer'],
  'sap india': ['sap', 'SAP_External'],
  'sap labs india': ['sap', 'SAP_External'],
  'sap': ['sap', 'SAP_External'],
  'deloitte india': ['deloitte', 'dttus_External'],
  'deloitte': ['deloitte', 'dttus_External'],
  'ernst & young (ey) india': ['ey', 'EY_External'],
  'ey india': ['ey', 'EY_External'],
  'accenture india': ['accenture', 'accenture_External'],
  'accenture': ['accenture', 'accenture_External'],
  'kpmg india': ['kpmg', 'KPMG_IN_External'],
  'kpmg': ['kpmg', 'KPMG_IN_External'],
  'pwc india': ['pwc', 'PWCUS_External'],
  'citi india tech': ['citi', 'citi_External'],
  'citi': ['citi', 'citi_External'],
  'jpmorgan chase tech india': ['jpmc', 'jpmcc_External'],
  'jp morgan': ['jpmc', 'jpmcc_External'],
  'mckinsey & company india': ['mckinsey', 'McKinsey_Experienced'],
  'mckinsey & company': ['mckinsey', 'McKinsey_Experienced'],
  'boston consulting group india': ['bcg', 'BCG_External'],
  'bcg india': ['bcg', 'BCG_External'],
  'tcs (tata consultancy services)': ['tcs', 'tcs_External'],
  'tata consultancy services': ['tcs', 'tcs_External'],
  'tcs': ['tcs', 'tcs_External'],
  'wipro': ['wipro', 'Wipro_External'],
  'wipro technologies': ['wipro', 'Wipro_External'],
  'hcl technologies': ['hcl', 'hcl_External'],
  'hcl tech': ['hcl', 'hcl_External'],
  'tech mahindra': ['techmahindra', 'tech_mahindra_External'],
  'tech mahindra worldwide': ['techmahindra', 'tech_mahindra_External'],
  'mahindra & mahindra': ['mahindra', 'MahindraGroup_External'],
  'mahindra group': ['mahindra', 'MahindraGroup_External'],
  'l&t technology services': ['ltts', 'LTTSExternal'],
  'larsen & toubro': ['lntinfotech', 'lntinfotech_External'],
  'ltimindtree': ['ltimindtree', 'ltimindtree_External'],
  'mphasis': ['mphasis', 'MphasisExternal'],
  'hexaware technologies': ['hexaware', 'Hexaware_External'],
  'zensar technologies': ['zensar', 'Zensar_External'],
  'persistent systems': ['persistent', 'persistent_external'],
  'cyient': ['cyient', 'Cyient_External'],
  'niit technologies': ['niit', 'NIIT_External'],
  'mastech digital': ['mastech', 'Mastech_External'],
  'bajaj finserv tech': ['bajajfinserv', 'bajajfinserv_External'],
  'bajaj finserv': ['bajajfinserv', 'bajajfinserv_External'],
  'hdfc bank technology': ['hdfcbank', 'HdfcBank_External'],
  'hdfc bank': ['hdfcbank', 'HdfcBank_External'],
  'icici bank technology': ['icicibank', 'icicibank_External'],
  'icici bank': ['icicibank', 'icicibank_External'],
  'kotak mahindra bank tech': ['kotak', 'KotakMahindra_External'],
  'kotak mahindra bank': ['kotak', 'KotakMahindra_External'],
  'axis bank': ['axisbank', 'AxisBank_External'],
  'state bank of india': ['sbi', 'SBI_External'],
  'linkedin india': ['linkedin', 'LinkedIn_External'],
  'linkedin': ['linkedin', 'LinkedIn_External'],
  'intel india': ['intel', 'Intel_External'],
  'intel': ['intel', 'Intel_External'],
  'qualcomm india': ['qualcomm', 'qualcomm_External'],
  'qualcomm': ['qualcomm', 'qualcomm_External'],
  'ibm india': ['ibm', 'IBM_External'],
  'ibm': ['ibm', 'IBM_External'],
  'capgemini india': ['capgemini', 'capgemini_External'],
  'accenture technology india': ['accenture', 'accenture_External'],
  'cyient limited': ['cyient', 'Cyient_External'],
  'hexaware': ['hexaware', 'Hexaware_External'],
  'persistent': ['persistent', 'persistent_external'],
  'zensar': ['zensar', 'Zensar_External'],
  'jp morgan chase': ['jpmc', 'jpmcc_External'],
  'jp morgan chase india': ['jpmc', 'jpmcc_External'],
  'jpmorgan chase & co. india': ['jpmc', 'jpmcc_External'],
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

const htmlToText = (html = '') =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const decodeText = (value = '') =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ─── Slug generation ──────────────────────────────────────────────────────────

/**
 * Generate multiple likely Greenhouse/Lever board slug variants from a company name.
 * Returns an ordered list (most likely first).
 */
const generateSlugVariants = (name) => {
  const lower = name.toLowerCase()
  const variants = new Set()

  // Variant 1: strip everything except letters and digits (most common Greenhouse pattern)
  const v1 = lower.replace(/[^a-z0-9]+/g, '')
  if (v1.length >= 2) variants.add(v1)

  // Variant 2: hyphenated (common Lever pattern)
  const v2 = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (v2.length >= 2 && v2 !== v1) variants.add(v2)

  // Variant 3: strip common suffixes before slugifying
  const stripped = lower
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|group|holdings|technologies|technology|services|solutions|systems|networks|software|global|international|enterprises|ventures|labs|studio|studios|ai|io|hq|gmbh|plc|bv|sa|nv|pvt|private|public)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  if (stripped.length >= 2 && !variants.has(stripped)) variants.add(stripped)

  // Variant 4: first word only (e.g. "Oracle" from "Oracle Corporation")
  const firstWord = lower.split(/[\s._\-&,/()]+/)[0].replace(/[^a-z0-9]/g, '')
  if (firstWord.length >= 3 && !variants.has(firstWord)) variants.add(firstWord)

  // Variant 5: first two significant words joined
  const words = lower.split(/[\s._\-&,/()]+/).filter(w => w.length > 1).map(w => w.replace(/[^a-z0-9]/g, ''))
  if (words.length >= 2) {
    const twoWords = words.slice(0, 2).join('')
    if (twoWords.length >= 3 && !variants.has(twoWords)) variants.add(twoWords)
  }

  // Variant 6: acronym (e.g. "IBM" from "International Business Machines")
  const acronym = lower.split(/[\s._\-&,/()]+/).filter(w => w.length > 2).map(w => w[0]).join('')
  if (acronym.length >= 2 && acronym.length <= 6 && !variants.has(acronym)) variants.add(acronym)

  return [...variants].filter(s => s.length >= 2)
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const fetchWithTimeout = async (url, options = {}, timeoutMs = fetchTimeoutMs) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// ─── SDE role filters ─────────────────────────────────────────────────────────

const excludedTitleTerms = [
  'copy of',
  'account executive',
  'sales development',
  'sales engineer',
  'sales manager',
  'recruiter',
  'recruiting',
  'support engineer',
  'customer support',
  'solution area',
  'people ops',
  'hr ',
  'human resources',
  'director',
  'vp of',
  'vice president',
  'product manager',
  'program manager',
  'project manager',
  'business analyst',
  'finance',
  'legal',
  'marketing',
  'customer success',
  'office manager',
  'executive assistant',
]

const isSdeRole = (job) => {
  const title = (job.title || job.text || '').toLowerCase()
  const department = (job.departments?.map(d => d.name).join(' ') || job.categories?.team || job.categories?.department || '').toLowerCase()
  if (excludedTitleTerms.some(t => title.includes(t))) return false
  return (
    sdeTitleTerms.some(t => title.includes(t)) ||
    department.includes('engineering') ||
    department.includes('software') ||
    department.includes('technology') ||
    department.includes('product development')
  )
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

const isIndiaLocation = (location) =>
  /india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|new delhi|chennai|ahmedabad|kolkata|calcutta|jaipur|lucknow|kochi|cochin|bhubaneswar|trivandrum|thiruvananthapuram|nagpur|indore|coimbatore|vadodara|surat|mangalore|vizag|visakhapatnam|chandigarh|mohali|remote.*india|india.*remote/i.test(location)

const countryRules = [
  { country: 'India', test: /india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|new delhi|chennai|ahmedabad|kolkata|calcutta|jaipur|lucknow|kochi|cochin|bhubaneswar|trivandrum|thiruvananthapuram|nagpur|indore|coimbatore|vadodara|surat|mangalore|vizag|visakhapatnam|chandigarh|mohali|remote.*india|india.*remote/i },
  { country: 'United States', test: /united states|usa|u\.s\.|us remote|california|new york|seattle|san francisco|austin|boston|chicago|washington|texas/i },
  { country: 'United Kingdom', test: /united kingdom|uk|london|england|scotland/i },
  { country: 'Canada', test: /canada|toronto|vancouver|montreal|ottawa/i },
  { country: 'Germany', test: /germany|berlin|munich|hamburg/i },
  { country: 'Ireland', test: /ireland|dublin/i },
  { country: 'Netherlands', test: /netherlands|amsterdam/i },
  { country: 'Singapore', test: /singapore/i },
  { country: 'Australia', test: /australia|sydney|melbourne/i },
  { country: 'Japan', test: /japan|tokyo/i },
]

const countryFromLocation = (location = '') =>
  countryRules.find(rule => rule.test.test(location))?.country || 'Global'

// ─── Experience parser ────────────────────────────────────────────────────────

const experienceFromText = (title, text) => {
  const haystack = `${title}. ${text}`.replace(/\s+/g, ' ')

  // Range pattern first: "3-5 years", "2 to 4 yrs"
  const rangeMatch = haystack.match(/(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})\+?\s*(?:years?|yrs?)\b/i)
  if (rangeMatch) {
    const min = Number(rangeMatch[1]), max = Number(rangeMatch[2])
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
      return { min, max, label: `${min}-${max} yrs`, source: 'Portal requirement' }
    }
  }

  // Explicit patterns
  const explicitPatterns = [
    /(\d{1,2})\+?\s*(?:years?|yrs?)(?:'|'|')?\s*(?:of|in)?\s*(?:[\w/'''-]+\s+){0,5}experience\b/i,
    /experience\s*(?:of|required|minimum|level)?\s*[:\s-]*\s*(\d{1,2})\+?\s*(?:years?|yrs?)\b/i,
    /(?:minimum|min\.?|at least|requires?|required|preferred)\s*[:\-]?\s*(?:of\s*)?(\d{1,2})\+?\s*(?:years?|yrs?)\b/i,
  ]
  for (const pattern of explicitPatterns) {
    const match = haystack.match(pattern)
    if (match) {
      const min = Number(match[1])
      if (Number.isFinite(min)) return { min, max: null, label: `${min}+ yrs`, source: 'Portal requirement' }
    }
  }

  // Seniority fallback
  const normalizedTitle = title.toLowerCase()
  const seniorityRules = [
    { test: /principal|distinguished|architect/, min: 10, max: null, label: '10+ yrs' },
    { test: /staff|lead/, min: 7, max: null, label: '7+ yrs' },
    { test: /senior|sr\./, min: 5, max: null, label: '5+ yrs' },
    { test: /\bii\b|level 2|sde 2|engineer 2/, min: 2, max: 5, label: '2-5 yrs' },
    { test: /intern|graduate|new grad|entry|junior|associate/, min: 0, max: 2, label: '0-2 yrs' },
  ]
  const match = seniorityRules.find(rule => rule.test.test(normalizedTitle))
  if (match) return { min: match.min, max: match.max, label: `${match.label} est.`, source: 'Estimated from seniority' }

  return { min: 0, max: null, label: '0+ yrs est.', source: 'Not specified by portal' }
}

// Experience filter removed — all seniority levels (junior → staff) are shown
const isFalsePositive = (text, matchIndex, matchLength) => {
  const context = text.slice(matchIndex + matchLength, matchIndex + matchLength + 30).toLowerCase()
  return /\b(crore|cr|million|billion|trillion|user|merchant|customer|percent|%|transaction|device|people|download|install|page|view|dollar|euro|pound|yen)/.test(context)
}

const salaryFromText = (text) => {
  const cleaned = text.replace(/,/g, '')
  
  // 1. Try to find INR Lakhs / LPA range patterns:
  // Matches "12-18 LPA", "12 to 18 Lakhs", "12 - 18 Lacs", "12L - 18L", "₹12L - ₹18L"
  const lpaRangeRegex = /(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:lpa|lakhs?|lacs?|l)?\s*(?:-|to|–|—)\s*(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:lpa|lakhs?|lacs?|l)\b/i
  const lpaRangeMatch = cleaned.match(lpaRangeRegex)
  if (lpaRangeMatch) {
    let low = Number(lpaRangeMatch[1])
    let high = Number(lpaRangeMatch[2])
    if (low > 0 && high >= low) {
      if (!isFalsePositive(cleaned, lpaRangeMatch.index, lpaRangeMatch[0].length)) {
        if (low >= 100000) low = Math.round(low / 100000)
        if (high >= 100000) high = Math.round(high / 100000)
        if (high < 90) { // Safety ceiling for domestic salaries
          return { min: low, max: high, currency: 'INR' }
        }
      }
    }
  }

  // 2. Try to find raw INR ranges without suffix, e.g. "₹1200000 - ₹1800000" or "Rs 1200000 to 1800000"
  const inrRawRangeRegex = /(?:₹|rs\.?|inr)\s*(\d{5,8})\s*(?:-|to|–|—)\s*(?:₹|rs\.?|inr)?\s*(\d{5,8})/i
  const inrRawRangeMatch = cleaned.match(inrRawRangeRegex)
  if (inrRawRangeMatch) {
    let low = Number(inrRawRangeMatch[1])
    let high = Number(inrRawRangeMatch[2])
    if (low > 0 && high >= low) {
      if (!isFalsePositive(cleaned, inrRawRangeMatch.index, inrRawRangeMatch[0].length)) {
        return {
          min: Math.round(low / 100000),
          max: Math.round(high / 100000),
          currency: 'INR'
        }
      }
    }
  }

  // 3. Try to find USD ranges and convert to INR (Lakhs):
  // Matches "$80,000 - $120,000", "$80k - $120k", "$80k to $120k", etc.
  const usdRangeRegex = /\$\s*(\d+)(?:000|k)?\s*(?:-|to|–|—)\s*\$?\s*(\d+)(?:000|k)?\b/i
  const usdMatch = cleaned.match(usdRangeRegex)
  if (usdMatch) {
    let low = Number(usdMatch[1])
    let high = Number(usdMatch[2])
    if (low >= 1000) low = Math.round(low / 1000)
    if (high >= 1000) high = Math.round(high / 1000)
    if (low >= 30 && high >= low) { // Filter out hourly rates (< $30/hr vs >= $30k/yr)
      return {
        min: Math.round(low * 0.83),
        max: Math.round(high * 0.83),
        currency: 'INR'
      }
    }
  }

  // 4. Try to find single value LPA patterns, e.g. "₹15 Lakhs", "12 LPA"
  const lpaSingleRegex = /(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:lpa|lakhs?|lacs?|l)\b/i
  const lpaSingleMatch = cleaned.match(lpaSingleRegex)
  if (lpaSingleMatch) {
    let val = Number(lpaSingleMatch[1])
    if (val > 0) {
      if (!isFalsePositive(cleaned, lpaSingleMatch.index, lpaSingleMatch[0].length)) {
        if (val >= 100000) val = Math.round(val / 100000)
        if (val < 90) { // Safety ceiling
          return { min: val, max: val, currency: 'INR' }
        }
      }
    }
  }

  return null
}

// ─── Job normalizers ──────────────────────────────────────────────────────────

const normalizeGreenhouseJob = (job, company) => {
  const publishedAt = job.first_published || job.updated_at
  const description = htmlToText(job.content)
  const salary = salaryFromText(description)
  const experience = experienceFromText(job.title, description)
  const location = job.location?.name || 'Not listed'
  return {
    id: `greenhouse-${company.board}-${job.id}`,
    role: job.title,
    company: company.name,
    companyType: company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: publishedAt,
    source: 'Greenhouse career portal',
    directApplyUrl: job.absolute_url,
    department: job.departments?.[0]?.name || 'Engineering',
    summary: description.slice(0, 280),
  }
}

const normalizeLeverJob = (job, company) => {
  const description = [job.descriptionPlain, job.descriptionBodyPlain, job.additionalPlain, job.openingPlain]
    .filter(Boolean).join(' ').trim()
  const salary = salaryFromText(description)
  const experience = experienceFromText(job.text, description)
  const location = job.categories?.allLocations?.join(' | ') || job.categories?.location || job.country || 'Not listed'
  return {
    id: `lever-${company.board}-${job.id}`,
    role: job.text,
    company: company.name,
    companyType: company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: new Date(job.createdAt).toISOString(),
    source: 'Lever career portal',
    directApplyUrl: job.hostedUrl || job.applyUrl,
    department: job.categories?.team || job.categories?.department || 'Engineering',
    summary: description.slice(0, 280),
  }
}

const normalizeMicrosoftJob = (job) => {
  const salary = salaryFromText(job.description)
  const experience = experienceFromText(job.role, job.description)
  return {
    id: `microsoft-${job.directApplyUrl.match(/job\/([^?]+)/)?.[1] || job.role}-${job.postedAt}`,
    role: job.role,
    company: 'Microsoft India',
    companyType: 'Product',
    location: job.location,
    country: 'India',
    countryGroup: 'India',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: `${job.postedAt}T00:00:00+05:30`,
    source: 'Microsoft career portal',
    directApplyUrl: job.directApplyUrl,
    department: 'Software Engineering',
    summary: job.description.slice(0, 280),
  }
}

const normalizeAshbyJob = (job, company) => {
  const description = job.descriptionPlain || ''
  const salary = salaryFromText(description)
  const experience = experienceFromText(job.title, description)
  const location = job.location || 'Not listed'
  return {
    id: `ashby-${company.board}-${job.id}`,
    role: job.title,
    company: company.name,
    companyType: company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: job.publishedAt,
    source: 'Ashby career portal',
    directApplyUrl: job.jobUrl || job.applyUrl,
    department: job.department || 'Engineering',
    summary: description.slice(0, 280),
  }
}

const normalizeSmartRecruitersJob = (job, company, details) => {
  const sections = details?.jobAd?.sections || {}
  const description = [
    sections.companyDescription?.text,
    sections.jobDescription?.text,
    sections.qualifications?.text,
    sections.additionalInformation?.text
  ].filter(Boolean).map(htmlToText).join(' ').trim()
  
  const salary = salaryFromText(description)
  const experience = experienceFromText(job.name, description)
  const locationStr = job.location?.fullLocation || job.location?.city || 'Not listed'
  
  return {
    id: `smartrecruiters-${company.board}-${job.id}`,
    role: job.name,
    company: company.name,
    companyType: company.type,
    location: locationStr,
    country: countryFromLocation(locationStr),
    countryGroup: isIndiaLocation(locationStr) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: job.releasedDate,
    source: 'SmartRecruiters career portal',
    directApplyUrl: `https://jobs.smartrecruiters.com/${company.board}/${job.id}`,
    department: job.department?.label || 'Engineering',
    summary: description.slice(0, 280),
  }
}

const normalizeWorkdayJob = (job, company) => {
  const title = job.title || ''
  const location = [
    job.locationsText,
    job.primaryLocation?.descriptor,
    job.primaryLocation?.countryName,
  ].filter(Boolean).join(', ') || 'Not listed'
  const applyUrl = job.externalUrl || `https://${company.workdaySubdomain}.myworkdayjobs.com/en-US/${company.board}/${job.bulletFields?.[0] || ''}`
  const description = job.jobDescription?.content?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || ''
  const salary = salaryFromText(description)
  const experience = experienceFromText(title, description)
  return {
    id: `workday-${company.board}-${job.id || job.bulletFields?.[0] || title.replace(/\W+/g,'-').slice(0,40)}`,
    role: title,
    company: company.name,
    companyType: company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? 'INR',
    experienceMin: experience.min,
    experienceMax: experience.max,
    experienceLabel: experience.label,
    experienceSource: experience.source,
    postedAt: job.postedOn || new Date().toISOString(),
    source: 'Workday career portal',
    directApplyUrl: applyUrl,
    department: job.jobFamilyGroupName || job.jobFamilyName || 'Engineering',
    summary: description.slice(0, 280),
  }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

const cutoff = Date.now() - ninetyDaysMs

const fetchGreenhouse = async (company) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.board}/jobs?content=true`
  const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
  if (!response.ok) throw new Error(`${company.name} GH ${response.status}`)
  const payload = await response.json()
  return payload.jobs
    .filter(isSdeRole)
    .map(job => normalizeGreenhouseJob(job, company))
    .filter(job => Number.isFinite(Date.parse(job.postedAt)) && Date.parse(job.postedAt) >= cutoff)
}

const fetchLever = async (company) => {
  const url = `https://api.lever.co/v0/postings/${company.board}?mode=json`
  const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
  if (!response.ok) throw new Error(`${company.name} LV ${response.status}`)
  const payload = await response.json()
  return payload
    .filter(job => isSdeRole(job))
    .map(job => normalizeLeverJob(job, company))
    .filter(job => Number.isFinite(Date.parse(job.postedAt)) && Date.parse(job.postedAt) >= cutoff)
}

const fetchMicrosoftPage = async (url) => {
  const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
  if (!response.ok) throw new Error(`Microsoft ${response.status}`)
  const html = await response.text()
  const blocks = html.split(/<div class="careers-joblistResponsive-columnList[^"]*">/g).slice(1)
  return blocks
    .map(block => {
      const role = decodeText(block.match(/<h3 class="careers-joblistResponsive-subheading">([\s\S]*?)<\/h3>/)?.[1])
      const postedAt = decodeText(block.match(/careers-joblistResponsive-postdate">([\s\S]*?)<\/div>/)?.[1])
      const location = decodeText(block.match(/careers-joblistResponsive-primarylocation">([\s\S]*?)<\/div>/)?.[1])
      const directApplyUrl = decodeText(block.match(/<a href="([^"]+)"[^>]*class="careers-joblistResponsive-button"/)?.[1])
      const description = htmlToText(block.match(/careers-joblistResponsive-desc[^>]*>([\s\S]*?)<\/div>\s*<p class="careers-joblistResponsive-descText"/)?.[1])
      return { role, postedAt, location, directApplyUrl, description }
    })
    .filter(job => job.role && job.postedAt && job.location && job.directApplyUrl)
    .filter(job => isSdeRole({ title: job.role, text: job.role }))
    .map(normalizeMicrosoftJob)
    .filter(job => Date.parse(job.postedAt) >= cutoff)
}

const fetchAshby = async (company) => {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company.board}`
    const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
    if (!response.ok) throw new Error(`${company.name} AB ${response.status}`)
    const payload = await response.json()
    return (payload.jobs || [])
      .filter(job => isSdeRole({ title: job.title }))
      .map(job => normalizeAshbyJob(job, company))
      .filter(job => Number.isFinite(Date.parse(job.postedAt)) && Date.parse(job.postedAt) >= cutoff)
  } catch (error) {
    throw new Error(`${company.name} Ashby: ${error.message}`)
  }
}

const fetchSmartRecruiters = async (company) => {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${company.board}/postings`
    const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
    if (!response.ok) throw new Error(`${company.name} SR ${response.status}`)
    const payload = await response.json()
    const postings = (payload.content || []).filter(job => isSdeRole({ title: job.name }))
    
    const jobs = []
    for (const job of postings) {
      try {
        const detailUrl = `https://api.smartrecruiters.com/v1/companies/${company.board}/postings/${job.id}`
        const detailRes = await fetchWithTimeout(detailUrl, {}, fetchTimeoutMs)
        if (detailRes.ok) {
          const details = await detailRes.json()
          const normalized = normalizeSmartRecruitersJob(job, company, details)
          if (Number.isFinite(Date.parse(normalized.postedAt)) && Date.parse(normalized.postedAt) >= cutoff) {
            jobs.push(normalized)
          }
        }
      } catch (e) {
        // Log individual failures silently
      }
    }
    return jobs
  } catch (error) {
    throw new Error(`${company.name} SmartRecruiters: ${error.message}`)
  }
}

const workdayDatacenters = ['wd3', 'wd1', 'wd5', 'wd8', 'wd12']

const fetchWorkday = async (company) => {
  // Workday uses POST /wday/cxs/{subdomain}/{tenant}/jobs
  // We try each datacenter variant until one succeeds
  for (const dc of workdayDatacenters) {
    try {
      const url = `https://${company.workdaySubdomain}.${dc}.myworkdayjobs.com/wday/cxs/${company.workdaySubdomain}/${company.workdayTenant}/jobs`
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appliedFacets: {},
          limit: 20,
          offset: 0,
          searchText: 'software engineer',
        }),
      }, fetchTimeoutMs)
      if (!response.ok) continue
      const payload = await response.json()
      const postings = (payload.jobPostings || [])
        .filter(job => isSdeRole({ title: job.title }))
        .map(job => normalizeWorkdayJob(job, company))
        .filter(job => Number.isFinite(Date.parse(job.postedAt)) && Date.parse(job.postedAt) >= cutoff)
      if (postings.length >= 0) return postings // success on this DC
    } catch {
      // try next datacenter
    }
  }
  throw new Error(`${company.name} Workday: no working datacenter found`)
}

// ─── Auto-discovery engine ────────────────────────────────────────────────────

/**
 * Probe a single Greenhouse board slug. Returns null if no valid board.
 * We consider a board valid if the API returns a non-error JSON response.
 */
const probeGreenhouse = async (slug) => {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
    const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
    if (!response.ok) return null
    const payload = await response.json()
    if (!Array.isArray(payload.jobs)) return null
    return slug
  } catch {
    return null
  }
}

/**
 * Probe a single Lever board slug. Returns null if no valid board.
 */
const probeLever = async (slug) => {
  try {
    const url = `https://api.lever.co/v0/postings/${slug}`
    const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
    if (!response.ok) return null
    const payload = await response.json()
    if (!Array.isArray(payload)) return null
    return slug
  } catch {
    return null
  }
}

const probeAshby = async (slug) => {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`
    const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
    if (!response.ok) return null
    const payload = await response.json()
    // Require at least 1 job to avoid false positives
    if (!Array.isArray(payload.jobs) || payload.jobs.length === 0) return null
    return slug
  } catch {
    return null
  }
}

const probeSmartRecruiters = async (slug) => {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings`
    const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
    if (!response.ok) return null
    const payload = await response.json()
    // SR returns 200 with empty content for ANY slug — require totalFound > 0
    if (!payload.totalFound || payload.totalFound === 0) return null
    return slug
  } catch {
    return null
  }
}

const probeWorkday = async (subdomain, tenant) => {
  const tenantSuffixes = [tenant, `${tenant}_External`, `${tenant}_External_Career`, `${tenant}_Career`, `${tenant}_External_Careers`, `${tenant}_Careers`]
  for (const dc of workdayDatacenters) {
    for (const tenantCandidate of tenantSuffixes) {
      try {
        const url = `https://${subdomain}.${dc}.myworkdayjobs.com/wday/cxs/${subdomain}/${tenantCandidate}/jobs`
        const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
        if (!response.ok) continue
        const payload = await response.json()
        if (!payload.jobPostings || !Array.isArray(payload.jobPostings)) continue
        return { subdomain, tenant: tenantCandidate }
      } catch {
        // ignore and try next combination
      }
    }
  }
  return null
}

/**
 * For a single company, try all slug variants across the cheap ATS APIs
 * (Greenhouse, Lever, Ashby, SmartRecruiters) in parallel, since each probe
 * is a single fast request. Workday is skipped by default — its probe tries
 * 5 datacenters x up to 6 tenant-name guesses *per slug variant*, which is
 * 100+ requests per company for a guess that rarely lands (Workday tenant
 * names aren't reliably derivable from a company name). Set
 * DISCOVER_WORKDAY=1 if you want to enable it anyway (expect it to be slow).
 * Returns { source, board } or null if nothing found.
 */
const discoverWorkdayEnabled = process.env.DISCOVER_WORKDAY === '1'

const discoverCompanyBoard = async (company) => {
  const variants = generateSlugVariants(company.name)

  const probeAllVariants = async (probeFn, source) => {
    const results = await Promise.all(variants.map(slug => probeFn(slug)))
    const found = results.find(Boolean)
    return found ? { source, board: found } : null
  }

  const [gh, lever, ashby, sr] = await Promise.all([
    probeAllVariants(probeGreenhouse, 'greenhouse'),
    probeAllVariants(probeLever, 'lever'),
    probeAllVariants(probeAshby, 'ashby'),
    probeAllVariants(probeSmartRecruiters, 'smartrecruiters'),
  ])
  const cheapResult = gh || lever || ashby || sr
  if (cheapResult) return cheapResult

  if (discoverWorkdayEnabled) {
    for (const slug of variants) {
      const found = await probeWorkday(slug, slug)
      if (found) return {
        source: 'workday',
        board: found.subdomain,
        workdaySubdomain: found.subdomain,
        workdayTenant: found.tenant,
      }
    }
  }

  return null
}

// ─── Concurrency runner ───────────────────────────────────────────────────────

const runLimited = async (tasks, limit) => {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++
      results[index] = await Promise.allSettled([tasks[index]()])
    }
  })
  await Promise.all(workers)
  return results.map(r => r?.[0])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Load catalog
let catalogData = { companies: [] }
try {
  const catalogText = await readFile('src/data/company-catalog.json', 'utf-8')
  catalogData = JSON.parse(catalogText)
} catch (error) {
  console.error(`Error reading company catalog: ${error.message}`)
}

const allCatalogCompanies = catalogData.companies || []

const normalizeCompanyName = (name) => String(name || '').toLowerCase().trim()
const appliedWorkdayCompanies = []
for (const company of allCatalogCompanies) {
  const nameKey = normalizeCompanyName(company.name)
  const known = KNOWN_WORKDAY[nameKey]
  if (known && (!company.source || company.source === 'workday') && !company.careersUrl && !company.officialCareerUrl) {
    const [subdomain, tenant] = known
    company.source = 'workday'
    company.boardSlugGuess = subdomain
    company.workdaySubdomain = subdomain
    company.workdayTenant = tenant
    appliedWorkdayCompanies.push(company.name)
  }
}

if (appliedWorkdayCompanies.length > 0) {
  console.log(`Applied known Workday mappings for ${appliedWorkdayCompanies.length} companies.`)
  const updatedCatalog = {
    ...catalogData,
    generatedAt: new Date().toISOString(),
    companies: allCatalogCompanies,
  }
  await writeFile('src/data/company-catalog.json', JSON.stringify(updatedCatalog, null, 2) + '\n')
  console.log('Saved updated company catalog with Workday mappings.')
}

// ─── Auto-discovery for unconfigured companies ────────────────────────────────
// Every company in the catalog should ultimately be backed by its own career
// portal source. Companies without a known source are probed against
// Greenhouse / Lever / Ashby / SmartRecruiters / Workday so the app reflects
// each company's *actual* portal instead of silently skipping them.

const knownSources = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'microsoft', 'generic']
const retryAfterMs = 14 * 24 * 60 * 60 * 1000 // re-probe failed companies every 14 days
const discoveryBatchSize = Number(process.env.DISCOVERY_BATCH_SIZE || 250) // companies probed per run

const undiscovered = allCatalogCompanies.filter(c => !knownSources.includes(c.source))
const discoveryCandidates = undiscovered
  .filter(c => !c.discoveryAttemptedAt || (Date.now() - Date.parse(c.discoveryAttemptedAt)) > retryAfterMs)
  .slice(0, discoveryBatchSize)

console.log(`\nAuto-discovery: ${undiscovered.length} companies have no known career-portal source.`)
console.log(`Probing ${discoveryCandidates.length} of them this run (Greenhouse → Lever → Ashby → SmartRecruiters → Workday)...`)

if (discoveryCandidates.length > 0) {
  let completed = 0
  const progressEvery = 10
  const discoveryTasks = discoveryCandidates.map(company => async () => {
    const found = await discoverCompanyBoard(company)
    company.discoveryAttemptedAt = new Date().toISOString()
    if (found) {
      company.source = found.source
      company.boardSlugGuess = found.board
      if (found.source === 'workday') {
        company.workdaySubdomain = found.workdaySubdomain
        company.workdayTenant = found.workdayTenant
      }
      company.discoveryFailed = false
    } else {
      company.discoveryFailed = true
    }
    completed += 1
    if (completed % progressEvery === 0 || completed === discoveryCandidates.length) {
      process.stdout.write(`  ...probed ${completed}/${discoveryCandidates.length} companies\r`)
    }
    return found
  })

  const discoveryResults = await runLimited(discoveryTasks, discoveryConcurrency)
  process.stdout.write('\n')
  const newlyDiscovered = discoveryResults.filter(r => r?.status === 'fulfilled' && r.value).length
  console.log(`Discovered career portals for ${newlyDiscovered} previously-unconfigured companies.`)

  // Persist discoveries (and attempt timestamps) so future runs don't re-probe needlessly.
  const updatedCatalog = {
    ...catalogData,
    generatedAt: new Date().toISOString(),
    companies: allCatalogCompanies,
  }
  await writeFile('src/data/company-catalog.json', JSON.stringify(updatedCatalog, null, 2) + '\n')
  console.log('Saved updated company catalog with auto-discovered portal mappings.')
}

// Separate pre-configured vs unconfigured companies (now including freshly discovered ones)
const preConfiguredGH = allCatalogCompanies.filter(c => c.source === 'greenhouse' && c.boardSlugGuess)
const preConfiguredLever = allCatalogCompanies.filter(c => c.source === 'lever' && c.boardSlugGuess)
const preConfiguredAshby = allCatalogCompanies.filter(c => c.source === 'ashby' && c.boardSlugGuess)
const preConfiguredSmartRecruiters = allCatalogCompanies.filter(c => c.source === 'smartrecruiters' && c.boardSlugGuess)
const preConfiguredWorkday = allCatalogCompanies.filter(c => c.source === 'workday' && c.boardSlugGuess && c.workdayTenant)
const microsoftCompany = allCatalogCompanies.find(c => c.source === 'microsoft')

const skippedCompanies = allCatalogCompanies.filter(c => !['greenhouse','lever','ashby','smartrecruiters','workday','microsoft','generic'].includes(c.source))
const genericCompanies = allCatalogCompanies.filter(c => c.source === 'generic' && (c.careersUrl || c.officialCareerUrl)).length

console.log(`\nCatalog: ${allCatalogCompanies.length} total companies`)
console.log(`Configured: ${preConfiguredGH.length} Greenhouse, ${preConfiguredLever.length} Lever, ${preConfiguredAshby.length} Ashby, ${preConfiguredSmartRecruiters.length} SmartRecruiters, ${preConfiguredWorkday.length} Workday, ${microsoftCompany ? 4 : 0} Microsoft pages, ${genericCompanies} official career pages`)
console.log(`Still unconfigured: ${skippedCompanies.length} companies (${skippedCompanies.filter(c => c.discoveryFailed).length} probed with no portal found, ${skippedCompanies.filter(c => !c.discoveryAttemptedAt).length} not yet probed — run the script again to keep working through the batch).`)

// Build final list of sources to fetch from
const allGH = preConfiguredGH.map(c => ({ board: c.boardSlugGuess, name: c.name, type: c.type }))
const allLever = preConfiguredLever.map(c => ({ board: c.boardSlugGuess, name: c.name, type: c.type }))
const allAshby = preConfiguredAshby.map(c => ({ board: c.boardSlugGuess, name: c.name, type: c.type }))
const allSmartRecruiters = preConfiguredSmartRecruiters.map(c => ({ board: c.boardSlugGuess, name: c.name, type: c.type }))
const allWorkday = preConfiguredWorkday.map(c => ({
  board: c.boardSlugGuess,
  name: c.name,
  type: c.type,
  workdaySubdomain: c.workdaySubdomain || c.boardSlugGuess,
  workdayTenant: c.workdayTenant,
}))
const activeMicrosoftPages = microsoftCompany ? microsoftPages : []

console.log(`\nFetching jobs from ${allGH.length} Greenhouse, ${allLever.length} Lever, ${allAshby.length} Ashby, ${allSmartRecruiters.length} SmartRecruiters, ${allWorkday.length} Workday, ${activeMicrosoftPages.length} Microsoft pages...`)

// Fetch all jobs
const fetchTasks = [
  ...allGH.map(c => () => fetchGreenhouse(c)),
  ...allLever.map(c => () => fetchLever(c)),
  ...allAshby.map(c => () => fetchAshby(c)),
  ...allSmartRecruiters.map(c => () => fetchSmartRecruiters(c)),
  ...allWorkday.map(c => () => fetchWorkday(c)),
  ...activeMicrosoftPages.map(page => () => fetchMicrosoftPage(page)),
]

const fetchResults = await runLimited(fetchTasks, fetchConcurrency)

const jobsById = new Map()
fetchResults
  .flatMap(result => (result?.status === 'fulfilled' ? result.value : []))
  .forEach(job => jobsById.set(job.id, job))

const jobs = [...jobsById.values()].sort((a, b) => {
  const indiaRank = Number(b.country === 'India') - Number(a.country === 'India')
  if (indiaRank) return indiaRank
  return Date.parse(b.postedAt) - Date.parse(a.postedAt)
})

const failures = fetchResults
  .filter(r => r?.status === 'rejected')
  .map(r => r.reason?.message)
  .filter(Boolean)

const successfulSources = fetchResults.filter(r => r?.status === 'fulfilled' && r.value?.length > 0).length

const output = {
  generatedAt: new Date().toISOString(),
  sourceNote:
    `Fetched from each company's own career portal (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Microsoft Careers, or official career pages handled by scripts/fetch-generic.mjs), auto-discovered per-company where not already mapped in src/data/company-catalog.json. Output filtered to SDE roles posted within the last 90 days, all experience levels. Run "npm run refresh:jobs" repeatedly (set DISCOVERY_BATCH_SIZE and GENERIC_BATCH_SIZE to control batch sizes) to progressively discover the rest of the catalog.`,
  sourceStats: {
    companyCatalogSize: allCatalogCompanies.length,
    configuredWithPortal: allCatalogCompanies.length - skippedCompanies.length,
    unconfiguredRemaining: skippedCompanies.length,
    discoveryProbedThisRun: discoveryCandidates.length,
    totalSourcesAttempted: fetchTasks.length,
    successfulSources,
    cutoffDays: 90,
  },
  failures: failures.slice(0, 50),
  jobs,
}

const outputText = JSON.stringify(output, null, 2) + '\n'
await writeFile('src/data/jobs.json', outputText)
await mkdir('public/data', { recursive: true })
await writeFile('public/data/jobs.json', outputText)
console.log(`\n✅ Wrote ${jobs.length} fresh SDE jobs to src/data/jobs.json`)
console.log(`   Sources: ${allGH.length} GH + ${allLever.length} Lever + ${allAshby.length} AB + ${allSmartRecruiters.length} SR + ${allWorkday.length} WD + ${activeMicrosoftPages.length} MS = ${fetchTasks.length} total`)
console.log(`   Successful sources: ${successfulSources}`)
if (failures.length) {
  console.warn(`   Skipped ${failures.length} sources (expected for companies with no job board)`)
}
