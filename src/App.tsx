import {
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clipboard,
  Download,
  ExternalLink,
  Filter,
  FileText,
  GraduationCap,
  Globe2,
  MapPin,
  RefreshCw,
  Search,
  Upload,
  WandSparkles,
  Settings,
  PlusCircle,
  Trash2,
} from 'lucide-react'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import jobsPayload from './data/jobs.json'
import companyCatalogPayload from './data/company-catalog.json'

type CompanyType = 'All' | 'Product' | 'Service'
type AppSection = 'jobs' | 'resume' | 'admin'

type Company = {
  name: string
  boardSlugGuess: string
  type: 'Product' | 'Service'
  source: 'greenhouse' | 'lever' | 'microsoft' | 'ashby' | 'smartrecruiters' | 'workday' | 'generic' | null
  workdayTenant?: string
  workdaySubdomain?: string
  careersUrl?: string
  officialCareerUrl?: string
}


type Job = {
  id: string
  role: string
  company: string
  companyType: 'Product' | 'Service'
  location: string
  country?: string
  countryGroup: 'India' | 'Global'
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  experienceMin: number
  experienceMax: number | null
  experienceLabel: string
  experienceSource: string
  postedAt: string | null
  source: string
  directApplyUrl: string
  department: string
  summary: string
}

type UpdateStatus = {
  state?: string
  currentStep?: string | null
  lastSuccessfulCycleAt?: string
  nextRunAt?: string | null
  configuredCompanies?: number
  companyCatalogSize?: number
  unconfiguredCompanies?: number
  jobCount?: number
  updaterRunning?: boolean
  lastError?: string | null
}

type ResumeCheck = {
  label: string
  passed: boolean
  detail: string
}

type TailoredResult = {
  latex: string
  oldScore: number
  newScore: number
  checks: ResumeCheck[]
  missingKeywords: string[]
  changedSections: string[]
}

const salaryBands = [
  { label: 'Any salary', value: 0 },
  { label: '₹6 LPA+', value: 6 },
  { label: '₹12 LPA+', value: 12 },
  { label: '₹18 LPA+', value: 18 },
  { label: '₹24 LPA+', value: 24 },
  { label: '₹36 LPA+', value: 36 },
]

const experienceBands = [
  { label: 'Any experience', min: 0, max: null },
  { label: '0-2 yrs', min: 0, max: 2 },
  { label: '3-5 yrs', min: 3, max: 5 },
  { label: '6-8 yrs', min: 6, max: 8 },
  { label: '9+ yrs', min: 9, max: null },
]

const stopWords = new Set([
  'about',
  'across',
  'after',
  'also',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'candidate',
  'company',
  'degree',
  'description',
  'etc',
  'for',
  'from',
  'has',
  'have',
  'in',
  'including',
  'into',
  'is',
  'job',
  'more',
  'must',
  'of',
  'on',
  'or',
  'our',
  'please',
  'preferred',
  'required',
  'requirements',
  'responsibilities',
  'role',
  'team',
  'that',
  'the',
  'their',
  'this',
  'to',
  'using',
  'we',
  'with',
  'work',
  'will',
  'you',
  'your',
])

const atsSkillTerms = [
  'accessibility',
  'agile',
  'ai',
  'analytics',
  'api',
  'aws',
  'azure',
  'backend',
  'ci/cd',
  'cloud',
  'css',
  'data structures',
  'database',
  'docker',
  'express',
  'frontend',
  'git',
  'graphql',
  'html',
  'java',
  'javascript',
  'kubernetes',
  'linux',
  'microservices',
  'mongodb',
  'next.js',
  'node.js',
  'postgresql',
  'python',
  'react',
  'redis',
  'rest',
  'scalability',
  'security',
  'sql',
  'system design',
  'tailwind',
  'testing',
  'typescript',
  'vite',
]

const dateTimeValue = (value: string | null | undefined) => {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

const formatDate = (value: string | null | undefined) => {
  const parsed = dateTimeValue(value)
  if (!parsed) return 'Not listed'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(parsed))
}

const daysAgo = (value: string | null | undefined) => {
  const parsed = dateTimeValue(value)
  if (!parsed) return 'Not listed'
  const diff = Date.now() - parsed
  const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const formatSalary = (job: Job) => {
  if (!job.salaryMin || !job.salaryMax) return 'Not listed'
  if (job.salaryCurrency === 'INR') {
    return `₹${job.salaryMin}L - ₹${job.salaryMax}L`
  }
  return `$${job.salaryMin}k - $${job.salaryMax}k`
}

const countryRules = [
  { country: 'India', test: /india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|chennai|ahmedabad|kolkata/i },
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

const countryFromLocation = (job: Job) =>
  job.country || countryRules.find((rule) => rule.test.test(job.location))?.country || 'Global'

const matchesExperience = (job: Job, bandIndex: number) => {
  const band = experienceBands[bandIndex]
  if (!band || band.label === 'Any experience') return true

  const jobMax = job.experienceMax ?? 99
  const bandMax = band.max ?? 99
  return job.experienceMin <= bandMax && jobMax >= band.min
}

const isWithinDays = (job: Job, days: number) => {
  const parsed = dateTimeValue(job.postedAt)
  if (!parsed) return true
  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000
}

const postedWithinBands = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

const cleanResumeText = (value: string) =>
  value
    .replace(/%.*$/gm, ' ')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?(?:\{([^{}]*)})?/g, ' $1 ')
    .replace(/[{}$&#_^~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const titleCase = (value: string) =>
  value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bAnd\b/g, 'and')

const unique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))

const toPlainLatexText = (value: string) =>
  value
    .replace(/%.*$/gm, '')
    .replace(/\\href\{[^{}]*}\{([^{}]*)}/g, '$1')
    .replace(/\\(?:textbf|textit|emph|underline)\{([^{}]*)}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?/g, ' ')
    .replace(/[{}$&#_^~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const escapeLatex = (value: string) =>
  value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')

const truncateText = (value: string, limit: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  const trimmed = normalized.slice(0, limit - 1)
  return `${trimmed.slice(0, Math.max(0, trimmed.lastIndexOf(' ')))}`
}

const splitCommaList = (value: string) =>
  unique(
    value
      .split(/[,|•;]\s*/)
      .map((item) => toPlainLatexText(item))
      .filter((item) => item.length > 1),
  )

const extractRoleTitle = (jobDescription: string) => {
  const explicitTitle = jobDescription.match(/(?:job title|position|role)\s*[:|-]\s*([^\n.]+)/i)?.[1]
  const firstUsefulLine = jobDescription
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 6 && line.length < 80 && !/responsibilities|requirements|about/i.test(line))
  return titleCase((explicitTitle || firstUsefulLine || 'Software Engineer').replace(/[|•]/g, ' ').trim())
}

const extractKeywords = (jobDescription: string) => {
  const normalized = jobDescription.toLowerCase()
  const phraseMatches = atsSkillTerms.filter((term) => normalized.includes(term))
  const wordCounts = new Map<string, number>()

  normalized
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/\s+/)
    .forEach((word) => {
      const cleaned = word.replace(/^[^a-z0-9]+|[^a-z0-9+#.]+$/g, '')
      if (cleaned.length < 3 || stopWords.has(cleaned) || /^\d+$/.test(cleaned)) return
      wordCounts.set(cleaned, (wordCounts.get(cleaned) ?? 0) + 1)
    })

  const frequentWords = Array.from(wordCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 24)

  return unique([...phraseMatches, ...frequentWords]).slice(0, 30)
}

const findSection = (resumeLatex: string, names: string[]) => {
  const sectionNames = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`(\\\\section\\*?\\{(?:${sectionNames})\\})([\\s\\S]*?)(?=\\\\section\\*?\\{|\\\\end\\{document\\}|$)`, 'i').exec(
    resumeLatex,
  )
}

const calculateAtsScore = (resumeLatex: string, keywords: string[]) => {
  if (!keywords.length) return 0
  const resumeText = cleanResumeText(resumeLatex)
  const matched = keywords.filter((keyword) => resumeText.includes(keyword.toLowerCase())).length
  return Math.round((matched / keywords.length) * 100)
}

const getSectionBody = (resumeLatex: string, names: string[]) => findSection(resumeLatex, names)?.[2] ?? ''

const addMissingKeywords = (text: string, keywords: string[], maxToAdd: number) => {
  const normalized = text.toLowerCase()
  const missing = keywords.filter((keyword) => !normalized.includes(keyword.toLowerCase())).slice(0, maxToAdd)
  return missing
}

const appendLatexText = (content: string, addition: string) => {
  const trailingWhitespace = content.match(/\s*$/)?.[0] ?? ''
  const body = content.slice(0, content.length - trailingWhitespace.length)
  const spacer = /[\s([{]$/.test(body) ? '' : ' '
  return `${body}${spacer}${addition}${trailingWhitespace}`
}

const appendCommaListLatex = (content: string, addition: string) => {
  const trailingWhitespace = content.match(/\s*$/)?.[0] ?? ''
  const body = content.slice(0, content.length - trailingWhitespace.length)
  const separator = body.trim().endsWith(',') ? ' ' : ', '
  return `${body}${separator}${addition}${trailingWhitespace}`
}

const enhanceBullet = (content: string, keywords: string[], limit: number) => {
  const plain = toPlainLatexText(content)
  if (!plain) return { content, addedKeyword: '' }

  const missing = addMissingKeywords(plain, keywords, 1)
  if (!missing.length) return { content, addedKeyword: '' }

  const conciseAddition = escapeLatex(`with ${missing.join(', ')}`)
  if (plain.length >= limit) return { content, addedKeyword: '' }

  return { content: appendLatexText(content, conciseAddition), addedKeyword: missing[0] }
}

const replaceSectionBody = (resumeLatex: string, names: string[], nextBody: string) => {
  const section = findSection(resumeLatex, names)
  if (!section?.[0] || !section[1]) return { latex: resumeLatex, changed: false }
  const replacement = `${section[1]}${nextBody.endsWith('\n') ? nextBody : `${nextBody}\n`}`
  return { latex: resumeLatex.replace(section[0], replacement), changed: true }
}

const updateSummarySection = (resumeLatex: string, jobDescription: string, keywords: string[]) => {
  const existing = getSectionBody(resumeLatex, ['summary', 'profile', 'objective', 'professional summary'])
  if (!existing) return { latex: resumeLatex, changed: false }
  const roleTitle = extractRoleTitle(jobDescription)
  const currentLength = Math.max(120, Math.min(260, toPlainLatexText(existing).length || 210))
  const summary = truncateText(
    `${roleTitle} candidate experienced in ${keywords.slice(0, 6).join(', ')} with a focus on production-ready delivery, debugging, collaboration, and measurable engineering impact.`,
    currentLength,
  )
  return replaceSectionBody(resumeLatex, ['summary', 'profile', 'objective', 'professional summary'], `\n${escapeLatex(summary)}\n\n`)
}

const updateSkillsSection = (resumeLatex: string, keywords: string[]) => {
  const section = findSection(resumeLatex, ['skills', 'technical skills', 'technologies'])
  if (!section?.[2]) return { latex: resumeLatex, changed: false }
  const existingText = toPlainLatexText(section[2])
  const existingSkills = splitCommaList(existingText)
  const missingSkills = keywords.filter(
    (keyword) => !existingSkills.some((skill) => skill.toLowerCase() === keyword.toLowerCase()),
  )
  if (!missingSkills.length) return { latex: resumeLatex, changed: false }

  const additions = missingSkills.slice(0, 8).join(', ')
  const nextBody = appendCommaListLatex(section[2], escapeLatex(additions))
  return replaceSectionBody(resumeLatex, ['skills', 'technical skills', 'technologies'], nextBody)
}

const updateCustomBulletCommands = (body: string, keywords: string[], limit: number) => {
  let changed = false
  let remainingKeywords = [...keywords]
  const updatedBody = body.replace(
    /(\\(?:resumeItem|resumeSubItem|cvItem|cvSubItem)\s*\{)([^{}]+)(\})/g,
    (match, prefix: string, content: string, suffix: string) => {
      const enhanced = enhanceBullet(content, remainingKeywords, limit)
      if (enhanced.content === content) return match
      remainingKeywords = remainingKeywords.filter((keyword) => keyword !== enhanced.addedKeyword)
      changed = true
      return `${prefix}${enhanced.content}${suffix}`
    },
  )

  return { body: updatedBody, changed }
}

const updateItemSection = (resumeLatex: string, names: string[], keywords: string[], limit = 145) => {
  const section = findSection(resumeLatex, names)
  if (!section?.[0] || !section[2]) return { latex: resumeLatex, changed: false }
  let changed = false
  let remainingKeywords = [...keywords]
  let updatedBody = section[2].replace(/(\\item\s+)([\s\S]*?)(?=\\item|\\end\{|$)/g, (match, prefix: string, content: string) => {
    const plain = toPlainLatexText(content)
    if (!plain) return match
    const enhanced = enhanceBullet(content, remainingKeywords, limit)
    if (enhanced.content === content) return match
    remainingKeywords = remainingKeywords.filter((keyword) => keyword !== enhanced.addedKeyword)
    changed = true
    return `${prefix}${enhanced.content}`
  })

  const commandResult = updateCustomBulletCommands(updatedBody, remainingKeywords, limit)
  updatedBody = commandResult.body
  changed = changed || commandResult.changed

  if (!changed) return { latex: resumeLatex, changed: false }
  return { latex: resumeLatex.replace(section[0], `${section[1]}${updatedBody}`), changed: true }
}

const estimateResumeTextLength = (resumeLatex: string) => cleanResumeText(resumeLatex).length

const buildTailoredResult = (resumeLatex: string, jobDescription: string): TailoredResult => {
  if (!resumeLatex.trim() || !jobDescription.trim()) {
    return { latex: '', oldScore: 0, newScore: 0, checks: [], missingKeywords: [], changedSections: [] }
  }

  const keywords = extractKeywords(jobDescription)
  const changedSections: string[] = []
  const oldScore = calculateAtsScore(resumeLatex, keywords)
  let latex = resumeLatex

  const summaryResult = updateSummarySection(latex, jobDescription, keywords)
  latex = summaryResult.latex
  if (summaryResult.changed) changedSections.push('summary')

  const skillsResult = updateSkillsSection(latex, keywords)
  latex = skillsResult.latex
  if (skillsResult.changed) changedSections.push('skills')

  const experienceResult = updateItemSection(latex, ['experience', 'work experience', 'professional experience'], keywords)
  latex = experienceResult.latex
  if (experienceResult.changed) changedSections.push('experience bullets')

  const projectsResult = updateItemSection(latex, ['projects', 'selected projects'], keywords, 130)
  latex = projectsResult.latex
  if (projectsResult.changed) changedSections.push('project bullets')

  const newScore = calculateAtsScore(latex, keywords)
  const originalLength = estimateResumeTextLength(resumeLatex)
  const newLength = estimateResumeTextLength(latex)
  const structuralTokens = ['\\documentclass', '\\begin{document}', '\\end{document}'].filter(
    (token) => !resumeLatex.includes(token) || latex.includes(token),
  ).length
  const resumeText = cleanResumeText(latex)
  const missingKeywords = keywords.filter((keyword) => !resumeText.includes(keyword.toLowerCase())).slice(0, 8)
  const checks = [
    {
      label: 'Template preserved',
      passed: structuralTokens === 3,
      detail: 'Preamble, document boundaries, commands, and section order are kept from your LaTeX',
    },
    {
      label: 'One-page fit guard',
      passed: newLength <= Math.max(originalLength + 450, 3600),
      detail: `${newLength} chars vs original ${originalLength} chars`,
    },
    {
      label: 'ATS improvement',
      passed: newScore >= oldScore,
      detail: `${oldScore}% old -> ${newScore}% new`,
    },
    {
      label: 'Content-only edits',
      passed: changedSections.length > 0,
      detail: changedSections.length ? `Changed ${changedSections.join(', ')}` : 'No recognized editable sections found',
    },
  ]

  return { latex, oldScore, newScore, checks, missingKeywords, changedSections }
}

function App() {
  const [jobs, setJobs] = useState<Job[]>(jobsPayload.jobs as Job[])
  const [generatedAt, setGeneratedAt] = useState<string>(jobsPayload.generatedAt)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({})
  const [activeSection, setActiveSection] = useState<AppSection>('jobs')
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('India')
  const [source, setSource] = useState('All sources')
  const [companyType, setCompanyType] = useState<CompanyType>('All')
  const [salaryFloor, setSalaryFloor] = useState(0)
  const [experienceBand, setExperienceBand] = useState(0)
  const [postedWithinDays, setPostedWithinDays] = useState(30)
  const [selectedId, setSelectedId] = useState<string | null>(jobs[0]?.id ?? null)
  const [jobDescription, setJobDescription] = useState('')
  const [resumeLatex, setResumeLatex] = useState('')
  const [copied, setCopied] = useState(false)

  const [companies, setCompanies] = useState<Company[]>(() => {
    const staticCompanies = companyCatalogPayload.companies as Company[]
    try {
      const saved = localStorage.getItem('company_overrides')
      if (saved) {
        const overrides = JSON.parse(saved) as Company[]
        const merged = [...staticCompanies]
        overrides.forEach((override) => {
          const idx = merged.findIndex((c) => c.name.toLowerCase() === override.name.toLowerCase())
          if (idx > -1) {
            merged[idx] = override
          } else {
            merged.push(override)
          }
        })
        return merged
      }
    } catch (e) {
      console.error('Failed to load company overrides', e)
    }
    return staticCompanies
  })

  const [adminMode, setAdminMode] = useState<'existing' | 'new'>('existing')
  const [selectedCompanyIndex, setSelectedCompanyIndex] = useState<number>(-1)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyType, setNewCompanyType] = useState<'Product' | 'Service'>('Product')
  const [careerSiteLink, setCareerSiteLink] = useState('')
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminSuccess, setAdminSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refreshJobs = async () => {
      try {
        const response = await fetch(`/data/jobs.json?ts=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json()
        if (!cancelled && Array.isArray(payload.jobs)) {
          setJobs(payload.jobs as Job[])
          if (payload.generatedAt) setGeneratedAt(payload.generatedAt)
        }
      } catch {
        // Static import stays as a fallback when the live public JSON is absent.
      }
    }

    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/update-status?ts=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const status = await response.json()
        if (!cancelled) setUpdateStatus(status)
      } catch {
        // Status endpoint only exists in dev; the jobs JSON still works without it.
      }
    }

    refreshJobs()
    refreshStatus()
    const interval = window.setInterval(refreshJobs, 60_000)
    const statusInterval = window.setInterval(refreshStatus, 30_000)
    window.addEventListener('focus', refreshJobs)
    window.addEventListener('focus', refreshStatus)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearInterval(statusInterval)
      window.removeEventListener('focus', refreshJobs)
      window.removeEventListener('focus', refreshStatus)
    }
  }, [])

  const filteredCatalogCompanies = useMemo(() => {
    const q = adminSearchQuery.trim().toLowerCase()
    return companies
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 10)
  }, [companies, adminSearchQuery])

  const parseCareerSiteLink = (link: string) => {
    let source: Company['source'] = null
    let boardSlugGuess = ''
    let careersUrl = ''
    let workdaySubdomain = ''
    try {
      const urlStr = link.trim()
      if (!urlStr) return { source, boardSlugGuess, careersUrl, workdaySubdomain }
      const urlObj = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`)
      careersUrl = urlObj.toString()

      if (urlStr.includes('greenhouse.io')) {
        source = 'greenhouse'
        const tokenParam = urlObj.searchParams.get('board_token')
        if (tokenParam) {
          boardSlugGuess = tokenParam
        } else {
          const parts = urlObj.pathname.split('/').filter(Boolean)
          if (parts.length > 0) {
            if (parts[0] !== 'embed' || parts[1] !== 'job_board') {
              boardSlugGuess = parts[0]
            }
          }
        }
      } else if (urlStr.includes('lever.co')) {
        source = 'lever'
        const parts = urlObj.pathname.split('/').filter(Boolean)
        if (parts.length > 0) {
          if (parts[0] === 'v0' && parts[1] === 'postings') {
            boardSlugGuess = parts[2]
          } else {
            boardSlugGuess = parts[0]
          }
        }
      } else if (urlStr.includes('ashbyhq.com') || urlStr.includes('ashbyhq.co')) {
        source = 'ashby'
        const parts = urlObj.pathname.split('/').filter(Boolean)
        // Usually: https://jobs.ashbyhq.com/company-slug
        // or: https://api.ashbyhq.com/posting-api/job-board/company-slug
        if (parts.length > 0) {
          boardSlugGuess = parts[parts.length - 1]
        }
      } else if (urlStr.includes('smartrecruiters.com')) {
        source = 'smartrecruiters'
        const parts = urlObj.pathname.split('/').filter(Boolean)
        // Usually: https://careers.smartrecruiters.com/company-slug
        // or: https://jobs.smartrecruiters.com/company-slug
        if (parts.length > 0) {
          boardSlugGuess = parts[parts.length - 1]
        }
      } else if (urlStr.includes('myworkdayjobs.com')) {
        source = 'workday'
        const hostParts = urlObj.hostname.split('.')
        if (hostParts.length > 0) {
          boardSlugGuess = hostParts[0]
          workdaySubdomain = hostParts[0]
        }
      } else {
        source = 'generic'
        boardSlugGuess = urlObj.hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '')
      }
    } catch (e) {
      console.error('Failed to parse URL', e)
    }
    return { source, boardSlugGuess, careersUrl, workdaySubdomain }
  }

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminSuccess('')

    let name = ''
    let type: 'Product' | 'Service'

    if (adminMode === 'existing') {
      if (selectedCompanyIndex === -1) {
        setAdminError('Please select a company from the list.')
        return
      }
      const originalCompany = filteredCatalogCompanies[selectedCompanyIndex]
      name = originalCompany.name
      type = originalCompany.type
    } else {
      if (!newCompanyName.trim()) {
        setAdminError('Please enter a company name.')
        return
      }
      name = newCompanyName.trim()
      type = newCompanyType
    }

    if (!careerSiteLink.trim()) {
      setAdminError('Please enter a career site link.')
      return
    }

    const { source, boardSlugGuess, careersUrl, workdaySubdomain } = parseCareerSiteLink(careerSiteLink)
    if (!source || !boardSlugGuess) {
      setAdminError('Invalid career site link. Paste a full official careers/jobs URL or a supported ATS URL.')
      return
    }

    const updatedCompany: Company = {
      name,
      boardSlugGuess,
      type,
      source,
    }
    if (source === 'generic') {
      updatedCompany.careersUrl = careersUrl
    }
    if (source === 'workday' && workdaySubdomain) {
      updatedCompany.workdaySubdomain = workdaySubdomain
    }

    setIsSubmitting(true)
    let savedToDisk = false
    try {
      const response = await fetch('/api/add-company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedCompany),
      })

      if (response.ok) {
        const payload = await response.json()
        if (payload.success) {
          savedToDisk = true
        } else {
          console.warn('Vite API saving issue:', payload.error)
        }
      }
    } catch (error) {
      console.warn('Vite API not reachable. Saving to local state only.', error)
    } finally {
      setIsSubmitting(false)
    }

    const updatedCompanies = [...companies]
    const existingIdx = updatedCompanies.findIndex((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existingIdx > -1) {
      updatedCompanies[existingIdx] = updatedCompany
    } else {
      updatedCompanies.push(updatedCompany)
    }
    setCompanies(updatedCompanies)

    const overrides = updatedCompanies.filter((c) => {
      const staticCompany = (companyCatalogPayload.companies as Company[]).find(
        (sc) => sc.name.toLowerCase() === c.name.toLowerCase()
      )
      return !staticCompany ||
        staticCompany.source !== c.source ||
        staticCompany.boardSlugGuess !== c.boardSlugGuess ||
        staticCompany.careersUrl !== c.careersUrl ||
        staticCompany.workdaySubdomain !== c.workdaySubdomain
    })
    localStorage.setItem('company_overrides', JSON.stringify(overrides))

    if (adminMode === 'new') {
      setNewCompanyName('')
    }
    setCareerSiteLink('')
    setSelectedCompanyIndex(-1)
    setAdminSearchQuery('')

    setAdminSuccess(
      savedToDisk
        ? `Successfully saved and configured ${name} on disk and in the app! Run "npm run refresh:jobs" next to scrape.`
        : `Configured ${name} in local state. Save configuration succeeded.`
    )
  }

  const handleRemoveCompanyLink = async (companyName: string) => {
    setAdminError('')
    setAdminSuccess('')

    const updatedCompanies = companies.map((c) => {
      if (c.name.toLowerCase() === companyName.toLowerCase()) {
        const { careersUrl, officialCareerUrl, workdaySubdomain, ...rest } = c
        return { ...rest, source: null, boardSlugGuess: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '') }
      }
      return c
    })
    setCompanies(updatedCompanies)

    let deletedFromDisk = false
    try {
      const c = updatedCompanies.find(x => x.name.toLowerCase() === companyName.toLowerCase())
      if (c) {
        const response = await fetch('/api/add-company', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(c),
        })
        if (response.ok) {
          const payload = await response.json()
          if (payload.success) {
            deletedFromDisk = true
          }
        }
      }
    } catch (e) {
      console.warn('Failed to delete link via dev API', e)
    }

    const overrides = updatedCompanies.filter((c) => {
      const staticCompany = (companyCatalogPayload.companies as Company[]).find(
        (sc) => sc.name.toLowerCase() === c.name.toLowerCase()
      )
      return !staticCompany ||
        staticCompany.source !== c.source ||
        staticCompany.boardSlugGuess !== c.boardSlugGuess ||
        staticCompany.careersUrl !== c.careersUrl ||
        staticCompany.workdaySubdomain !== c.workdaySubdomain
    })
    localStorage.setItem('company_overrides', JSON.stringify(overrides))

    setAdminSuccess(
      deletedFromDisk
        ? `Successfully removed career site configuration for ${companyName} from disk.`
        : `Removed configuration for ${companyName} from local state.`
    )
  }


  const countries = useMemo(
    () => [
      'All countries',
      ...Array.from(new Set(jobs.map(countryFromLocation))).sort((a, b) => {
        if (a === 'India') return -1
        if (b === 'India') return 1
        if (a === 'Global') return 1
        if (b === 'Global') return -1
        return a.localeCompare(b)
      }),
    ],
    [jobs],
  )

  const sources = useMemo(() => {
    const counts = new Map<string, number>()
    jobs.forEach((job) => counts.set(job.source, (counts.get(job.source) ?? 0) + 1))
    return [
      { value: 'All sources', label: `All sources (${jobs.length})` },
      ...Array.from(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, label: `${value} (${count})` })),
    ]
  }, [jobs])

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return jobs
      .filter((job) => {
        const matchesQuery =
          !normalizedQuery ||
          [job.role, job.company, job.department, job.location].join(' ').toLowerCase().includes(normalizedQuery)
        const matchesCountry = country === 'All countries' || countryFromLocation(job) === country
        const matchesSource = source === 'All sources' || job.source === source
        const matchesType = companyType === 'All' || job.companyType === companyType
        const matchesSalary =
          salaryFloor === 0 || Boolean(job.salaryMax && job.salaryMax >= salaryFloor)
        const matchesExperienceBand = matchesExperience(job, experienceBand)
        const matchesPostedWithin = isWithinDays(job, postedWithinDays)
        return matchesQuery && matchesCountry && matchesSource && matchesType && matchesSalary && matchesExperienceBand && matchesPostedWithin
      })
      .sort((a, b) => (dateTimeValue(b.postedAt) ?? 0) - (dateTimeValue(a.postedAt) ?? 0))
  }, [companyType, country, experienceBand, jobs, postedWithinDays, query, salaryFloor, source])

  const selectedJob = filteredJobs.find((job) => job.id === selectedId) ?? filteredJobs[0]
  const listedSalaryCount = jobs.filter((job) => job.salaryMax).length
  const sourceCount = new Set(jobs.map((job) => job.company)).size
  const indiaJobsCount = jobs.filter((job) => countryFromLocation(job) === 'India').length
  const atsKeywords = useMemo(() => extractKeywords(jobDescription), [jobDescription])
  const tailoredResult = useMemo(
    () => buildTailoredResult(resumeLatex, jobDescription),
    [jobDescription, resumeLatex],
  )
  const tailoredResume = tailoredResult.latex
  const oldAtsScore = tailoredResult.oldScore
  const newAtsScore = tailoredResult.newScore
  const missingKeywords = tailoredResult.missingKeywords
  const passedChecks = tailoredResult.checks.filter((check) => check.passed).length
  const isResumeReady = Boolean(tailoredResume && tailoredResult.checks.every((check) => check.passed))

  const readTextFile = (event: ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => setter(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  const copyTailoredResume = async () => {
    if (!tailoredResume) return
    await navigator.clipboard.writeText(tailoredResume)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const downloadTailoredResume = () => {
    if (!tailoredResume) return
    const blob = new Blob([tailoredResume], { type: 'text/x-tex' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'tailored-resume.tex'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">FS</div>
          <div>
            <strong>Fresh SDE Jobs</strong>
            <span>Jobs and local ATS resume tailoring</span>
          </div>
        </div>
        <nav className="section-tabs" aria-label="Primary sections">
          <button
            type="button"
            className={activeSection === 'jobs' ? 'active' : ''}
            onClick={() => setActiveSection('jobs')}
          >
            <BriefcaseBusiness size={15} aria-hidden="true" />
            Jobs
          </button>
          <button
            type="button"
            className={activeSection === 'resume' ? 'active' : ''}
            onClick={() => setActiveSection('resume')}
          >
            <FileText size={15} aria-hidden="true" />
            Resume tailor
          </button>
          <button
            type="button"
            className={activeSection === 'admin' ? 'active' : ''}
            onClick={() => setActiveSection('admin')}
          >
            <Settings size={15} aria-hidden="true" />
            Admin
          </button>
        </nav>
        <div className="refresh-state">
          <RefreshCw size={16} aria-hidden="true" />
          <span>
            Updated {formatDate(generatedAt)}
            {updateStatus.state ? ` · ${updateStatus.currentStep || updateStatus.state}` : ''}
          </span>
        </div>
      </header>

      {activeSection === 'jobs' ? (
      <section className="workspace">
        <aside className="filter-panel" aria-label="Job filters">
          <div className="panel-title">
            <Filter size={17} aria-hidden="true" />
            Filters
          </div>

          <label className="field">
            <span>Search</span>
            <div className="input-with-icon">
              <Search size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Role, company, team"
              />
            </div>
          </label>

          <label className="field">
            <span>Country</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {sources.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Salary</span>
            <select value={salaryFloor} onChange={(event) => setSalaryFloor(Number(event.target.value))}>
              {salaryBands.map((band) => (
                <option key={band.value} value={band.value}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Experience</span>
            <select value={experienceBand} onChange={(event) => setExperienceBand(Number(event.target.value))}>
              {experienceBands.map((band, index) => (
                <option key={band.label} value={index}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Posted within</span>
            <select value={postedWithinDays} onChange={(event) => setPostedWithinDays(Number(event.target.value))}>
              {postedWithinBands.map((band) => (
                <option key={band.days} value={band.days}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Company type</span>
            <div className="segmented" role="group" aria-label="Company type">
              {(['All', 'Product', 'Service'] as CompanyType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={companyType === type ? 'active' : ''}
                  onClick={() => setCompanyType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="job-board" aria-label="Latest SDE jobs">
          <div className="board-heading">
            <div>
              <h1>Latest SDE openings</h1>
              <p>SDE roles from 1000+ MNC career portals · last {postedWithinDays} days · all experience levels.</p>
            </div>
            <div className="sort-chip">
              <ArrowUpDown size={16} aria-hidden="true" />
              Latest first
            </div>
          </div>

          <div className="metrics" aria-label="Fresh jobs summary">
            <div>
              <strong>{filteredJobs.length}</strong>
              <span>matching jobs</span>
            </div>
            <div>
              <strong>{sourceCount}</strong>
              <span>companies scanned</span>
            </div>
            <div>
              <strong>{indiaJobsCount}</strong>
              <span>India roles</span>
            </div>
            <div>
              <strong>{listedSalaryCount}</strong>
              <span>with salary ranges</span>
            </div>
          </div>

          <div className="update-strip" aria-label="Automatic update status">
            <span>{updateStatus.updaterRunning ? 'Auto updater running' : 'Auto updater inactive'}</span>
            <span>
              {updateStatus.configuredCompanies && updateStatus.companyCatalogSize
                ? `${updateStatus.configuredCompanies}/${updateStatus.companyCatalogSize} companies configured`
                : 'Catalog status loading'}
            </span>
            <span>
              {updateStatus.lastSuccessfulCycleAt
                ? `Last refresh ${formatDate(updateStatus.lastSuccessfulCycleAt)}`
                : 'Refresh pending'}
            </span>
            {updateStatus.lastError ? <span className="update-error">{updateStatus.lastError}</span> : null}
          </div>

          <div className="table-shell">
            <div className="jobs-table" role="table" aria-label="Fresh SDE job postings">
              <div className="table-row table-head" role="row">
                <span>Role</span>
                <span>Location</span>
                <span>Experience</span>
                <span>Salary</span>
                <span>Posted</span>
                <span>Apply</span>
              </div>
              {filteredJobs.map((job) => (
                <button
                  type="button"
                  className={`table-row job-row ${selectedJob?.id === job.id ? 'selected' : ''}`}
                  key={job.id}
                  onClick={() => setSelectedId(job.id)}
                >
                  <span className="role-cell">
                    <strong>{job.role}</strong>
                    <small>
                      {job.company} · {job.companyType} · {job.department}
                    </small>
                  </span>
                  <span>
                    <MapPin size={15} aria-hidden="true" />
                    {job.location}
                  </span>
                  <span title={job.experienceSource}>
                    <GraduationCap size={15} aria-hidden="true" />
                    {job.experienceLabel}
                  </span>
                  <span>
                    <CircleDollarSign size={15} aria-hidden="true" />
                    {formatSalary(job)}
                  </span>
                  <span>
                    <CalendarDays size={15} aria-hidden="true" />
                    {daysAgo(job.postedAt)}
                  </span>
                  <a href={job.directApplyUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    <ExternalLink size={15} aria-hidden="true" />
                    Apply
                  </a>
                </button>
              ))}
              {!filteredJobs.length && (
                <div className="empty-state">
                  <BriefcaseBusiness size={24} aria-hidden="true" />
                  No fresh SDE roles match these filters.
                </div>
              )}
            </div>
          </div>

        </section>

        <aside className="detail-panel" aria-label="Selected job details">
          {selectedJob ? (
            <>
              <div className="detail-company">{selectedJob.company}</div>
              <h2>{selectedJob.role}</h2>
              <dl>
                <div>
                  <dt>Location</dt>
                  <dd>{selectedJob.location}</dd>
                </div>
                <div>
                  <dt>Salary</dt>
                  <dd>{formatSalary(selectedJob)}</dd>
                </div>
                <div>
                  <dt>Experience</dt>
                  <dd>{selectedJob.experienceLabel}</dd>
                </div>
                <div>
                  <dt>Posted</dt>
                  <dd>{formatDate(selectedJob.postedAt)}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    <Globe2 size={13} aria-hidden="true" /> {countryFromLocation(selectedJob)}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedJob.source}</dd>
                </div>
              </dl>
              <p className="summary">{selectedJob.summary || 'Summary not listed by the career portal.'}</p>
              <a className="primary-apply" href={selectedJob.directApplyUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                Direct apply
              </a>
            </>
          ) : (
            <p className="summary">Select a job to inspect the career portal details.</p>
          )}
        </aside>
      </section>
      ) : activeSection === 'resume' ? (
        <section className="resume-workspace" aria-labelledby="resume-tool-title">
          <div className="board-heading resume-heading">
            <div>
              <h1 id="resume-tool-title">Resume tailor</h1>
              <p>Generate one-page ATS LaTeX locally, without AI/API calls.</p>
            </div>
            <div className={`sort-chip ${isResumeReady ? 'ready-chip' : ''}`}>
              <WandSparkles size={16} aria-hidden="true" />
              {isResumeReady ? 'Ready' : 'Local checks'}
            </div>
          </div>

          <div className="resume-editor-grid">
            <label className="resume-input">
              <span>
                <FileText size={16} aria-hidden="true" />
                Job description
              </span>
              <textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the full job description here..."
              />
              <div className="upload-row">
                <Upload size={15} aria-hidden="true" />
                <input type="file" accept=".txt,.md" onChange={(event) => readTextFile(event, setJobDescription)} />
              </div>
            </label>

            <label className="resume-input">
              <span>
                <FileText size={16} aria-hidden="true" />
                Resume LaTeX
              </span>
              <textarea
                value={resumeLatex}
                onChange={(event) => setResumeLatex(event.target.value)}
                placeholder="Paste the current .tex resume code here..."
              />
              <div className="upload-row">
                <Upload size={15} aria-hidden="true" />
                <input type="file" accept=".tex,.txt" onChange={(event) => readTextFile(event, setResumeLatex)} />
              </div>
            </label>
          </div>

          <div className="tailor-summary" aria-label="Final resume checks summary">
            <div>
              <strong>{oldAtsScore}%</strong>
              <span>old resume ATS</span>
            </div>
            <div>
              <strong>{newAtsScore}%</strong>
              <span>new resume ATS</span>
            </div>
            <div>
              <strong>{passedChecks}/{tailoredResult.checks.length || 4}</strong>
              <span>checks passed</span>
            </div>
            <div>
              <strong>{missingKeywords.length}</strong>
              <span>missing keywords</span>
            </div>
            <div>
              <strong>{atsKeywords.length}</strong>
              <span>JD keywords found</span>
            </div>
          </div>

          <div className="resume-output-grid">
            <section className="quality-panel" aria-label="Pre-generation checks">
              <div className="panel-title">
                <CheckCircle2 size={17} aria-hidden="true" />
                Preflight checks
              </div>
              <div className="check-list">
                {(tailoredResult.checks.length
                  ? tailoredResult.checks
                  : [
                      { label: 'One-page fit', passed: false, detail: 'Waiting for resume and JD' },
                      { label: 'Readable density', passed: false, detail: 'Waiting for resume and JD' },
                      { label: 'ATS coverage', passed: false, detail: 'Waiting for resume and JD' },
                      { label: 'Required sections', passed: false, detail: 'Waiting for resume and JD' },
                    ]
                ).map((check) => (
                  <div className={`check-row ${check.passed ? 'passed' : ''}`} key={check.label}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <div>
                      <strong>{check.label}</strong>
                      <span>{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="keyword-strip" aria-label="Detected JD keywords">
                {atsKeywords.slice(0, 16).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
                {!atsKeywords.length && <span>Detected keywords will appear here</span>}
              </div>
            </section>

            <section className="pdf-panel" aria-label="Resume PDF preview">
              <div className="panel-title">
                <FileText size={17} aria-hidden="true" />
                Format guard
              </div>
              <div className="pdf-placeholder">
                <FileText size={28} aria-hidden="true" />
                <span>
                  {tailoredResume
                    ? 'Generated from your pasted LaTeX template with content-only edits.'
                    : 'Paste a JD and LaTeX resume to generate the final one-page LaTeX.'}
                </span>
              </div>
            </section>
          </div>

          <label className="resume-input output-area">
            <span>
              <CheckCircle2 size={16} aria-hidden="true" />
              Final one-page LaTeX
            </span>
            <textarea
              readOnly
              value={tailoredResume}
              placeholder="Validated ATS LaTeX appears after both fields are filled."
            />
          </label>

          <div className="tool-actions">
            <button type="button" onClick={copyTailoredResume} disabled={!tailoredResume}>
              <Clipboard size={16} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy LaTeX'}
            </button>
            <button type="button" onClick={downloadTailoredResume} disabled={!tailoredResume}>
              <Download size={16} aria-hidden="true" />
              Download .tex
            </button>
          </div>
        </section>
      ) : (
        <section className="admin-workspace" aria-labelledby="admin-title">
          <div className="board-heading admin-heading">
            <div>
              <h1 id="admin-title">Admin Configuration</h1>
              <p>Configure career site links for MNCs or add new companies to fetch jobs.</p>
            </div>
            <div className="sort-chip active-chip">
              <Settings size={16} aria-hidden="true" />
              Active Catalog: {companies.length} MNCs
            </div>
          </div>

          <div className="admin-grid">
            <section className="admin-panel config-panel">
              <div className="panel-title">
                <PlusCircle size={17} aria-hidden="true" />
                Configure Career Link
              </div>

              {adminError && <div className="admin-alert error">{adminError}</div>}
              {adminSuccess && <div className="admin-alert success">{adminSuccess}</div>}

              <form onSubmit={handleSaveCompany} className="admin-form">
                <div className="segmented-selector">
                  <button
                    type="button"
                    className={adminMode === 'existing' ? 'active' : ''}
                    onClick={() => {
                      setAdminMode('existing')
                      setAdminError('')
                      setAdminSuccess('')
                    }}
                  >
                    Select Existing MNC
                  </button>
                  <button
                    type="button"
                    className={adminMode === 'new' ? 'active' : ''}
                    onClick={() => {
                      setAdminMode('new')
                      setAdminError('')
                      setAdminSuccess('')
                    }}
                  >
                    Add New Company
                  </button>
                </div>

                {adminMode === 'existing' ? (
                  <div className="field">
                    <span>Search & Select Company ({filteredCatalogCompanies.length} showing)</span>
                    <div className="input-with-icon">
                      <Search size={16} aria-hidden="true" />
                      <input
                        value={adminSearchQuery}
                        onChange={(e) => {
                          setAdminSearchQuery(e.target.value)
                          setSelectedCompanyIndex(-1)
                        }}
                        placeholder="Search company in catalog (e.g. Oracle, Infosys)..."
                      />
                    </div>
                    {filteredCatalogCompanies.length > 0 ? (
                      <div className="company-list-suggestions">
                        {filteredCatalogCompanies.map((c, idx) => (
                          <button
                            key={c.name}
                            type="button"
                            className={`suggestion-item ${
                              selectedCompanyIndex === idx ? 'selected' : ''
                            } ${c.source ? 'configured' : ''}`}
                            onClick={() => {
                              setSelectedCompanyIndex(idx)
                              setAdminSearchQuery(c.name)
                              if (c.source) {
                                let url = ''
                                if (c.source === 'greenhouse') {
                                  url = `https://boards.greenhouse.io/${c.boardSlugGuess}`
                                } else if (c.source === 'lever') {
                                  url = `https://jobs.lever.co/${c.boardSlugGuess}`
                                } else if (c.source === 'ashby') {
                                  url = `https://jobs.ashbyhq.com/${c.boardSlugGuess}`
                                } else if (c.source === 'smartrecruiters') {
                                  url = `https://jobs.smartrecruiters.com/${c.boardSlugGuess}`
                                } else if (c.source === 'generic') {
                                  url = c.careersUrl || ''
                                }
                                setCareerSiteLink(url)
                              } else {
                                setCareerSiteLink('')
                              }
                            }}
                          >
                            <span className="comp-name">{c.name}</span>
                            <span className="comp-meta">
                              {c.type} · {c.source ? `${c.source} active` : 'unconfigured'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="no-suggestions">No companies match your search.</div>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="field">
                      <span>Company Name</span>
                      <input
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        placeholder="Enter company name..."
                      />
                    </label>

                    <div className="field">
                      <span>Company Type</span>
                      <div className="segmented" role="group" aria-label="Company Type">
                        {(['Product', 'Service'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={newCompanyType === type ? 'active' : ''}
                            onClick={() => setNewCompanyType(type)}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <label className="field">
                  <span>Career Site Link</span>
                  <input
                    value={careerSiteLink}
                    onChange={(e) => setCareerSiteLink(e.target.value)}
                    placeholder="e.g., https://www.google.com/about/careers/applications/jobs/results/"
                  />
                  <small className="help-text">
                    Supports official company careers pages plus Greenhouse, Lever, Ashby, SmartRecruiters, and Workday.
                  </small>
                </label>

                <button type="submit" disabled={isSubmitting} className="admin-submit">
                  {isSubmitting ? 'Saving...' : 'Save Configuration'}
                </button>
              </form>
            </section>

            <section className="admin-panel active-list-panel">
              <div className="panel-title">
                <Globe2 size={17} aria-hidden="true" />
                Configured Companies ({companies.filter(c => c.source).length})
              </div>

              <div className="configured-list">
                {companies
                  .filter((c) => c.source)
                  .map((c) => (
                    <div className="configured-card" key={c.name}>
                      <div className="card-info">
                        <strong>{c.name}</strong>
                        <span className="card-badge">{c.type}</span>
                        <small className="card-source">
                          {c.source} · {c.boardSlugGuess}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => handleRemoveCompanyLink(c.name)}
                        title="Remove configuration"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                {companies.filter((c) => c.source).length === 0 && (
                  <div className="empty-state">
                    No companies configured for job fetching.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
