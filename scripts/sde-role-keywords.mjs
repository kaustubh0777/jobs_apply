const normalizeRoleText = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[+/#._()[\]{}|,;:–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const includesRoleTerm = (text, term) => {
  const normalizedTerm = normalizeRoleText(term)
  if (!normalizedTerm) return false

  const paddedText = ` ${text} `
  const paddedTerm = ` ${normalizedTerm} `
  if (paddedText.includes(paddedTerm)) return true

  const compactText = text.replace(/[^a-z0-9]/g, '')
  const compactTerm = normalizedTerm.replace(/[^a-z0-9]/g, '')
  if (compactTerm.length >= 5 && compactText.includes(compactTerm)) return true

  if (normalizedTerm.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, 'i').test(text)
  }

  return text.includes(normalizedTerm)
}

export const sdeTitleTerms = [
  'sde',
  'sde i',
  'sde ii',
  'sde iii',
  'software development engineer',
  'software dev engineer',
  'software engineer',
  'software engineering',
  'software developer',
  'software dev',
  'software programmer',
  'software architect',
  'application developer',
  'application engineer',
  'applications developer',
  'applications engineer',
  'app developer',
  'app engineer',
  'product engineer',
  'product development engineer',
  'development engineer',
  'programmer analyst',
  'systems analyst developer',

  'backend engineer',
  'backend developer',
  'back end engineer',
  'back end developer',
  'server engineer',
  'server side engineer',
  'api engineer',
  'api developer',
  'microservices engineer',
  'distributed systems engineer',
  'full stack engineer',
  'full stack developer',
  'fullstack engineer',
  'fullstack developer',

  'frontend engineer',
  'frontend developer',
  'front end engineer',
  'front end developer',
  'web engineer',
  'web developer',
  'ui engineer',
  'ui developer',
  'ux engineer',
  'javascript engineer',
  'javascript developer',
  'typescript engineer',
  'typescript developer',
  'react engineer',
  'react developer',
  'angular engineer',
  'angular developer',
  'vue engineer',
  'vue developer',
  'node engineer',
  'node developer',
  'nodejs engineer',
  'nodejs developer',

  'mobile engineer',
  'mobile developer',
  'mobile app developer',
  'android engineer',
  'android developer',
  'ios engineer',
  'ios developer',
  'react native engineer',
  'react native developer',
  'flutter engineer',
  'flutter developer',
  'kotlin developer',
  'swift developer',

  'platform engineer',
  'cloud engineer',
  'cloud software engineer',
  'infrastructure engineer',
  'systems engineer',
  'system software engineer',
  'linux engineer',
  'kernel engineer',
  'devops engineer',
  'devsecops engineer',
  'site reliability engineer',
  'reliability engineer',
  'sre',
  'build engineer',
  'release engineer',
  'developer productivity engineer',
  'developer experience engineer',
  'devex engineer',
  'tools engineer',
  'tooling engineer',
  'automation engineer',

  'data engineer',
  'big data engineer',
  'etl developer',
  'analytics engineer',
  'machine learning engineer',
  'ml engineer',
  'ai engineer',
  'applied ai engineer',
  'applied machine learning engineer',
  'deep learning engineer',
  'nlp engineer',
  'computer vision engineer',
  'llm engineer',
  'mlops engineer',

  'sdet',
  'software development engineer in test',
  'software engineer in test',
  'test automation engineer',
  'automation test engineer',
  'qa automation engineer',
  'quality engineer automation',

  'security software engineer',
  'application security engineer',
  'appsec engineer',
  'product security engineer',
  'security engineer',

  'embedded software engineer',
  'embedded engineer',
  'firmware engineer',
  'robotics software engineer',
  'autonomy engineer',
  'simulation engineer',
  'graphics engineer',
  'rendering engineer',
  'gameplay engineer',
  'game developer',
  'database engineer',
  'network software engineer',
  'wireless software engineer',

  'java developer',
  'java engineer',
  'python developer',
  'python engineer',
  'golang developer',
  'golang engineer',
  'go developer',
  'go engineer',
  'rust developer',
  'rust engineer',
  'c++ developer',
  'c++ engineer',
  'cpp developer',
  'cpp engineer',
  'c# developer',
  'c# engineer',
  '.net developer',
  '.net engineer',
  'dotnet developer',
  'dotnet engineer',
  'scala developer',
  'scala engineer',
  'php developer',
  'php engineer',
  'ruby developer',
  'ruby engineer',

  'member of technical staff',
  'technical staff',
  'mts',
  'smts',
  'lmts',
  'architect',
]

export const sdeDepartmentTerms = [
  'engineering',
  'software',
  'technology',
  'product development',
  'research and development',
  'r and d',
  'platform',
  'infrastructure',
  'developer productivity',
  'developer experience',
  'cloud',
  'data platform',
  'machine learning',
  'artificial intelligence',
]

export const excludedTitleTerms = [
  'copy of',
  'account executive',
  'sales development',
  'sales engineer',
  'sales manager',
  'pre sales',
  'presales',
  'solutions engineer',
  'solution engineer',
  'customer engineer',
  'implementation engineer',
  'field engineer',
  'support engineer',
  'technical support',
  'customer support',
  'helpdesk',
  'service desk',
  'recruiter',
  'recruiting',
  'talent acquisition',
  'people ops',
  'hr ',
  'human resources',
  'solution area',
  'director',
  'vp of',
  'vice president',
  'product manager',
  'program manager',
  'project manager',
  'scrum master',
  'business analyst',
  'finance',
  'legal',
  'marketing',
  'customer success',
  'office manager',
  'executive assistant',
]

export const sdeSearchQueries = [
  'software engineer',
  'software development engineer',
  'software developer',
  'backend engineer',
  'frontend engineer',
  'full stack engineer',
  'application developer',
  'platform engineer',
  'devops engineer',
  'site reliability engineer',
  'data engineer',
  'machine learning engineer',
  'mobile engineer',
  'sdet',
]

export const isExcludedRoleTitle = (title = '') => {
  const normalizedTitle = normalizeRoleText(title)
  return excludedTitleTerms.some(term => includesRoleTerm(normalizedTitle, term))
}

export const matchesSdeRole = (title = '', department = '') => {
  const normalizedTitle = normalizeRoleText(title)
  const normalizedDepartment = normalizeRoleText(department)
  if (!normalizedTitle && !normalizedDepartment) return false
  if (isExcludedRoleTitle(normalizedTitle)) return false

  return (
    sdeTitleTerms.some(term => includesRoleTerm(normalizedTitle, term)) ||
    sdeDepartmentTerms.some(term => includesRoleTerm(normalizedDepartment, term))
  )
}
