import fs from 'fs'
import path from 'path'

// Helper to escape HTML characters for Telegram HTML mode
function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Convert Date to IST date string (YYYY-MM-DD)
function getIstDateString(dateObj) {
  // IST is UTC+5:30
  const istDate = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000))
  return istDate.toISOString().split('T')[0]
}

// Send standard new jobs alerts
async function sendNewJobsAlert(newJobs, token, chatId) {
  console.log(`[Telegram] Sending notification for ${newJobs.length} new jobs...`)
  let message = `🔔 <b>Found ${newJobs.length} New SDE Job${newJobs.length > 1 ? 's' : ''}!</b>\n\n`

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
    message += `<i>...and ${newJobs.length - displayCount} more jobs!</i>\n\n`
  }

  const pagesUrl = getGitHubPagesUrl()
  if (pagesUrl) {
    message += `🌐 View dashboard: <a href="${pagesUrl}">${pagesUrl}</a>`
  }

  await postToTelegram(message, token, chatId)
}

// Send Daily Digest of jobs posted in the last 30 days
async function sendDailyDigest(allJobs, token, chatId) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  
  // Filter and sort jobs posted in the last 30 days
  const recentJobs = allJobs
    .filter(j => j.postedAt && Date.parse(j.postedAt) > thirtyDaysAgo)
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))

  console.log(`[Telegram] Sending Daily Digest. Found ${recentJobs.length} jobs in the last 30 days.`)

  let message = `🌅 <b>Daily SDE Jobs Digest</b> 🌅\n`
  message += `Found <b>${recentJobs.length}</b> SDE jobs posted in the last 30 days!\n\n`
  message += `Here are the top 10 most recent openings:\n\n`

  const displayCount = Math.min(recentJobs.length, 10)
  for (let i = 0; i < displayCount; i++) {
    const job = recentJobs[i]
    const role = job.role || 'Software Engineer'
    const company = job.company || 'Unknown Company'
    const location = job.location || 'Not Specified'
    const exp = job.experienceLabel || job.experienceSource || 'Not Specified'
    const applyUrl = job.directApplyUrl || job.url || '#'

    message += `<b>${i + 1}. ${escapeHtml(role)}</b> at <b>${escapeHtml(company)}</b>\n`
    message += `📍 <i>${escapeHtml(location)}</i> | 💼 <i>Exp: ${escapeHtml(exp)}</i>\n`
    message += `🔗 <a href="${applyUrl}">Apply Here</a>\n\n`
  }

  const pagesUrl = getGitHubPagesUrl()
  if (pagesUrl) {
    message += `🌐 View all 3,000+ SDE jobs on your dashboard:\n<a href="${pagesUrl}">${pagesUrl}</a>`
  }

  await postToTelegram(message, token, chatId)
}

// Helper to get GitHub Pages URL based on repo environment
function getGitHubPagesUrl() {
  const repo = process.env.GITHUB_REPOSITORY // e.g. "owner/repo"
  if (!repo) return null
  const [owner, name] = repo.split('/')
  return `https://${owner}.github.io/${name}/`
}

// Post formatted message to Telegram Bot API
async function postToTelegram(text, token, chatId) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[Telegram] Failed to send message: ${response.status} ${errText}`)
    } else {
      console.log('[Telegram] Message sent successfully!')
    }
  } catch (error) {
    console.error('[Telegram] Error posting message:', error)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node send-telegram-alerts.mjs <before-jobs-path> <after-jobs-path>')
    process.exit(1)
  }

  const beforeFile = path.resolve(args[0])
  const afterFile = path.resolve(args[1])

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping alerts.')
    return
  }

  console.log(`[Alerts] Comparing jobs: ${beforeFile} -> ${afterFile}`)

  // 1. Read "after" file (always required)
  if (!fs.existsSync(afterFile)) {
    console.error(`[Alerts] After file ${afterFile} does not exist.`)
    return
  }

  let afterData = { jobs: [] }
  try {
    afterData = JSON.parse(fs.readFileSync(afterFile, 'utf-8'))
  } catch (err) {
    console.error(`[Alerts] Error reading after file: ${err.message}`)
    return
  }
  const afterJobs = afterData.jobs || []

  // 2. Check if "before" file exists
  if (!fs.existsSync(beforeFile)) {
    console.log('[Alerts] Before jobs file does not exist. Skipping alerts (first run to avoid spam).')
    return
  }

  let beforeData = { jobs: [] }
  try {
    beforeData = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'))
  } catch (err) {
    console.error(`[Alerts] Error reading before file: ${err.message}`)
    return
  }
  const beforeJobs = beforeData.jobs || []

  // 3. Determine if this is the first run of the day in IST
  let isFirstRunOfTheDay = false
  if (beforeData.generatedAt) {
    const beforeDate = new Date(beforeData.generatedAt)
    const currentDate = new Date()

    const beforeDayIST = getIstDateString(beforeDate)
    const currentDayIST = getIstDateString(currentDate)

    console.log(`[Alerts] Last run day (IST): ${beforeDayIST}, Current run day (IST): ${currentDayIST}`)
    if (beforeDayIST !== currentDayIST) {
      isFirstRunOfTheDay = true
    }
  } else {
    // If no generatedAt timestamp is available, treat as standard run
    console.log('[Alerts] No timestamp in before file. Skipping daily digest check.')
  }

  // 4. Calculate newly added jobs
  const beforeIds = new Set(beforeJobs.map(j => j.id).filter(Boolean))
  const newJobs = afterJobs.filter(j => j.id && !beforeIds.has(j.id))

  console.log(`[Alerts] Total jobs before: ${beforeJobs.length}, after: ${afterJobs.length}`)
  console.log(`[Alerts] Found ${newJobs.length} new jobs. First run of the day: ${isFirstRunOfTheDay}`)

  // 5. Send alerts based on conditions
  if (isFirstRunOfTheDay) {
    // Trigger Daily Digest on the first run of the day
    await sendDailyDigest(afterJobs, token, chatId)
  } else if (newJobs.length > 0) {
    // Trigger Standard alerts on subsequent runs if new jobs are found
    await sendNewJobsAlert(newJobs, token, chatId)
  } else {
    console.log('[Alerts] No new jobs found and not the first run of the day. No message sent.')
  }
}

main().catch(err => {
  console.error('Fatal error in alerting script:', err)
  process.exit(1)
})
