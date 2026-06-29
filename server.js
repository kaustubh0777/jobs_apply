import express from 'express'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { Storage } from '@google-cloud/storage'

const app = express()
const port = process.env.PORT || 8080
const bucketName = process.env.GCS_BUCKET_NAME
const updateToken = process.env.UPDATE_TOKEN

app.use(express.json())

const DATA_FILES = [
  'src/data/jobs.json',
  'src/data/company-catalog.json',
  'src/data/update-status.json',
  'src/data/career-site-discovery.json'
]

// Ensure local directory structure exists
for (const file of DATA_FILES) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Download state from GCS on startup or update trigger
async function downloadFromGcs() {
  if (!bucketName) {
    console.log('[GCS] No GCS_BUCKET_NAME env var set. Skipping download.')
    return
  }
  console.log(`[GCS] Syncing files from bucket: ${bucketName}...`)
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)

  for (const file of DATA_FILES) {
    const fileDest = path.resolve(file)
    const fileName = path.basename(file)
    const gcsFile = bucket.file(fileName)

    try {
      const [exists] = await gcsFile.exists()
      if (exists) {
        await gcsFile.download({ destination: fileDest })
        console.log(`[GCS] Downloaded ${fileName} to ${file}`)
      } else {
        console.log(`[GCS] ${fileName} does not exist in bucket yet. Will upload current local version later.`)
      }
    } catch (err) {
      console.error(`[GCS] Error downloading ${fileName}:`, err.message)
    }
  }
}

// Upload state back to GCS after modifications
async function uploadToGcs() {
  if (!bucketName) {
    console.log('[GCS] No GCS_BUCKET_NAME env var set. Skipping upload.')
    return
  }
  console.log(`[GCS] Uploading files to bucket: ${bucketName}...`)
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)

  for (const file of DATA_FILES) {
    const fileSrc = path.resolve(file)
    const fileName = path.basename(file)
    if (!fs.existsSync(fileSrc)) {
      continue
    }

    try {
      await bucket.upload(fileSrc, {
        destination: fileName,
        resumable: false,
      })
      console.log(`[GCS] Uploaded ${file} as ${fileName}`)
    } catch (err) {
      console.error(`[GCS] Error uploading ${fileName}:`, err.message)
    }
  }
}

// Simple HTML escaper to prevent message parsing issues in Telegram
function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Send notifications to Telegram bot
async function sendTelegramNotifications(newJobs) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping notifications.')
    return
  }

  if (newJobs.length === 0) {
    console.log('[Telegram] No new jobs to notify.')
    return
  }

  console.log(`[Telegram] Sending notification for ${newJobs.length} new jobs...`)
  let message = `🔔 <b>Found ${newJobs.length} New Job${newJobs.length > 1 ? 's' : ''}!</b>\n\n`
  
  // Show first 10 jobs in detail, then summarize the rest to avoid hitting Telegram's character limits
  const displayCount = Math.min(newJobs.length, 10)
  for (let i = 0; i < displayCount; i++) {
    const job = newJobs[i]
    const role = job.role || 'Software Engineer'
    const company = job.company || 'Unknown Company'
    const location = job.location || 'Not Specified'
    const exp = job.experienceLabel || job.experienceSource || 'Not Specified'
    const applyUrl = job.directApplyUrl || job.url || '#'
    
    message += `<b>${i + 1}. ${escapeHtml(role)}</b> at <b>${escapeHtml(company)}</b>\n`
    message += `📍 <i>${escapeHtml(location)}</i> | 💼 <i>Exp: ${escapeHtml(exp)}</i>\n`
    message += `🔗 <a href="${applyUrl}">Apply Here</a>\n\n`
  }
  
  if (newJobs.length > displayCount) {
    message += `<i>...and ${newJobs.length - displayCount} more jobs!</i>`
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    
    if (!response.ok) {
      const errText = await response.text()
      console.error(`[Telegram] Failed to send message: ${response.status} ${errText}`)
    } else {
      console.log('[Telegram] Notification sent successfully!')
    }
  } catch (error) {
    console.error('[Telegram] Error sending Telegram message:', error)
  }
}

// Global update in-progress state to prevent parallel scrapes
let isUpdating = false
let updaterProcess = null

// Expose dynamic json data files correctly
app.get('/data/jobs.json', (req, res) => {
  const jobsPath = path.resolve('src/data/jobs.json')
  if (fs.existsSync(jobsPath)) {
    res.sendFile(jobsPath)
  } else {
    res.status(404).json({ error: 'Jobs data not initialized' })
  }
})

app.get('/data/update-status.json', (req, res) => {
  const statusPath = path.resolve('src/data/update-status.json')
  if (fs.existsSync(statusPath)) {
    res.sendFile(statusPath)
  } else {
    res.status(404).json({ error: 'Update status data not initialized' })
  }
})

app.get('/data/company-catalog.json', (req, res) => {
  const catalogPath = path.resolve('src/data/company-catalog.json')
  if (fs.existsSync(catalogPath)) {
    res.sendFile(catalogPath)
  } else {
    res.status(404).json({ error: 'Company catalog data not initialized' })
  }
})

// Match Dev Server /api/update-status endpoint
app.get('/api/update-status', (req, res) => {
  try {
    const statusPath = path.resolve('src/data/update-status.json')
    const status = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
      : { state: 'unknown' }
    res.json({ ...status, updaterRunning: isUpdating })
  } catch (e) {
    res.status(500).json({ state: 'error', error: e.message, updaterRunning: isUpdating })
  }
})

// Match Dev Server /api/add-company endpoint
app.post('/api/add-company', async (req, res) => {
  try {
    const newCompany = req.body
    const catalogPath = path.resolve('src/data/company-catalog.json')
    
    // Sync catalog from GCS first to prevent overwriting other updates
    await downloadFromGcs()

    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
    const existingIndex = catalog.companies.findIndex(
      (c) => c.name.toLowerCase() === newCompany.name.toLowerCase()
    )

    if (existingIndex > -1) {
      catalog.companies[existingIndex] = {
        ...catalog.companies[existingIndex],
        ...newCompany,
      }
    } else {
      catalog.companies.push(newCompany)
    }

    catalog.companyCatalogSize = catalog.companies.length
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')

    // Save back to GCS
    await uploadToGcs()

    res.json({ success: true, catalog })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Trigger Scrape and Update Cycle
app.post('/api/run-update', async (req, res) => {
  // Simple Authorization Check
  if (updateToken) {
    const authHeader = req.headers.authorization
    const tokenParam = req.query.token
    const passedToken = authHeader ? authHeader.replace('Bearer ', '') : tokenParam

    if (passedToken !== updateToken) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' })
    }
  }

  if (isUpdating) {
    return res.status(409).json({ error: 'An update is already running' })
  }

  isUpdating = true
  console.log('[Update] Started update cycle triggered via API...')

  try {
    // 1. Download latest catalog and jobs state from GCS
    await downloadFromGcs()

    // 2. Read existing jobs before run to compare later
    let existingJobs = []
    try {
      const jobsData = JSON.parse(fs.readFileSync('src/data/jobs.json', 'utf-8'))
      existingJobs = jobsData.jobs || []
    } catch {
      // Starting from empty list if jobs.json doesn't exist
    }
    const existingJobIds = new Set(existingJobs.map(j => j.id))

    // 3. Spawn the auto-update script to run exactly once
    updaterProcess = spawn('node', ['scripts/auto-update-jobs.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RUN_ONCE: '1',
        SKIP_CATALOG_MERGE: '1',
        AUTO_UPDATE_JOBS: '1',
      },
      stdio: ['ignore', 'inherit', 'inherit']
    })

    updaterProcess.on('close', async (code) => {
      updaterProcess = null
      isUpdating = false

      if (code === 0) {
        console.log('[Update] Update script completed successfully!')
        
        // 4. Read updated jobs to find any new jobs
        let updatedJobs = []
        try {
          const jobsData = JSON.parse(fs.readFileSync('src/data/jobs.json', 'utf-8'))
          updatedJobs = jobsData.jobs || []
        } catch {
          // Failed to read new jobs
        }
        
        const newJobs = updatedJobs.filter(j => !existingJobIds.has(j.id))

        // 5. Send Telegram Notifications
        if (newJobs.length > 0) {
          await sendTelegramNotifications(newJobs)
        } else {
          console.log('[Update] No new jobs found this cycle.')
        }

        // 6. Sync updated files back to GCS
        await uploadToGcs()

        res.json({ success: true, newJobsCount: newJobs.length })
      } else {
        console.error(`[Update] Update script exited with non-zero code: ${code}`)
        res.status(500).json({ error: `Update script exited with code ${code}` })
      }
    })
  } catch (error) {
    isUpdating = false
    console.error('[Update] Error during update execution:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Serve production frontend assets
app.use(express.static('dist'))

app.get('*', (req, res) => {
  res.sendFile(path.resolve('dist/index.html'))
})

// Startup routine
app.listen(port, async () => {
  console.log(`[Server] Server listening on port ${port}`)
  // Sync files from GCS to initialize container local storage
  await downloadFromGcs()
})
