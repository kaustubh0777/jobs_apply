import { mkdir, readFile, writeFile } from 'node:fs/promises'

const catalogPath = 'src/data/company-catalog.json'
const resultPath = 'src/data/career-site-discovery.json'
const batchSize = Number(process.env.WEB_DISCOVERY_BATCH_SIZE || 25)
const concurrency = Number(process.env.WEB_DISCOVERY_CONCURRENCY || 8)
const forceDiscovery = process.env.WEB_DISCOVERY_FORCE === '1'
const useSearchFallback = process.env.WEB_DISCOVERY_USE_SEARCH === '1'
const retryAfterMs = 30 * 24 * 60 * 60 * 1000
const timeoutMs = Number(process.env.WEB_DISCOVERY_TIMEOUT_MS || 5000)
const companyTimeoutMs = Number(process.env.WEB_DISCOVERY_COMPANY_TIMEOUT_MS || 15000)
const searchDelayMs = Number(process.env.WEB_DISCOVERY_DELAY_MS || 1200)
const maxDomainsPerCompany = Number(process.env.WEB_DISCOVERY_MAX_DOMAINS || 8)
const maxPathsPerDomain = Number(process.env.WEB_DISCOVERY_MAX_PATHS || 5)
const browserUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const atsClassifiers = [
  { source: 'greenhouse', test: /greenhouse\.io|boards\.greenhouse\.io/i },
  { source: 'lever', test: /lever\.co/i },
  { source: 'ashby', test: /ashbyhq\./i },
  { source: 'smartrecruiters', test: /smartrecruiters\.com/i },
  { source: 'workday', test: /myworkdayjobs\.com/i },
]

const lowTrustHosts = [
  'linkedin.com',
  'naukri.com',
  'indeed.com',
  'glassdoor.',
  'ambitionbox.com',
  'instahyre.com',
  'hirist.com',
  'wellfound.com',
  'foundit.in',
  'timesjobs.com',
]

const commonCareerPaths = [
  '/careers',
  '/career',
  '/jobs',
  '/careers/jobs',
  '/jobslist',
  '/join-us',
  '/joinus',
  '/work-with-us',
  '/working-with-us',
  '/current-openings',
  '/job-openings',
  '/open-positions',
  '/opportunities',
]

const fetchWithTimeout = async (url, options = {}, timeoutOverrideMs = timeoutMs) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutOverrideMs)
  try {
    return await fetch(url, {
      ...options,
      headers: {
        'User-Agent': browserUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const decodeHtml = (value = '') =>
  String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const cleanCompanyName = (name = '') =>
  String(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(general insurance|insurance|bank|payments|capital|finance|financiers|india|tech|technology|technologies|services|solutions|systems|software|global|pvt|private|limited|ltd|inc|corp|corporation|group|labs|consulting|it)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const compactCompanyName = (name = '') => cleanCompanyName(name).replace(/\s+/g, '')

const domainBasesForCompany = (name = '') => {
  const original = String(name).toLowerCase()
  const clean = cleanCompanyName(name)
  const words = clean.split(/\s+/).filter(word => word.length > 1)
  const compact = words.join('')
  const first = words[0] || compact
  const firstTwo = words.slice(0, 2).join('')
  const originalDomainLike = original
    .replace(/\[[^\]]*]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9.]/g, '')
  const variants = new Set([originalDomainLike, compact, firstTwo, first].filter(value => value.length >= 2))
  return [...variants].slice(0, 5)
}

const domainCandidatesForCompany = (name = '') => {
  const bases = domainBasesForCompany(name)
  const tlds = ['.com', '.in', '.co.in', '.ai', '.io', '.co', '.net', '.org']
  const candidates = []
  for (const base of bases) {
    if (base.includes('.') && /[a-z0-9]\.[a-z]{2,}$/i.test(base)) {
      candidates.push(base)
    }
    for (const tld of tlds) {
      candidates.push(`${base.replace(/\./g, '')}${tld}`)
    }
  }
  return [...new Set(candidates)].slice(0, maxDomainsPerCompany)
}

const parseDuckDuckGoResults = (html) => {
  const results = []
  const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/g
  let match
  while ((match = resultRegex.exec(html)) !== null) {
    let href = decodeHtml(match[1])
    try {
      const maybeRedirect = new URL(href, 'https://duckduckgo.com')
      const uddg = maybeRedirect.searchParams.get('uddg')
      if (uddg) href = decodeURIComponent(uddg)
      const url = new URL(href)
      results.push({ url: url.toString(), title: decodeHtml(match[2]) })
    } catch {
      // Ignore malformed search result URLs.
    }
  }
  return results
}

const classifyUrl = (url, companyName) => {
  const parsed = new URL(url)
  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase()
  const full = parsed.toString()
  const ats = atsClassifiers.find(item => item.test.test(full))
  if (ats) return { source: ats.source, confidence: 70 }
  if (lowTrustHosts.some(host => hostname.includes(host))) return null

  const path = parsed.pathname.toLowerCase()
  const companyCompact = compactCompanyName(companyName)
  const hostCompact = hostname.split('.')[0].replace(/[^a-z0-9]+/g, '')
  const looksLikeCareerPath = /career|careers|jobs|join-us|work-with-us|openings|vacanc/i.test(path)
  const hostLooksOfficial =
    companyCompact.length >= 3 &&
    (hostCompact.includes(companyCompact.slice(0, Math.min(8, companyCompact.length))) ||
      companyCompact.includes(hostCompact))

  if (looksLikeCareerPath && hostLooksOfficial) return { source: 'generic', confidence: 95 }
  if (looksLikeCareerPath && !lowTrustHosts.some(host => hostname.includes(host))) return { source: 'generic', confidence: 75 }
  return null
}

const remainingDeadlineMs = (deadline) => deadline - Date.now()

const ensureWithinDeadline = (deadline, companyName) => {
  if (remainingDeadlineMs(deadline) <= 0) throw new Error(`${companyName}: company discovery timeout`)
}

const fetchHtml = async (url, deadline, companyName) => {
  try {
    ensureWithinDeadline(deadline, companyName)
    const response = await fetchWithTimeout(url, {}, Math.max(500, Math.min(timeoutMs, remainingDeadlineMs(deadline))))
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!/html|text/i.test(contentType)) return null
    return await response.text()
  } catch {
    return null
  }
}

const titleFromHtml = (html = '') =>
  decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')

const extractCareerLinks = (html, baseUrl, companyName) => {
  const links = []
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = anchorRegex.exec(html)) !== null) {
    const label = decodeHtml(match[2])
    const rawHref = decodeHtml(match[1])
    const haystack = `${label} ${rawHref}`.toLowerCase()
    if (!/career|jobs|join us|join-us|work with us|openings|opportunities|vacanc/.test(haystack)) continue
    try {
      const url = new URL(rawHref, baseUrl).toString()
      const classified = classifyUrl(url, companyName)
      if (classified) links.push({ ...classified, url, title: label || titleFromHtml(html) })
    } catch {
      // Ignore malformed links.
    }
  }
  return links.sort((a, b) => b.confidence - a.confidence)
}

const discoverByDomainCrawl = async (company, deadline) => {
  for (const domain of domainCandidatesForCompany(company.name)) {
    ensureWithinDeadline(deadline, company.name)
    const homepage = `https://${domain}/`
    const homepageHtml = await fetchHtml(homepage, deadline, company.name)
    if (homepageHtml) {
      const careerLinks = extractCareerLinks(homepageHtml, homepage, company.name)
      if (careerLinks.length) {
        return {
          ...careerLinks[0],
          discoveredAt: new Date().toISOString(),
          discoveryMethod: 'homepage-link-crawl',
        }
      }
    }

    for (const path of commonCareerPaths.slice(0, maxPathsPerDomain)) {
      ensureWithinDeadline(deadline, company.name)
      const url = `https://${domain}${path}`
      const classified = classifyUrl(url, company.name)
      if (!classified) continue
      const html = await fetchHtml(url, deadline, company.name)
      if (!html) continue
      const pageTitle = titleFromHtml(html)
      const pageText = decodeHtml(html.slice(0, 6000)).toLowerCase()
      if (!/career|jobs|openings|opportunities|join|work with us/.test(`${pageTitle} ${pageText}`.toLowerCase())) continue
      return {
        ...classified,
        url,
        title: pageTitle || `${company.name} careers`,
        discoveredAt: new Date().toISOString(),
        discoveryMethod: 'common-career-path',
      }
    }
  }
  return null
}

const boardSlugFromUrl = (url, source, companyName) => {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (source === 'greenhouse') {
    return parsed.searchParams.get('board_token') || parts.find(part => !['embed', 'job_board'].includes(part)) || compactCompanyName(companyName)
  }
  if (source === 'lever') return parts[0] || compactCompanyName(companyName)
  if (source === 'ashby') return parts[parts.length - 1] || compactCompanyName(companyName)
  if (source === 'smartrecruiters') return parts[parts.length - 1] || compactCompanyName(companyName)
  if (source === 'workday') return parsed.hostname.split('.')[0]
  return parsed.hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '')
}

const discoverCompany = async (company) => {
  const deadline = Date.now() + companyTimeoutMs
  const direct = await discoverByDomainCrawl(company, deadline)
  if (direct) return direct
  if (!useSearchFallback) return null

  if (searchDelayMs > 0) await sleep(searchDelayMs)
  ensureWithinDeadline(deadline, company.name)
  const query = `${company.name} official careers jobs`
  const response = await fetchWithTimeout(
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {},
    Math.max(500, Math.min(timeoutMs, remainingDeadlineMs(deadline))),
  )
  if (!response.ok) throw new Error(`${company.name}: search ${response.status}`)
  const html = await response.text()
  const results = parseDuckDuckGoResults(html)
  if (!results.length && response.status === 202) {
    const error = new Error(`${company.name}: search returned anti-bot page`)
    error.transient = true
    throw error
  }
  for (const result of results.slice(0, 8)) {
    const classified = classifyUrl(result.url, company.name)
    if (!classified) continue
    return {
      ...classified,
      url: result.url,
      title: result.title,
      discoveredAt: new Date().toISOString(),
      discoveryMethod: 'search-result',
    }
  }
  return null
}

const runLimited = async (items, limit, worker) => {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
      } catch (error) {
        results[index] = { status: 'rejected', reason: error }
      }
    }
  })
  await Promise.all(workers)
  return results
}

const catalogData = JSON.parse(await readFile(catalogPath, 'utf-8'))
const companies = catalogData.companies || []
let discoveryLog = { generatedAt: null, results: [] }
try {
  discoveryLog = JSON.parse(await readFile(resultPath, 'utf-8'))
} catch {
  // First run.
}

const knownSources = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'microsoft', 'generic']
const candidates = companies
  .filter(company => !knownSources.includes(company.source) || company.discoveryFailed || company.source === null)
  .filter(company => forceDiscovery || !company.webDiscoveryAttemptedAt || Date.now() - Date.parse(company.webDiscoveryAttemptedAt) > retryAfterMs)
  .slice(0, batchSize)

console.log(`Web discovery: checking ${candidates.length}/${companies.length} catalog companies for official careers pages or real ATS portals.`)

let completed = 0
const reportProgress = () => {
  completed += 1
  process.stdout.write(`  ...searched ${completed}/${candidates.length}\r`)
}

const results = await runLimited(candidates, concurrency, async (company) => {
  let found
  try {
    found = await discoverCompany(company)
  } catch (error) {
    if (error?.transient) throw error
    company.webDiscoveryAttemptedAt = new Date().toISOString()
    throw error
  } finally {
    reportProgress()
  }
  company.webDiscoveryAttemptedAt = new Date().toISOString()
  if (found) {
    company.source = found.source
    company.boardSlugGuess = boardSlugFromUrl(found.url, found.source, company.name)
    company.discoveryFailed = false
    company.webDiscoveryFailed = false
    if (found.source === 'generic') {
      company.careersUrl = found.url
      delete company.workdayTenant
      delete company.workdaySubdomain
      delete company.genericAttemptedAt
    } else if (found.source !== 'workday') {
      delete company.careersUrl
      delete company.officialCareerUrl
      delete company.workdayTenant
      delete company.workdaySubdomain
    } else {
      company.careersUrl = found.url
      company.workdaySubdomain = new URL(found.url).hostname.split('.')[0]
    }
  } else {
    company.webDiscoveryFailed = true
  }
  return { company: company.name, found }
})
process.stdout.write('\n')

const successful = results.filter(item => item.status === 'fulfilled' && item.value?.found).map(item => item.value)
const failed = results.filter(item => item.status === 'rejected').map(item => item.reason?.message).filter(Boolean)

await writeFile(catalogPath, JSON.stringify({ ...catalogData, generatedAt: new Date().toISOString(), companies }, null, 2) + '\n')
await mkdir('src/data', { recursive: true })
await writeFile(resultPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  batchSize,
  successfulCount: successful.length,
  failedCount: failed.length,
  results: [...successful, ...(discoveryLog.results || [])].slice(0, 500),
  failures: failed.slice(0, 50),
}, null, 2) + '\n')

console.log(`✅ Web discovery configured ${successful.length} career sources.`)
if (failed.length) console.warn(`   ${failed.length} searches failed; they can retry next run.`)
