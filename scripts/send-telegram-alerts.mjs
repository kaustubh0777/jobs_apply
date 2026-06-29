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
  const istDate = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000))
  return istDate.toISOString().split('T')[0]
}

// Get IST time string like "02:30 AM"
function getIstTimeString(dateObj) {
  const istDate = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000))
  let h = istDate.getUTCHours()
  const m = String(istDate.getUTCMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm} IST`
}

// Build the GitHub Pages dashboard URL
function getGitHubPagesUrl() {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) return null
  const [owner, name] = repo.split('/')
  return `https://${owner}.github.io/${name}/`
}

// Post formatted message to Telegram Bot API
async function postToTelegram(text, token, chatId) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      const result = await response.json()
      console.log('[Telegram] Message sent! message_id:', result.result?.message_id)
    }
  } catch (error) {
    console.error('[Telegram] Error posting message:', error)
  }
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildRunStatusMessage(beforeJobs, afterJobs, newJobs, isFirstRun, nowStr) {
  const pagesUrl = getGitHubPagesUrl()
  const trigger = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? '▶️ Manual Run' : '⏰ Scheduled Run'

  let msg = `🤖 <b>SDE Jobs Bot — Run Complete</b>\n`
  msg += `${trigger} · ${nowStr}\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `📦 Total jobs in database: <b>${afterJobs.length.toLocaleString()}</b>\n`

  if (newJobs.length > 0) {
    msg += `✨ New jobs this cycle: <b>+${newJobs.length}</b>\n`
  } else {
    msg += `🔄 No new jobs this cycle\n`
  }

  if (isFirstRun) {
    // Count jobs posted in last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recent30 = afterJobs.filter(j => j.postedAt && Date.parse(j.postedAt) > cutoff)
    msg += `📅 Jobs posted in last 30 days: <b>${recent30.length.toLocaleString()}</b>\n`
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`

  if (pagesUrl) {
    msg += `🌐 <a href="${pagesUrl}">View Dashboard</a>`
    msg += `  |  💬 Use /jobs to filter`
  } else {
    msg += `💬 Message your bot /jobs to filter results`
  }

  return msg
}

function buildNewJobsSection(newJobs) {
  if (newJobs.length === 0) return ''

  let msg = `\n\n🔔 <b>New Jobs Discovered (${newJobs.length})</b>\n\n`
  const display = newJobs.slice(0, 5)
  for (let i = 0; i < display.length; i++) {
    const job = display[i]
    const role    = escapeHtml(job.role || 'Software Engineer')
    const company = escapeHtml(job.company || 'Unknown Company')
    const loc     = escapeHtml(job.location || 'Not Specified')
    const exp     = escapeHtml(job.experienceLabel || job.experienceSource || 'N/A')
    const url     = job.directApplyUrl || job.url || '#'
    msg += `<b>${i + 1}. ${role}</b> @ <b>${company}</b>\n`
    msg += `📍 ${loc} | 💼 ${exp}\n`
    msg += `🔗 <a href="${url}">Apply</a>\n\n`
  }
  if (newJobs.length > 5) {
    msg += `<i>…and ${newJobs.length - 5} more new jobs!</i>`
  }
  return msg
}

function buildDailyDigestMessage(afterJobs, nowStr) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recent = afterJobs
    .filter(j => j.postedAt && Date.parse(j.postedAt) > cutoff)
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))

  const pagesUrl = getGitHubPagesUrl()

  let msg = `🌅 <b>Good Morning! SDE Jobs Daily Digest</b>\n`
  msg += `${nowStr}\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `Found <b>${recent.length.toLocaleString()}</b> SDE jobs from the last 30 days!\n\n`
  msg += `<b>Top 10 most recent openings:</b>\n\n`

  const display = recent.slice(0, 10)
  display.forEach((job, i) => {
    const role    = escapeHtml(job.role || 'Software Engineer')
    const company = escapeHtml(job.company || 'Unknown Company')
    const loc     = escapeHtml(job.location || 'Not Specified')
    const posted  = job.postedAt ? ` · <i>${escapeHtml(job.postedAt.split('T')[0])}</i>` : ''
    const url     = job.directApplyUrl || job.url || '#'
    msg += `<b>${i + 1}. ${role}</b> @ <b>${company}</b>${posted}\n`
    msg += `📍 ${loc}\n`
    msg += `🔗 <a href="${url}">Apply</a>\n\n`
  })

  if (recent.length > 10) {
    msg += `<i>…and ${(recent.length - 10).toLocaleString()} more jobs in last 30 days!</i>\n\n`
  }

  if (pagesUrl) {
    msg += `🌐 <a href="${pagesUrl}">Browse all ${afterJobs.length.toLocaleString()}+ jobs on Dashboard</a>`
  }

  return msg
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node send-telegram-alerts.mjs <before-jobs-path> <after-jobs-path>')
    process.exit(1)
  }

  const beforeFile = path.resolve(args[0])
  const afterFile  = path.resolve(args[1])

  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping alerts.')
    return
  }

  console.log(`[Alerts] Comparing: ${beforeFile} → ${afterFile}`)

  // Read after file (required)
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
  const nowStr    = getIstTimeString(new Date())

  // Read before file
  let beforeJobs = []
  let beforeData = { jobs: [] }
  let isFirstRunOfTheDay = false

  if (!fs.existsSync(beforeFile)) {
    console.log('[Alerts] No before file — this is a first-ever run.')
    isFirstRunOfTheDay = true
  } else {
    try {
      beforeData = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'))
      beforeJobs = beforeData.jobs || []
    } catch (err) {
      console.error(`[Alerts] Error reading before file: ${err.message}`)
    }

    // Determine if this is the first run of the day (IST)
    if (beforeData.generatedAt) {
      const beforeDayIST  = getIstDateString(new Date(beforeData.generatedAt))
      const currentDayIST = getIstDateString(new Date())
      console.log(`[Alerts] Last run IST date: ${beforeDayIST}, Today IST: ${currentDayIST}`)
      if (beforeDayIST !== currentDayIST) {
        isFirstRunOfTheDay = true
      }
    } else {
      console.log('[Alerts] No generatedAt in before file.')
    }
  }

  // Calculate new jobs
  const beforeIds = new Set(beforeJobs.map(j => j.id).filter(Boolean))
  const newJobs   = afterJobs.filter(j => j.id && !beforeIds.has(j.id))

  console.log(`[Alerts] Jobs before: ${beforeJobs.length}, after: ${afterJobs.length}, new: ${newJobs.length}`)
  console.log(`[Alerts] isFirstRunOfTheDay: ${isFirstRunOfTheDay}`)

  // ── Send messages ──────────────────────────────────────────────────────────

  if (isFirstRunOfTheDay) {
    // 1. Send the full daily digest as its own message
    console.log('[Alerts] Sending daily digest...')
    await postToTelegram(buildDailyDigestMessage(afterJobs, nowStr), token, chatId)
  }

  // 2. ALWAYS send the run status (so you know the scraper ran)
  const statusMsg = buildRunStatusMessage(beforeJobs, afterJobs, newJobs, isFirstRunOfTheDay, nowStr)
  const newJobsSection = buildNewJobsSection(newJobs)
  const fullStatusMsg  = statusMsg + newJobsSection

  console.log('[Alerts] Sending run status message...')
  await postToTelegram(fullStatusMsg, token, chatId)

  console.log('[Alerts] Done.')
}

main().catch(err => {
  console.error('Fatal error in alerting script:', err)
  process.exit(1)
})
