import { spawn } from 'node:child_process'
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'

const updateIntervalMs = Number(process.env.JOB_UPDATE_INTERVAL_MS || 30 * 60 * 1000)
const webDiscoveryBatchSize = String(process.env.WEB_DISCOVERY_BATCH_SIZE || 100)
const atsDiscoveryBatchSize = String(process.env.DISCOVERY_BATCH_SIZE || 250)
const discoveryConcurrency = String(process.env.WEB_DISCOVERY_CONCURRENCY || 12)
const discoveryTimeoutMs = String(process.env.WEB_DISCOVERY_TIMEOUT_MS || 2500)
const discoveryCompanyTimeoutMs = String(process.env.WEB_DISCOVERY_COMPANY_TIMEOUT_MS || 9000)
const discoveryMaxDomains = String(process.env.WEB_DISCOVERY_MAX_DOMAINS || 5)
const discoveryMaxPaths = String(process.env.WEB_DISCOVERY_MAX_PATHS || 4)
const discoveryUseSearch = String(process.env.WEB_DISCOVERY_USE_SEARCH || '0')
const genericBatchSize = String(process.env.GENERIC_BATCH_SIZE || 50)
const genericUseBrowser = String(process.env.GENERIC_USE_BROWSER || '0')
const discoveryBatchEveryCycle = process.env.DISCOVERY_EVERY_CYCLE !== '0'
const runOnce = process.env.RUN_ONCE === '1'

const statusPaths = ['src/data/update-status.json', 'public/data/update-status.json']
const lockPath = 'tmp/auto-update-jobs.lock'
let stopping = false
let cycleNumber = 0
let lockHandle = null
let shuttingDown = false

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return fallback
  }
}

const writeStatus = async (patch) => {
  const previous = await readJson('src/data/update-status.json', {})
  const next = {
    ...previous,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  for (const path of statusPaths) {
    await mkdir(path.split('/').slice(0, -1).join('/'), { recursive: true })
    await writeFile(path, JSON.stringify(next, null, 2) + '\n')
  }
}

const runCommand = async (label, command, args, env = {}) => {
  await writeStatus({ state: 'running', currentStep: label })
  console.log(`\n[auto-update] ${label}: ${command} ${args.join(' ')}`)
  const startedAt = Date.now()
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const durationMs = Date.now() - startedAt
      if (code === 0) {
        resolve({ label, durationMs })
      } else {
        reject(new Error(`${label} exited with code ${code}`))
      }
    })
  })
}

const catalogSummary = async () => {
  const catalog = await readJson('src/data/company-catalog.json', { companies: [] })
  const jobs = await readJson('src/data/jobs.json', { jobs: [] })
  const companies = catalog.companies || []
  const sourceCounts = {}
  companies.forEach(company => {
    const key = company.source || 'unconfigured'
    sourceCounts[key] = (sourceCounts[key] || 0) + 1
  })
  const jobSourceCounts = {}
  ;(jobs.jobs || []).forEach(job => {
    jobSourceCounts[job.source] = (jobSourceCounts[job.source] || 0) + 1
  })
  return {
    companyCatalogSize: companies.length,
    configuredCompanies: companies.filter(company => company.source).length,
    unconfiguredCompanies: companies.filter(company => !company.source).length,
    sourceCounts,
    jobCount: (jobs.jobs || []).length,
    jobSourceCounts,
    jobsGeneratedAt: jobs.generatedAt || null,
  }
}

const runCycle = async () => {
  cycleNumber += 1
  const cycleStartedAt = new Date().toISOString()
  await writeStatus({
    state: 'running',
    cycleNumber,
    cycleStartedAt,
    lastError: null,
  })
  try {
    if (process.env.SKIP_CATALOG_MERGE === '1') {
      console.log('[auto-update] Skipping Excel catalog merge (running in production).')
    } else {
      await runCommand('Merge Excel catalog', 'python3', ['scripts/merge-excel-catalog.py'])
    }

    if (discoveryBatchEveryCycle) {
      await runCommand('Discover career sites', 'node', ['scripts/discover-career-sites.mjs'], {
        WEB_DISCOVERY_BATCH_SIZE: webDiscoveryBatchSize,
        WEB_DISCOVERY_CONCURRENCY: discoveryConcurrency,
        WEB_DISCOVERY_TIMEOUT_MS: discoveryTimeoutMs,
        WEB_DISCOVERY_COMPANY_TIMEOUT_MS: discoveryCompanyTimeoutMs,
        WEB_DISCOVERY_MAX_DOMAINS: discoveryMaxDomains,
        WEB_DISCOVERY_MAX_PATHS: discoveryMaxPaths,
        WEB_DISCOVERY_USE_SEARCH: discoveryUseSearch,
      })
    }

    await runCommand('Fetch ATS jobs', 'node', ['scripts/fetch-jobs.mjs'], {
      DISCOVERY_BATCH_SIZE: atsDiscoveryBatchSize,
    })
    await runCommand('Fetch official career-site jobs', 'node', ['scripts/fetch-generic.mjs'], {
      GENERIC_BATCH_SIZE: genericBatchSize,
      GENERIC_USE_BROWSER: genericUseBrowser,
    })

    const summary = await catalogSummary()
    await writeStatus({
      state: 'idle',
      currentStep: null,
      lastSuccessfulCycleAt: new Date().toISOString(),
      lastCycleStartedAt: cycleStartedAt,
      nextRunAt: runOnce ? null : new Date(Date.now() + updateIntervalMs).toISOString(),
      ...summary,
    })
    console.log(`[auto-update] cycle ${cycleNumber} complete: ${summary.jobCount} jobs, ${summary.configuredCompanies}/${summary.companyCatalogSize} companies configured.`)
  } catch (error) {
    await writeStatus({
      state: 'error',
      currentStep: null,
      lastError: error.message,
      nextRunAt: runOnce ? null : new Date(Date.now() + updateIntervalMs).toISOString(),
      ...(await catalogSummary()),
    })
    console.error(`[auto-update] cycle ${cycleNumber} failed: ${error.message}`)
  }
}

const cleanupLock = async () => {
  await lockHandle?.close().catch(() => {})
  await unlink(lockPath).catch(() => {})
}

const requestStop = async () => {
  if (shuttingDown) return
  shuttingDown = true
  stopping = true
  await writeStatus({ state: 'stopped', currentStep: null, nextRunAt: null })
  await cleanupLock()
  process.exit(0)
}

process.on('SIGINT', () => { void requestStop() })
process.on('SIGTERM', () => { void requestStop() })

await mkdir('tmp', { recursive: true })
try {
  lockHandle = await open(lockPath, 'wx')
  await lockHandle.writeFile(String(process.pid))
} catch {
  await writeStatus({
    state: 'locked',
    currentStep: null,
    lastError: 'Another auto updater is already running.',
  })
  console.log('[auto-update] another updater is already running; exiting.')
  process.exit(0)
}

await writeStatus({
  state: 'starting',
  intervalMinutes: Math.round(updateIntervalMs / 60000),
  discoveryBatchSize: Number(atsDiscoveryBatchSize),
  atsDiscoveryBatchSize: Number(atsDiscoveryBatchSize),
  webDiscoveryBatchSize: Number(webDiscoveryBatchSize),
  discoveryEnabled: discoveryBatchEveryCycle,
})

do {
  await runCycle()
  if (runOnce || stopping) break
  await new Promise(resolve => setTimeout(resolve, updateIntervalMs))
} while (!stopping)

await writeStatus({ state: 'stopped', nextRunAt: null })
await cleanupLock()
