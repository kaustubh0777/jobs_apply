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

async function sendTelegramNotifications(newJobs) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping notifications.')
    return
  }

  if (newJobs.length === 0) {
    console.log('[Telegram] No new jobs found this cycle.')
    return
  }

  console.log(`[Telegram] Sending notifications for ${newJobs.length} new jobs...`)
  let message = `🔍 <b>Found ${newJobs.length} New Job${newJobs.length > 1 ? 's' : ''}!</b>\n\n`

  // Display top 10 jobs in detail, summarize the rest
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

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node send-telegram-alerts.mjs <before-jobs-path> <after-jobs-path>')
    process.exit(1)
  }

  const beforeFile = path.resolve(args[0])
  const afterFile = path.resolve(args[1])

  console.log(`[Alerts] Comparing jobs: ${beforeFile} -> ${afterFile}`)

  // 1. Check if "before" file exists
  if (!fs.existsSync(beforeFile)) {
    console.log('[Alerts] Before jobs file does not exist. Skipping alerts (assumed first run to avoid spam).')
    return
  }

  // 2. Read "before" file
  let beforeJobs = []
  try {
    const data = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'))
    beforeJobs = data.jobs || []
  } catch (err) {
    console.error(`[Alerts] Error reading before file: ${err.message}`)
    return
  }

  // 3. Read "after" file
  if (!fs.existsSync(afterFile)) {
    console.error(`[Alerts] After file ${afterFile} does not exist.`)
    return
  }

  let afterJobs = []
  try {
    const data = JSON.parse(fs.readFileSync(afterFile, 'utf-8'))
    afterJobs = data.jobs || []
  } catch (err) {
    console.error(`[Alerts] Error reading after file: ${err.message}`)
    return
  }

  // 4. Find new jobs (IDs in after list that were not in before list)
  const beforeIds = new Set(beforeJobs.map(j => j.id).filter(Boolean))
  const newJobs = afterJobs.filter(j => j.id && !beforeIds.has(j.id))

  console.log(`[Alerts] Total jobs before: ${beforeJobs.length}, after: ${afterJobs.length}`)
  console.log(`[Alerts] Found ${newJobs.length} new jobs.`)

  // 5. Send alerts if new jobs found
  if (newJobs.length > 0) {
    await sendTelegramNotifications(newJobs)
  }
}

main().catch(err => {
  console.error('Fatal error in alerting script:', err)
  process.exit(1)
})
