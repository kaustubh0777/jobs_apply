/**
 * Telegram Webhook Server
 * Deploy to Render.com (free tier, no credit card)
 * 
 * Set these env vars in Render dashboard:
 *   TELEGRAM_BOT_TOKEN = your bot token
 *   JOBS_JSON_URL = https://raw.githubusercontent.com/kaustubh0777/jobs_apply/main/src/data/jobs.json
 */

import { createServer } from 'http'

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const PORT    = process.env.PORT || 3000
const JOBS_URL = process.env.JOBS_JSON_URL ||
  'https://raw.githubusercontent.com/kaustubh0777/jobs_apply/main/src/data/jobs.json'

// ── Cache jobs in memory, refresh every 10 minutes ───────────────────────────
let jobsCache = []
let cacheTime = 0

async function getJobs() {
  if (Date.now() - cacheTime < 10 * 60 * 1000 && jobsCache.length > 0) {
    return jobsCache
  }
  try {
    const res  = await fetch(JOBS_URL)
    const data = await res.json()
    jobsCache  = data.jobs || []
    cacheTime  = Date.now()
    console.log(`[Jobs] Refreshed cache: ${jobsCache.length} jobs`)
  } catch (e) {
    console.error('[Jobs] Failed to fetch:', e.message)
  }
  return jobsCache
}

// ── Telegram API ──────────────────────────────────────────────────────────────
async function tg(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) console.error(`[TG] ${method} error:`, data.description)
  return data
}

const send = (chatId, text, extra = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

const edit = (chatId, msgId, text, extra = {}) =>
  tg('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

const ack = (id) => tg('answerCallbackQuery', { callback_query_id: id })

// ── HTML escape ───────────────────────────────────────────────────────────────
const esc = t => t ? String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''

// ── Job filtering ─────────────────────────────────────────────────────────────
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
      const m = job.experienceMin ?? 0
      if (exp === 'entry' && m > 2)              return false
      if (exp === 'mid'   && (m <= 2 || m > 5)) return false
      if (exp === 'sr'    && m <= 5)             return false
    }
    if (country !== 'any') {
      const cl = (job.country  || '').toLowerCase()
      const ll = (job.location || '').toLowerCase()
      if (country === 'in' && cl !== 'india'         && !ll.includes('india')) return false
      if (country === 'us' && cl !== 'united states' && cl !== 'us' && !ll.includes('us') && !ll.includes('usa')) return false
    }
    return true
  })
}

// ── Keyboards ─────────────────────────────────────────────────────────────────
const SOURCE_KB = { inline_keyboard: [
  [{ text: '🟢 Greenhouse', callback_data: 'f:greenhouse::' }, { text: '🔵 Lever', callback_data: 'f:lever::' }],
  [{ text: '🟣 Ashby', callback_data: 'f:ashby::' }, { text: '🟠 SmartRecruiters', callback_data: 'f:smartrecruiters::' }],
  [{ text: '🏢 Workday', callback_data: 'f:workday::' }, { text: '💻 Microsoft', callback_data: 'f:microsoft::' }],
  [{ text: '🌐 Official Portals', callback_data: 'f:generic::' }, { text: '✨ All Sources', callback_data: 'f:all::' }],
]}
const AGAIN_KB   = { inline_keyboard: [[{ text: '🔄 Search Again', callback_data: 'f:::' }]] }
const expKb  = s => ({ inline_keyboard: [
  [{ text: '👶 Entry-Level (0-2 Yrs)', callback_data: `f:${s}:entry:` }, { text: '🧑 Mid-Level (2-5 Yrs)', callback_data: `f:${s}:mid:` }],
  [{ text: '🧓 Senior (5+ Yrs)', callback_data: `f:${s}:sr:` }, { text: '✨ Any Experience', callback_data: `f:${s}:any:` }],
  [{ text: '⬅️ Back', callback_data: 'f:::' }],
]})
const countryKb = (s, e) => ({ inline_keyboard: [
  [{ text: '🇮🇳 India', callback_data: `f:${s}:${e}:in` }, { text: '🇺🇸 United States', callback_data: `f:${s}:${e}:us` }],
  [{ text: '🌍 Any Country', callback_data: `f:${s}:${e}:any` }],
  [{ text: '⬅️ Back', callback_data: `f:${s}::` }],
]})

// ── Labels ────────────────────────────────────────────────────────────────────
const SRC_LBL = { greenhouse:'🟢 Greenhouse', lever:'🔵 Lever', ashby:'🟣 Ashby', smartrecruiters:'🟠 SmartRecruiters', workday:'🏢 Workday', microsoft:'💻 Microsoft', generic:'🌐 Official Portals', all:'✨ All Sources' }
const EXP_LBL = { entry:'0-2 Yrs', mid:'2-5 Yrs', sr:'5+ Yrs', any:'Any' }
const CTR_LBL = { in:'🇮🇳 India', us:'🇺🇸 United States', any:'🌍 Any Country' }

// ── Screens ───────────────────────────────────────────────────────────────────
async function showSource(chatId, msgId = null) {
  const text = '🔍 <b>Step 1 of 3 — Choose a Job Source</b>\n\nSelect which job board to search:'
  if (msgId) await edit(chatId, msgId, text, { reply_markup: SOURCE_KB })
  else       await send(chatId, text, { reply_markup: SOURCE_KB })
}

async function showExp(chatId, src, msgId) {
  await edit(chatId, msgId, `💼 <b>Step 2 of 3 — Experience Level</b>\n\nSource: <code>${esc(SRC_LBL[src]||src)}</code>\nChoose experience:`, { reply_markup: expKb(src) })
}

async function showCountry(chatId, src, exp, msgId) {
  await edit(chatId, msgId, `📍 <b>Step 3 of 3 — Location</b>\n\nSource: <code>${esc(SRC_LBL[src]||src)}</code> | Exp: <code>${EXP_LBL[exp]||exp}</code>\nChoose country:`, { reply_markup: countryKb(src, exp) })
}

async function showResults(chatId, src, exp, country, msgId) {
  await edit(chatId, msgId, '⏳ <i>Filtering jobs… please wait.</i>')
  const all     = await getJobs()
  const matched = filterJobs(all, src, exp, country)

  let text = `✅ <b>Search Results</b>\n${SRC_LBL[src]||src} | ${EXP_LBL[exp]||exp} | ${CTR_LBL[country]||country}\nFound <b>${matched.length.toLocaleString()}</b> matching jobs\n\n`

  if (matched.length === 0) {
    text += `<i>No jobs found. Try broadening your filters!</i>\n`
  } else {
    matched.slice(0, 8).forEach((job, i) => {
      const posted = job.postedAt ? ` · <i>${esc(job.postedAt.split('T')[0])}</i>` : ''
      text += `<b>${i+1}. ${esc(job.role||'SDE')}</b> @ <b>${esc(job.company||'Unknown')}</b>${posted}\n`
      text += `📍 ${esc(job.location||'N/A')} | 💼 ${esc(job.experienceLabel||job.experienceSource||'N/A')}\n`
      text += `🔗 <a href="${job.directApplyUrl||job.url||'#'}">Apply Here</a>\n\n`
    })
    if (matched.length > 8) text += `<i>…and ${(matched.length-8).toLocaleString()} more. Visit the dashboard!</i>\n\n`
  }
  text += `🌐 <a href="https://kaustubh0777.github.io/jobs_apply/">Open Dashboard</a>`
  await edit(chatId, msgId, text, { reply_markup: AGAIN_KB })
  console.log(`[Bot] Results: src=${src} exp=${exp} country=${country} → ${matched.length}`)
}

// ── Message & callback handlers ───────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id
  const text   = (msg.text || '').trim()
  const name   = msg.from?.first_name || 'there'
  console.log(`[Bot] msg from ${name}: "${text}"`)

  if (text.startsWith('/start') || text.startsWith('/jobs')) {
    const isStart = text.startsWith('/start')
    const intro = isStart
      ? `👋 <b>Hey ${esc(name)}! Welcome to SDE Jobs Bot 🤖</b>\n\nI help you find Software Engineer jobs filtered by source, experience &amp; location.\n\n<b>Commands:</b>\n/jobs — Filter &amp; browse jobs\n/digest — Recent picks\n/help — All commands\n\nPick a source to start:\n`
      : `🔍 Let's find jobs! Pick a source:`
    await send(chatId, intro, { reply_markup: SOURCE_KB })

  } else if (text.startsWith('/digest')) {
    const jobs   = await getJobs()
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recent = jobs.filter(j => j.postedAt && Date.parse(j.postedAt) > cutoff)
                       .sort((a,b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
    let out = `🌅 <b>Jobs Digest — Last 30 Days</b>\nFound <b>${recent.length.toLocaleString()}</b> SDE openings\n\n`
    recent.slice(0, 10).forEach((job, i) => {
      const posted = job.postedAt ? ` · <i>${esc(job.postedAt.split('T')[0])}</i>` : ''
      out += `<b>${i+1}. ${esc(job.role||'SDE')}</b> @ <b>${esc(job.company||'Unknown')}</b>${posted}\n`
      out += `📍 ${esc(job.location||'N/A')} | 🔗 <a href="${job.directApplyUrl||job.url||'#'}">Apply</a>\n\n`
    })
    out += `🌐 <a href="https://kaustubh0777.github.io/jobs_apply/">View Dashboard</a>`
    await send(chatId, out, { reply_markup: AGAIN_KB })

  } else if (text.startsWith('/help')) {
    await send(chatId, `🤖 <b>SDE Jobs Bot</b>\n\n/start — Welcome\n/jobs — Filter jobs interactively\n/digest — Top 30-day picks\n/help — This message`)
  } else {
    await send(chatId, `🤖 Use /jobs to search or /help for commands!`)
  }
}

async function handleCallback(cbq) {
  const chatId = cbq.message.chat.id
  const msgId  = cbq.message.message_id
  const data   = cbq.data || ''
  console.log(`[Bot] cb from ${cbq.from?.first_name}: "${data}"`)
  await ack(cbq.id)
  if (!data.startsWith('f:')) return
  const [, src, exp, country] = data.split(':')
  if (!src)     await showSource(chatId, msgId)
  else if (!exp)     await showExp(chatId, src, msgId)
  else if (!country) await showCountry(chatId, src, exp, msgId)
  else               await showResults(chatId, src, exp, country, msgId)
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('SDE Jobs Bot is running ✅')
    return
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const update = JSON.parse(body)
        if (update.message)             await handleMessage(update.message)
        else if (update.callback_query) await handleCallback(update.callback_query)
      } catch (e) {
        console.error('[Server] Error handling update:', e.message)
      }
      res.writeHead(200)
      res.end('OK')
    })
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`🚀 SDE Jobs Bot webhook server running on port ${PORT}`)
  console.log(`   Webhook URL: https://your-app.onrender.com/webhook`)
  // Prefetch jobs cache on startup
  getJobs()
})
