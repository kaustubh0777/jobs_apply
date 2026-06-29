/**
 * Interactive Telegram Bot — Long Polling
 * Runs via GitHub Actions every 5 minutes.
 * Clears any stale webhook on startup, then polls for messages.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const OFFSET_FILE = path.resolve(__dirname, '../tmp/telegram-offset.json')

// ── Telegram API ──────────────────────────────────────────────────────────────

async function telegramApi(method, payload = {}) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error(`[Bot] ❌ Telegram API error [${method}]:`, JSON.stringify(data))
  }
  return data
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId, text,
    parse_mode: 'HTML', disable_web_page_preview: true, ...extra,
  })
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return telegramApi('editMessageText', {
    chat_id: chatId, message_id: messageId, text,
    parse_mode: 'HTML', disable_web_page_preview: true, ...extra,
  })
}

async function answerCallbackQuery(id) {
  return telegramApi('answerCallbackQuery', { callback_query_id: id })
}

// ── Offset tracking ───────────────────────────────────────────────────────────

function loadOffset() {
  try {
    if (fs.existsSync(OFFSET_FILE)) {
      const val = JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf-8')).offset || 0
      console.log(`[Bot] Loaded offset from cache: ${val}`)
      return val
    }
  } catch (_) {}
  console.log('[Bot] No cached offset found, starting from 0')
  return 0
}

function saveOffset(offset) {
  try {
    fs.mkdirSync(path.dirname(OFFSET_FILE), { recursive: true })
    fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset }), 'utf-8')
  } catch (e) {
    console.error('[Bot] Could not save offset:', e.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(text) {
  if (!text) return ''
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function loadJobs() {
  const localPath = path.resolve(__dirname, '../src/data/jobs.json')
  if (fs.existsSync(localPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'))
      const jobs = data.jobs || []
      console.log(`[Bot] Loaded ${jobs.length} jobs from local jobs.json`)
      return jobs
    } catch (e) {
      console.error('[Bot] Failed to read local jobs.json:', e.message)
    }
  }
  console.warn('[Bot] jobs.json not found locally!')
  return []
}

function filterJobs(jobs, source, exp, country) {
  return jobs.filter(job => {
    if (source !== 'all') {
      const sl  = (job.source || '').toLowerCase()
      const idl = (job.id    || '').toLowerCase()
      if (source === 'greenhouse'      && !sl.includes('greenhouse')     && !idl.startsWith('greenhouse'))     return false
      if (source === 'lever'           && !sl.includes('lever')          && !idl.startsWith('lever'))          return false
      if (source === 'ashby'           && !sl.includes('ashby')          && !idl.startsWith('ashby'))          return false
      if (source === 'smartrecruiters' && !sl.includes('smart')          && !idl.startsWith('smartrecruiters')) return false
      if (source === 'workday'         && !sl.includes('workday')        && !idl.startsWith('workday'))        return false
      if (source === 'microsoft'       && !sl.includes('microsoft')      && !idl.startsWith('official-microsoft')) return false
      if (source === 'generic'         && !sl.includes('official')       && !sl.includes('generic'))           return false
    }
    if (exp !== 'any') {
      const minExp = job.experienceMin ?? 0
      if (exp === 'entry' && minExp > 2)                return false
      if (exp === 'mid'   && (minExp <= 2 || minExp > 5)) return false
      if (exp === 'sr'    && minExp <= 5)               return false
    }
    if (country !== 'any') {
      const cl = (job.country  || '').toLowerCase()
      const ll = (job.location || '').toLowerCase()
      if (country === 'in' && cl !== 'india'         && !ll.includes('india'))             return false
      if (country === 'us' && cl !== 'united states' && cl !== 'us' && !ll.includes('us') && !ll.includes('usa')) return false
    }
    return true
  })
}

function getDashboardUrl() {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) return null
  const [owner, name] = repo.split('/')
  return `https://${owner}.github.io/${name}/`
}

// ── Keyboards ─────────────────────────────────────────────────────────────────

const SOURCE_KB = {
  inline_keyboard: [
    [{ text: '🟢 Greenhouse', callback_data: 'f:greenhouse::' }, { text: '🔵 Lever', callback_data: 'f:lever::' }],
    [{ text: '🟣 Ashby', callback_data: 'f:ashby::' }, { text: '🟠 SmartRecruiters', callback_data: 'f:smartrecruiters::' }],
    [{ text: '🏢 Workday', callback_data: 'f:workday::' }, { text: '💻 Microsoft', callback_data: 'f:microsoft::' }],
    [{ text: '🌐 Official Portals', callback_data: 'f:generic::' }, { text: '✨ All Sources', callback_data: 'f:all::' }],
  ],
}

const AGAIN_KB = { inline_keyboard: [[{ text: '🔄 Search Again', callback_data: 'f:::' }]] }

const expKb = src => ({
  inline_keyboard: [
    [{ text: '👶 Entry-Level (0-2 Yrs)', callback_data: `f:${src}:entry:` }, { text: '🧑 Mid-Level (2-5 Yrs)', callback_data: `f:${src}:mid:` }],
    [{ text: '🧓 Senior (5+ Yrs)', callback_data: `f:${src}:sr:` }, { text: '✨ Any Experience', callback_data: `f:${src}:any:` }],
    [{ text: '⬅️ Back to Sources', callback_data: 'f:::' }],
  ],
})

const countryKb = (src, exp) => ({
  inline_keyboard: [
    [{ text: '🇮🇳 India', callback_data: `f:${src}:${exp}:in` }, { text: '🇺🇸 United States', callback_data: `f:${src}:${exp}:us` }],
    [{ text: '🌍 Any Country', callback_data: `f:${src}:${exp}:any` }],
    [{ text: '⬅️ Back to Experience', callback_data: `f:${src}::` }],
  ],
})

// ── Labels ────────────────────────────────────────────────────────────────────

const SOURCE_LABELS  = { greenhouse: '🟢 Greenhouse', lever: '🔵 Lever', ashby: '🟣 Ashby', smartrecruiters: '🟠 SmartRecruiters', workday: '🏢 Workday', microsoft: '💻 Microsoft', generic: '🌐 Official Portals', all: '✨ All Sources' }
const EXP_LABELS     = { entry: '0-2 Yrs', mid: '2-5 Yrs', sr: '5+ Yrs', any: 'Any' }
const COUNTRY_LABELS = { in: '🇮🇳 India', us: '🇺🇸 United States', any: '🌍 Any Country' }

// ── Screens ───────────────────────────────────────────────────────────────────

async function showSourceScreen(chatId, messageId = null) {
  const text = '🔍 <b>Step 1 of 3 — Choose a Job Source</b>\n\nSelect which job board you want to search:'
  if (messageId) await editMessage(chatId, messageId, text, { reply_markup: SOURCE_KB })
  else           await sendMessage(chatId, text, { reply_markup: SOURCE_KB })
}

async function showExpScreen(chatId, source, messageId) {
  await editMessage(chatId, messageId,
    `💼 <b>Step 2 of 3 — Experience Level</b>\n\nSource: <code>${esc(SOURCE_LABELS[source] || source)}</code>\nChoose your experience level:`,
    { reply_markup: expKb(source) })
}

async function showCountryScreen(chatId, source, exp, messageId) {
  await editMessage(chatId, messageId,
    `📍 <b>Step 3 of 3 — Location</b>\n\nSource: <code>${esc(SOURCE_LABELS[source] || source)}</code> | Exp: <code>${EXP_LABELS[exp] || exp}</code>\nPick your country:`,
    { reply_markup: countryKb(source, exp) })
}

async function showResults(chatId, source, exp, country, messageId) {
  await editMessage(chatId, messageId, '⏳ <i>Filtering jobs… please wait.</i>')

  const allJobs = loadJobs()
  const matched = filterJobs(allJobs, source, exp, country)

  let text = `✅ <b>Search Results</b>\n`
  text += `${SOURCE_LABELS[source] || source} | ${EXP_LABELS[exp] || exp} | ${COUNTRY_LABELS[country] || country}\n`
  text += `Found <b>${matched.length.toLocaleString()}</b> matching jobs\n\n`

  if (matched.length === 0) {
    text += `<i>No jobs found. Try broadening your filters!</i>\n`
  } else {
    matched.slice(0, 8).forEach((job, i) => {
      const posted = job.postedAt ? ` · <i>${esc(job.postedAt.split('T')[0])}</i>` : ''
      text += `<b>${i + 1}. ${esc(job.role || 'SDE')}</b> @ <b>${esc(job.company || 'Unknown')}</b>${posted}\n`
      text += `📍 ${esc(job.location || 'N/A')} | 💼 ${esc(job.experienceLabel || job.experienceSource || 'N/A')}\n`
      text += `🔗 <a href="${job.directApplyUrl || job.url || '#'}">Apply Here</a>\n\n`
    })
    if (matched.length > 8) {
      text += `<i>…and ${(matched.length - 8).toLocaleString()} more. Visit the dashboard!</i>\n\n`
    }
  }

  const url = getDashboardUrl()
  if (url) text += `🌐 <a href="${url}">Open Full Dashboard</a>`

  await editMessage(chatId, messageId, text, { reply_markup: AGAIN_KB })
  console.log(`[Bot] ✅ Results sent: source=${source} exp=${exp} country=${country} → ${matched.length} jobs`)
}

// ── Update handlers ───────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const chatId = msg.chat.id
  const text   = (msg.text || '').trim()
  const name   = msg.from?.first_name || 'there'

  console.log(`[Bot] Message from ${name} (${chatId}): "${text}"`)

  if (text.startsWith('/start') || text.startsWith('/jobs')) {
    const isStart = text.startsWith('/start')
    const intro = isStart
      ? `👋 <b>Hey ${esc(name)}! Welcome to SDE Jobs Bot 🤖</b>\n\n` +
        `I help you find Software Engineer jobs filtered by source, experience &amp; location.\n\n` +
        `<b>Commands:</b>\n/jobs — Filter &amp; browse jobs\n/digest — Today's top picks\n/help — All commands\n\n` +
        `Let's find your next role! Pick a source:\n`
      : `🔍 Let's find jobs! Pick a source:`
    await sendMessage(chatId, intro, { reply_markup: SOURCE_KB })

  } else if (text.startsWith('/digest')) {
    const jobs = loadJobs()
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recent = jobs
      .filter(j => j.postedAt && Date.parse(j.postedAt) > cutoff)
      .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))

    let out = `🌅 <b>Jobs Digest — Last 30 Days</b>\nFound <b>${recent.length.toLocaleString()}</b> SDE openings\n\n`
    recent.slice(0, 10).forEach((job, i) => {
      const posted = job.postedAt ? ` · <i>${esc(job.postedAt.split('T')[0])}</i>` : ''
      out += `<b>${i + 1}. ${esc(job.role || 'SDE')}</b> @ <b>${esc(job.company || 'Unknown')}</b>${posted}\n`
      out += `📍 ${esc(job.location || 'N/A')} | 🔗 <a href="${job.directApplyUrl || job.url || '#'}">Apply</a>\n\n`
    })
    if (recent.length > 10) out += `<i>…and ${(recent.length - 10).toLocaleString()} more!</i>`
    const url = getDashboardUrl()
    if (url) out += `\n\n🌐 <a href="${url}">View Full Dashboard</a>`
    await sendMessage(chatId, out, { reply_markup: AGAIN_KB })

  } else if (text.startsWith('/help')) {
    await sendMessage(chatId,
      `🤖 <b>SDE Jobs Bot — Commands</b>\n\n` +
      `/start — Welcome message\n/jobs — Filter jobs interactively\n/digest — Top SDE jobs from last 30 days\n/help — This message\n\n` +
      `You'll also get <b>automatic alerts</b> when the scraper finds new jobs!`
    )
  } else {
    await sendMessage(chatId, `🤖 Use /jobs to search, /digest for recent jobs, or /help for commands!`)
  }
}

async function handleCallbackQuery(cbq) {
  const chatId    = cbq.message.chat.id
  const messageId = cbq.message.message_id
  const data      = cbq.data || ''
  const name      = cbq.from?.first_name || 'user'

  console.log(`[Bot] Callback from ${name}: "${data}"`)
  await answerCallbackQuery(cbq.id)

  if (!data.startsWith('f:')) return
  const [, source, exp, country] = data.split(':')

  if (!source)       await showSourceScreen(chatId, messageId)
  else if (!exp)     await showExpScreen(chatId, source, messageId)
  else if (!country) await showCountryScreen(chatId, source, exp, messageId)
  else               await showResults(chatId, source, exp, country, messageId)
}

// ── Main: clear webhook then poll ─────────────────────────────────────────────

async function main() {
  if (!TOKEN) {
    console.error('[Bot] ❌ TELEGRAM_BOT_TOKEN not set. Exiting.')
    process.exit(1)
  }

  // Step 1: Delete any webhook so getUpdates works
  console.log('[Bot] Clearing any existing webhook...')
  const wh = await telegramApi('deleteWebhook', { drop_pending_updates: false })
  console.log('[Bot] deleteWebhook result:', wh.ok ? '✅ cleared' : '⚠️ ' + wh.description)

  // Step 2: Verify bot identity
  const me = await telegramApi('getMe', {})
  if (me.ok) {
    console.log(`[Bot] Running as: @${me.result.username} (${me.result.first_name})`)
  }

  let offset = loadOffset()

  // Step 3: Poll for 55 seconds (safe within GitHub Actions 3-minute timeout)
  const END_AT = Date.now() + 55_000
  console.log(`[Bot] Starting poll loop for 55s. Offset: ${offset}`)

  while (Date.now() < END_AT) {
    try {
      const result = await telegramApi('getUpdates', {
        offset,
        timeout: 20,
        allowed_updates: ['message', 'callback_query'],
      })

      if (!result.ok || !Array.isArray(result.result)) {
        console.error('[Bot] getUpdates failed:', JSON.stringify(result))
        await new Promise(r => setTimeout(r, 5000))
        continue
      }

      for (const update of result.result) {
        try {
          if (update.message)             await handleMessage(update.message)
          else if (update.callback_query) await handleCallbackQuery(update.callback_query)
        } catch (err) {
          console.error(`[Bot] Error on update ${update.update_id}:`, err.message)
        }
        offset = update.update_id + 1
      }

      if (result.result.length > 0) {
        saveOffset(offset)
        console.log(`[Bot] Processed ${result.result.length} update(s). Offset → ${offset}`)
      }

    } catch (err) {
      console.error('[Bot] Polling error:', err.message)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  saveOffset(offset)
  console.log('[Bot] Session complete. Final offset:', offset)
}

main().catch(err => {
  console.error('[Bot] Fatal:', err)
  process.exit(1)
})
