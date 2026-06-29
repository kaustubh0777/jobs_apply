// ─── Generic career-site fetcher ───────────────────────────────────────────────
//
// Covers companies that aren't on a known ATS (Greenhouse/Lever/Ashby/
// SmartRecruiters/Workday/Microsoft). There is no universal API for "a
// company's own website", so this script first trusts explicit official
// careersUrl values in src/data/company-catalog.json, then relies on the one
// semi-standard signal that real career sites widely publish: schema.org
// JobPosting structured data (JSON-LD), embedded specifically so Google for
// Jobs can index it. A tiny parser is included for Google Careers because it
// publishes jobs in Google's own official page payload rather than JSON-LD.
// If a site doesn't expose either of those, plain HTML scraping is not
// attempted, because there is no reliable, general way to tell a job listing
// apart from arbitrary page content without it. Those companies are left
// honestly marked as unconfigured rather than fed with guessed/fabricated data.
//
// Run with:  node scripts/fetch-generic.mjs
// Tune with: GENERIC_BATCH_SIZE=100 GENERIC_USE_BROWSER=1 node scripts/fetch-generic.mjs
//
// This script is additive: it merges newly-found jobs into the existing
// src/data/jobs.json (written by fetch-jobs.mjs) and only updates catalog
// entries for companies it actually confirmed data for.

import { mkdir, writeFile, readFile } from 'node:fs/promises'

const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
const cutoff = Date.now() - ninetyDaysMs
const fetchTimeoutMs = 8000
const probeConcurrency = 25
const browserConcurrency = 4 // headless browser instances are expensive, keep low
const retryAfterMs = 14 * 24 * 60 * 60 * 1000

const batchSize = Number(process.env.GENERIC_BATCH_SIZE || 100)
const useBrowserFallback = process.env.GENERIC_USE_BROWSER !== '0' // on by default, set to '0' to disable

const sdeTitleTerms = [
  'software engineer', 'software engine', 'software developer', 'software dev', 'application developer', 'frontend', 'front end',
  'backend', 'back end', 'full stack', 'fullstack', 'platform engineer', 'systems engineer',
  'architect', 'infrastructure engineer', 'mobile engineer', 'android engineer', 'ios engineer',
  'machine learning engineer', 'data engineer', 'devops engineer', 'site reliability engineer',
  'sre', 'member of technical staff', 'mts', 'technical staff',
]
const excludedTitleTerms = [
  'copy of', 'account executive', 'sales development', 'sales engineer', 'sales manager',
  'recruiter', 'recruiting', 'support engineer', 'customer support', 'solution area', 'people ops',
  'hr ', 'human resources', 'director', 'vp of', 'vice president', 'product manager',
  'program manager', 'project manager', 'business analyst', 'finance', 'legal', 'marketing',
  'customer success', 'office manager', 'executive assistant',
]
const isSdeRole = (title = '') => {
  const t = title.toLowerCase()
  if (excludedTitleTerms.some(term => t.includes(term))) return false
  return sdeTitleTerms.some(term => t.includes(term))
}

const isIndiaLocation = (location = '') =>
  /india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|new delhi|chennai|ahmedabad|kolkata|calcutta|jaipur|lucknow|kochi|cochin|bhubaneswar|trivandrum|thiruvananthapuram|nagpur|indore|coimbatore|vadodara|surat|mangalore|vizag|visakhapatnam|chandigarh|mohali/i.test(location)

const countryRules = [
  { country: 'India', test: /india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|chennai/i },
  { country: 'United States', test: /united states|usa|u\.s\.|california|new york|seattle|san francisco|austin|boston|chicago|texas/i },
  { country: 'United Kingdom', test: /united kingdom|uk|london|england|scotland/i },
  { country: 'Canada', test: /canada|toronto|vancouver|montreal/i },
  { country: 'Germany', test: /germany|berlin|munich/i },
  { country: 'Singapore', test: /singapore/i },
]
const countryFromLocation = (location = '') => countryRules.find(r => r.test.test(location))?.country || 'Global'

const fetchWithTimeout = async (url, options = {}, timeoutMs = fetchTimeoutMs) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobFetchBot/1.0)', ...(options.headers || {}) },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

const normalizeUrl = (url = '') => {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const textFromMaybeHtml = (value = '') =>
  String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const parseDateValue = (value) => {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return null
}

const makeOfficialSourceLabel = (companyName) => `${companyName} official careers site`

const absoluteUrl = (baseUrl, maybeUrl = '') => {
  if (!maybeUrl) return baseUrl
  try {
    return new URL(maybeUrl, baseUrl).toString()
  } catch {
    return baseUrl
  }
}

const safeJobIdPart = (value = '') =>
  String(value || 'job').replace(/\W+/g, '').toLowerCase().slice(0, 90) || 'job'

// ─── Domain + careers-page guessing ────────────────────────────────────────────
// This step is inherently a guess. We verify it by requiring an actual 200
// response with real structured-data job content before trusting anything.

const guessDomains = (name) => {
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(india|inc|llc|ltd|limited|corp|corporation|technologies|technology|services|solutions|systems|software|global|pvt|private|public|group|labs)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const compact = cleaned.replace(/\s+/g, '')
  const firstWord = cleaned.split(' ').filter(Boolean)[0] || compact
  const candidates = [...new Set([compact, firstWord])].filter(s => s.length >= 2)
  // Capped to .com + .in — the two TLDs that cover the vast majority of
  // companies in this catalog. Keeping this list short is what keeps a
  // single company's probe from taking minutes.
  const tlds = ['.com', '.in']
  return candidates.flatMap(base => tlds.map(tld => `${base}${tld}`)).slice(0, 4)
}

// Most companies that publish JobPosting structured data put it on one of
// these two paths. Kept short on purpose — see guessDomains note above.
const careerPaths = ['/careers', '/jobs']
const probeTimeoutMs = 4000

const probeJsonLdJobs = (html) => {
  const jobs = []
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    let parsed
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed])
    for (const item of candidates) {
      if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) {
        jobs.push(item)
      }
    }
  }
  return jobs
}

const sitemapJobsForCareerSite = async (pageUrl) => {
  let origin
  try {
    origin = new URL(pageUrl).origin
  } catch {
    return []
  }

  const sitemapUrls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/jobs-sitemap.xml`,
    `${origin}/job-sitemap.xml`,
  ]
  const jobPageUrls = new Set()
  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetchWithTimeout(sitemapUrl, {}, probeTimeoutMs)
      if (!response.ok) continue
      const xml = await response.text()
      const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(match => textFromMaybeHtml(match[1]))
      for (const url of urls) {
        if (/sitemap/i.test(url) && jobPageUrls.size < 40) {
          try {
            const nested = await fetchWithTimeout(url, {}, probeTimeoutMs)
            if (!nested.ok) continue
            const nestedXml = await nested.text()
            for (const nestedMatch of nestedXml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
              const nestedUrl = textFromMaybeHtml(nestedMatch[1])
              if (/career|job|opening|position|vacanc/i.test(nestedUrl)) jobPageUrls.add(nestedUrl)
            }
          } catch {
            // Ignore nested sitemap failures.
          }
        } else if (/career|job|opening|position|vacanc/i.test(url)) {
          jobPageUrls.add(url)
        }
      }
    } catch {
      // Try the next sitemap name.
    }
  }

  const jobs = []
  for (const url of [...jobPageUrls].slice(0, 30)) {
    try {
      const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
      if (!response.ok) continue
      const html = await response.text()
      jobs.push(...probeJsonLdJobs(html).map(job => ({ ...job, url: job.url || url })))
    } catch {
      // Ignore individual job page fetch failures.
    }
  }
  return jobs
}

const findBalancedJsonArray = (text, start) => {
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '[') {
      depth += 1
    } else if (ch === ']') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}

const timestampFromGoogleTuple = (tuple) => {
  if (!Array.isArray(tuple) || !Number.isFinite(tuple[0])) return null
  return new Date(tuple[0] * 1000).toISOString()
}

const googleJobPathFromTitle = (id, title) => {
  const slug = String(title || 'job')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `https://www.google.com/about/careers/applications/jobs/results/${id}-${slug}`
}

const parseGoogleCareersJobs = (html) => {
  if (!html.includes("AF_initDataCallback({key: 'ds:1'")) return []
  const marker = "AF_initDataCallback({key: 'ds:1'"
  const markerIndex = html.indexOf(marker)
  const dataIndex = html.indexOf('data:', markerIndex)
  const start = html.indexOf('[', dataIndex)
  const jsonText = findBalancedJsonArray(html, start)
  if (!jsonText) return []

  let payload
  try {
    payload = JSON.parse(jsonText)
  } catch {
    return []
  }

  const jobs = Array.isArray(payload?.[0]) ? payload[0] : []
  return jobs
    .filter(job => Array.isArray(job) && job[0] && job[1])
    .map(job => {
      const locations = Array.isArray(job[9])
        ? job[9].map(location => location?.[0]).filter(Boolean).join(' | ')
        : 'Not listed'
      const responsibilities = job[3]?.[1] || ''
      const qualifications = job[4]?.[1] || job[19]?.[1] || ''
      const description = job[10]?.[1] || ''
      const summary = textFromMaybeHtml([description, qualifications, responsibilities].filter(Boolean).join(' '))
      const companyName = job[7] || 'Google'
      return {
        title: textFromMaybeHtml(job[1]),
        companyName,
        location: textFromMaybeHtml(locations) || 'Not listed',
        description: summary,
        postedAt: timestampFromGoogleTuple(job[12] || job[13] || job[14]),
        url: googleJobPathFromTitle(job[0], job[1]),
        applyUrl: job[2],
        department: companyName === 'DeepMind' ? 'AI Engineering' : 'Engineering',
      }
    })
}

const normalizeOfficialCareerJob = (job, company) => {
  const location = job.location || 'Not listed'
  return {
    id: `official-${safeJobIdPart(job.sourceKey || company.name)}-${safeJobIdPart(job.id || job.url || job.title + job.postedAt)}`,
    role: job.title,
    company: job.companyName || company.name,
    companyType: job.companyType || company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: 'INR',
    experienceMin: 0,
    experienceMax: null,
    experienceLabel: 'Not specified by official site',
    experienceSource: 'Not specified by official site',
    postedAt: parseDateValue(job.postedAt),
    source: job.sourceLabel || makeOfficialSourceLabel(company.name),
    directApplyUrl: job.url,
    department: job.department || 'Engineering',
    summary: textFromMaybeHtml(job.description).slice(0, 280),
  }
}

const parseAmazonOfficialJobs = (payload, pageUrl) => {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : []
  return jobs.map(job => {
    const location = job.normalized_location || job.location || [
      job.city,
      job.state,
      job.country_code === 'IND' ? 'India' : job.country_code,
    ].filter(Boolean).join(', ')
    return {
      id: job.id_icims || job.id || job.job_path,
      sourceKey: 'amazon-jobs',
      sourceLabel: 'Amazon Jobs official site',
      companyType: 'Product',
      title: textFromMaybeHtml(job.title),
      companyName: 'Amazon',
      location: textFromMaybeHtml(location),
      description: [job.description_short, job.description, job.basic_qualifications, job.preferred_qualifications].filter(Boolean).join(' '),
      postedAt: job.posted_date || job.updated_time,
      url: absoluteUrl('https://www.amazon.jobs', job.job_path || pageUrl),
      department: job.job_category || job.job_family || job.team || 'Software Development',
    }
  })
}

const fetchAmazonOfficialJobs = async (pageUrl) => {
  const url = pageUrl.includes('search.json')
    ? pageUrl
    : 'https://www.amazon.jobs/en/search.json?base_query=software+engineer&country=IND&result_limit=50&sort=recent'
  const response = await fetchWithTimeout(url, {}, fetchTimeoutMs)
  if (!response.ok) return []
  const payload = await response.json()
  return parseAmazonOfficialJobs(payload, url)
}

const parseAppleOfficialJobs = (html, pageUrl) => {
  const match = html.match(/JSON\.parse\(("(?:\\.|[^"\\])*")\)/)
  if (!match) return []

  let payload
  try {
    payload = JSON.parse(JSON.parse(match[1]))
  } catch {
    return []
  }

  const results = payload?.loaderData?.search?.searchResults || []
  return results.map(job => {
    const locations = Array.isArray(job.locations)
      ? job.locations.map(l => l.name || l.city || l.countryName).filter(Boolean).join(' | ')
      : 'India'
    const teamCode = job.team?.teamCode ? `?team=${encodeURIComponent(job.team.teamCode)}` : ''
    const detailPath = `/en-in/details/${job.id || job.reqId || job.positionId}/${job.transformedPostingTitle || safeJobIdPart(job.postingTitle)}${teamCode}`
    return {
      id: job.id || job.reqId || job.positionId,
      sourceKey: 'apple-jobs',
      sourceLabel: 'Apple Jobs official site',
      title: textFromMaybeHtml(job.postingTitle),
      companyName: 'Apple',
      location: textFromMaybeHtml(locations),
      description: job.jobSummary || '',
      postedAt: job.postDateInGMT || job.postingDate,
      url: absoluteUrl(pageUrl, detailPath),
      department: job.team?.teamName || 'Engineering',
    }
  })
}

const parseFlipkartOfficialJobs = (html, pageUrl) => {
  const cards = [...html.matchAll(/<div class="job-card">([\s\S]*?)<\/div>\s*<\/div>/g)]
  return cards.map((match, index) => {
    const card = match[1]
    const rawTitle = card.match(/<h6[^>]*>([\s\S]*?)<\/h6>/)?.[1] || ''
    const rawLocation = card.match(/Location\s*:\s*<strong>([\s\S]*?)<\/strong>/i)?.[1] || 'India'
    const title = textFromMaybeHtml(rawTitle)
    const truncated = title.endsWith('...')
    return {
      id: `${index}-${title}`,
      sourceKey: 'flipkart-careers',
      sourceLabel: 'Flipkart Careers official site',
      title,
      companyName: 'Flipkart',
      location: textFromMaybeHtml(rawLocation),
      description: truncated
        ? 'Flipkart Careers lists this role on its official jobs page, but the raw page truncates the title.'
        : 'Flipkart Careers official jobs listing.',
      postedAt: null,
      url: pageUrl,
      department: 'Engineering',
    }
  })
}

const parseMetaOfficialJobs = (html, pageUrl) => {
  const jobs = []
  const decoded = textFromMaybeHtml(html)
  const jobUrlRegex = /https?:\\?\/\\?\/www\.metacareers\.com\\?\/jobs\\?\/(\d+)\\?\/?/g
  const seen = new Set()
  let match
  while ((match = jobUrlRegex.exec(decoded)) !== null) {
    const id = match[1]
    if (seen.has(id)) continue
    seen.add(id)
    const windowStart = Math.max(0, match.index - 500)
    const windowEnd = Math.min(decoded.length, match.index + 500)
    const chunk = decoded.slice(windowStart, windowEnd)
    const title = chunk.match(/([A-Z][A-Za-z0-9 +,/()-]*(?:Software|Android|iOS|Machine Learning|Data|Production|Security|Systems|Infrastructure)[A-Za-z0-9 +,/()-]*Engineer[A-Za-z0-9 +,/()-]*)/)?.[1]
    if (!title) continue
    const location = /india|bengaluru|bangalore|hyderabad|gurugram|mumbai|delhi/i.test(chunk) ? 'India' : 'Not listed'
    jobs.push({
      id,
      sourceKey: 'meta-careers',
      sourceLabel: 'Meta Careers official site',
      title: textFromMaybeHtml(title),
      companyName: 'Meta',
      location,
      description: 'Meta Careers official job listing.',
      postedAt: null,
      url: `https://www.metacareers.com/jobs/${id}/`,
      department: 'Engineering',
    })
  }
  return jobs.length ? jobs : []
}

const parseOfficialSiteJobs = (company, url, html) => {
  const companyKey = String(company.name || '').toLowerCase()
  const host = new URL(url).hostname.toLowerCase()
  if (host.includes('apple.com') || companyKey === 'apple') return parseAppleOfficialJobs(html, url)
  if (host.includes('flipkartcareers.com') || companyKey === 'flipkart') return parseFlipkartOfficialJobs(html, url)
  if (host.includes('metacareers.com') || companyKey.includes('meta')) return parseMetaOfficialJobs(html, url)
  return []
}

const normalizeGenericJob = (job, company, pageUrl) => {
  const title = job.title || ''
  const locationObj = job.jobLocation
  const locationParts = Array.isArray(locationObj) ? locationObj : [locationObj]
  const location = locationParts
    .map(l => l?.address?.addressLocality || l?.address?.addressRegion || l?.address?.addressCountry)
    .filter(Boolean)
    .join(', ') || (job.jobLocationType === 'TELECOMMUTE' ? 'Remote' : 'Not listed')
  const description = String(job.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const postedAt = job.datePosted || null
  const applyUrl = job.url || job.applicantLocationRequirements?.url || pageUrl
  return {
    id: `generic-${company.name.replace(/\W+/g, '').toLowerCase()}-${(title + postedAt).replace(/\W+/g, '').slice(0, 60)}`,
    role: title,
    company: company.name,
    companyType: company.type,
    location,
    country: countryFromLocation(location),
    countryGroup: isIndiaLocation(location) ? 'India' : 'Global',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: 'INR',
    experienceMin: 0,
    experienceMax: null,
    experienceLabel: 'Not specified by portal',
    experienceSource: 'Not specified by portal',
    postedAt,
    source: 'Company career site (structured data)',
    directApplyUrl: applyUrl,
    department: 'Engineering',
    summary: description.slice(0, 280),
  }
}

const normalizeGoogleCareersJob = (job, company) => {
  const salary = null
  return {
    id: `google-careers-${job.url.match(/results\/([^/?#]+)/)?.[1] || (job.title + job.postedAt).replace(/\W+/g, '').slice(0, 80)}`,
    role: job.title,
    company: job.companyName || company.name,
    companyType: company.type,
    location: job.location,
    country: countryFromLocation(job.location),
    countryGroup: isIndiaLocation(job.location) ? 'India' : 'Global',
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: 'INR',
    experienceMin: 0,
    experienceMax: null,
    experienceLabel: 'Not specified by portal',
    experienceSource: 'Not specified by portal',
    postedAt: job.postedAt,
    source: 'Google Careers official site',
    directApplyUrl: job.url,
    department: job.department || 'Engineering',
    summary: job.description.slice(0, 280),
  }
}

// ─── Per-company discovery: plain fetch first ─────────────────────────────────

const tryPlainFetch = async (company) => {
  const officialUrl = normalizeUrl(company.careersUrl || company.officialCareerUrl)
  if (/amazon\.jobs/i.test(officialUrl)) {
    try {
      const amazonJobs = await fetchAmazonOfficialJobs(officialUrl)
      if (amazonJobs.length > 0) return { careersUrl: officialUrl, officialJobs: amazonJobs, googleJobs: [], jsonLdJobs: [], htmlSeen: true }
    } catch {
      return null
    }
  }

  const domains = officialUrl ? [] : guessDomains(company.name)
  const urls = officialUrl
    ? [officialUrl]
    : domains.flatMap(domain => careerPaths.map(path => `https://${domain}${path}`))

  const results = await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetchWithTimeout(url, {}, probeTimeoutMs)
      if (!response.ok) return null
      const html = await response.text()
      const jsonLdJobs = probeJsonLdJobs(html)
      const googleJobs = parseGoogleCareersJobs(html)
      const officialJobs = parseOfficialSiteJobs(company, url, html)
      return { url, jsonLdJobs, googleJobs, officialJobs, reachable: true }
    } catch {
      return null
    }
  }))

  const withOfficialJobs = results.find(r => r && r.officialJobs.length > 0)
  if (withOfficialJobs) return { careersUrl: withOfficialJobs.url, officialJobs: withOfficialJobs.officialJobs, googleJobs: [], jsonLdJobs: [], htmlSeen: true }

  const withGoogleJobs = results.find(r => r && r.googleJobs.length > 0)
  if (withGoogleJobs) return { careersUrl: withGoogleJobs.url, officialJobs: [], googleJobs: withGoogleJobs.googleJobs, jsonLdJobs: [], htmlSeen: true }

  const withJsonLdJobs = results.find(r => r && r.jsonLdJobs.length > 0)
  if (withJsonLdJobs) return { careersUrl: withJsonLdJobs.url, officialJobs: [], jsonLdJobs: withJsonLdJobs.jsonLdJobs, googleJobs: [], htmlSeen: true }

  const reachable = results.find(r => r && r.reachable)
  if (officialUrl && reachable) {
    const sitemapJobs = await sitemapJobsForCareerSite(reachable.url)
    if (sitemapJobs.length > 0) {
      return { careersUrl: reachable.url, officialJobs: [], jsonLdJobs: sitemapJobs, googleJobs: [], htmlSeen: true }
    }
  }
  if (reachable) company._reachableCareersUrl = reachable.url
  return null
}

// ─── Browser fallback for JS-rendered career sites ────────────────────────────

let chromiumLauncher = null
const getBrowser = async () => {
  if (!useBrowserFallback) return null
  if (chromiumLauncher) return chromiumLauncher
  try {
    const { chromium } = await import('playwright')
    chromiumLauncher = await chromium.launch({ headless: true })
    return chromiumLauncher
  } catch (error) {
    console.warn(`Browser fallback unavailable (${error.message}). Run "npx playwright install chromium" to enable it. Continuing with plain-fetch results only.`)
    return null
  }
}

const tryBrowserFetch = async (company, browser) => {
  const url = company._reachableCareersUrl
  if (!browser || !url) return null
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; JobFetchBot/1.0)' })
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: fetchTimeoutMs * 2 })
    const html = await page.content()
    const officialJobs = parseOfficialSiteJobs(company, url, html)
    if (officialJobs.length > 0) return { careersUrl: url, officialJobs, googleJobs: [], jsonLdJobs: [] }
    const googleJobs = parseGoogleCareersJobs(html)
    if (googleJobs.length > 0) return { careersUrl: url, officialJobs: [], googleJobs, jsonLdJobs: [] }
    const jsonLdJobs = probeJsonLdJobs(html)
    if (jsonLdJobs.length > 0) return { careersUrl: url, officialJobs: [], jsonLdJobs, googleJobs: [] }
    return null
  } catch {
    return null
  } finally {
    await context.close()
  }
}

// ─── Concurrency runner ────────────────────────────────────────────────────────

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

// ─── Main ──────────────────────────────────────────────────────────────────────

let catalogData = { companies: [] }
try {
  catalogData = JSON.parse(await readFile('src/data/company-catalog.json', 'utf-8'))
} catch (error) {
  console.error(`Error reading company catalog: ${error.message}`)
  process.exit(1)
}

const allCompanies = catalogData.companies || []
const atsSources = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'microsoft']

const confirmedGenericCandidates = allCompanies
  .filter(c => !atsSources.includes(c.source))
  .filter(c => c.source === 'generic' && (c.careersUrl || c.officialCareerUrl))

const discoveryCandidates = allCompanies
  .filter(c => !atsSources.includes(c.source))
  .filter(c => c.source !== 'generic')
  .filter(c => !c.genericAttemptedAt || (Date.now() - Date.parse(c.genericAttemptedAt)) > retryAfterMs)
  .slice(0, batchSize)

const candidates = [...confirmedGenericCandidates, ...discoveryCandidates]

console.log(`Generic discovery: ${allCompanies.length - allCompanies.filter(c => atsSources.includes(c.source)).length} companies have no known ATS source.`)
console.log(`Checking ${confirmedGenericCandidates.length} confirmed official career pages and probing ${discoveryCandidates.length} unresolved companies this run...`)

let phase1Completed = 0
const phase1Results = await runLimited(candidates.map(company => async () => {
  const found = await tryPlainFetch(company)
  phase1Completed += 1
  if (phase1Completed % 10 === 0 || phase1Completed === candidates.length) {
    process.stdout.write(`  ...checked ${phase1Completed}/${candidates.length} companies\r`)
  }
  return { company, found }
}), probeConcurrency)
process.stdout.write('\n')

const needsBrowser = []
const confirmed = []

for (const r of phase1Results) {
  if (r?.status !== 'fulfilled') continue
  const { company, found } = r.value
  company.genericAttemptedAt = new Date().toISOString()
  if (found) {
    confirmed.push({ company, found })
  } else if (useBrowserFallback && company._reachableCareersUrl) {
    needsBrowser.push(company)
  } else {
    company.source = company.source === 'generic' ? company.source : undefined
    company.discoveryFailed = true
  }
}

if (needsBrowser.length > 0) {
  console.log(`${needsBrowser.length} companies had a reachable careers page but no structured data in raw HTML — rendering with a headless browser...`)
  const browser = await getBrowser()
  if (browser) {
    let phase2Completed = 0
    const phase2Results = await runLimited(needsBrowser.map(company => async () => {
      const found = await tryBrowserFetch(company, browser)
      phase2Completed += 1
      process.stdout.write(`  ...rendered ${phase2Completed}/${needsBrowser.length} pages\r`)
      return { company, found }
    }), browserConcurrency)
    process.stdout.write('\n')
    for (const r of phase2Results) {
      if (r?.status !== 'fulfilled') continue
      const { company, found } = r.value
      if (found) {
        confirmed.push({ company, found })
      } else {
        company.discoveryFailed = true
      }
    }
    await browser.close()
  } else {
    needsBrowser.forEach(c => { c.discoveryFailed = true })
  }
}

console.log(`Confirmed real official career-site feeds for ${confirmed.length} companies.`)

// Build normalized jobs, update catalog for confirmed companies
const newJobs = []
for (const { company, found } of confirmed) {
  company.source = 'generic'
  company.careersUrl = found.careersUrl
  company.discoveryFailed = false
  delete company._reachableCareersUrl

  const sdeJobs = (found.jsonLdJobs || [])
    .filter(j => isSdeRole(j.title || ''))
    .map(j => normalizeGenericJob(j, company, found.careersUrl))
    .filter(j => !Number.isFinite(Date.parse(j.postedAt)) || Date.parse(j.postedAt) >= cutoff)
  const googleSdeJobs = (found.googleJobs || [])
    .filter(j => isSdeRole(j.title || ''))
    .map(j => normalizeGoogleCareersJob(j, company))
    .filter(j => !Number.isFinite(Date.parse(j.postedAt)) || Date.parse(j.postedAt) >= cutoff)
  const officialSdeJobs = (found.officialJobs || [])
    .filter(j => isSdeRole(j.title || ''))
    .map(j => normalizeOfficialCareerJob(j, company))
    .filter(j => !Number.isFinite(Date.parse(j.postedAt)) || Date.parse(j.postedAt) >= cutoff)
  newJobs.push(...sdeJobs, ...googleSdeJobs, ...officialSdeJobs)
}

// Clean up any leftover internal scratch field on companies that didn't confirm
allCompanies.forEach(c => { delete c._reachableCareersUrl })

await writeFile('src/data/company-catalog.json', JSON.stringify({ ...catalogData, generatedAt: new Date().toISOString(), companies: allCompanies }, null, 2) + '\n')
console.log('Saved updated company catalog with generic career-site results.')

// Merge into existing jobs.json (written by fetch-jobs.mjs) rather than overwrite it
let existingOutput = { jobs: [], sourceStats: {} }
try {
  existingOutput = JSON.parse(await readFile('src/data/jobs.json', 'utf-8'))
} catch {
  // no existing jobs.json yet — fine, start fresh
}

const jobsById = new Map((existingOutput.jobs || []).map(j => [j.id, j]))
newJobs.forEach(j => jobsById.set(j.id, j))
const mergedJobs = [...jobsById.values()].sort((a, b) => {
  const indiaRank = Number(b.country === 'India') - Number(a.country === 'India')
  if (indiaRank) return indiaRank
  return (Date.parse(b.postedAt || '') || 0) - (Date.parse(a.postedAt || '') || 0)
})

const remainingUnconfigured = allCompanies.filter(c => !atsSources.includes(c.source) && c.source !== 'generic')

const output = {
  ...existingOutput,
  generatedAt: new Date().toISOString(),
  sourceNote:
    'Fetched from each company in the Excel-backed catalog using known ATS portals plus direct official company career pages when configured or confirmed. Generic official pages are only trusted when the script finds structured JobPosting data or a supported official payload such as Google, Amazon, Apple, Flipkart, or Meta Careers.',
  jobs: mergedJobs,
  sourceStats: {
    ...(existingOutput.sourceStats || {}),
    genericSourcesConfirmed: confirmed.length,
    genericCandidatesProbedThisRun: candidates.length,
    stillUnconfiguredAfterGeneric: remainingUnconfigured.length,
  },
}

const outputText = JSON.stringify(output, null, 2) + '\n'
await writeFile('src/data/jobs.json', outputText)
await mkdir('public/data', { recursive: true })
await writeFile('public/data/jobs.json', outputText)
console.log(`\n✅ Added ${newJobs.length} jobs from ${confirmed.length} company career sites.`)
console.log(`   ${remainingUnconfigured.length} companies still have no confirmed real job feed (no structured data found, even after browser rendering).`)
console.log(`   Run again (it'll pick up the next batch) — or increase GENERIC_BATCH_SIZE — to keep working through them.`)
