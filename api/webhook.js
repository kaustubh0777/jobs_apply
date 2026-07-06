import fetch from 'node-fetch'

// Helper to escape HTML characters for Telegram
function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Handler for Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const body = req.body

  if (!body) {
    return res.status(400).send('Bad Request')
  }

  try {
    if (body.message) {
      await handleMessage(body.message, token)
    } else if (body.callback_query) {
      await handleCallbackQuery(body.callback_query, token)
    }
  } catch (error) {
    console.error('Error handling Telegram webhook:', error)
  }

  res.status(200).send('OK')
}

// Handle text messages (e.g. /start)
async function handleMessage(message, token) {
  const chatId = message.chat.id
  const text = message.text || ''

  if (text.startsWith('/start')) {
    // Send welcome message and Job Source selection keyboard
    await sendSourceSelection(chatId, token)
  } else {
    // Send a fallback guide
    await postToTelegram('sendMessage', {
      chat_id: chatId,
      text: '🤖 Welcome to the SDE Jobs Bot!\n\nUse the command <b>/start</b> to choose job sources, experience, and country filters to fetch jobs.',
      parse_mode: 'HTML'
    }, token)
  }
}

// Handle callback queries (button clicks)
async function handleCallbackQuery(callbackQuery, token) {
  const callbackQueryId = callbackQuery.id
  const chatId = callbackQuery.message.chat.id
  const messageId = callbackQuery.message.message_id
  const data = callbackQuery.data || ''

  // Format: f:source:experience:country
  if (!data.startsWith('f:')) {
    return
  }

  const parts = data.split(':')
  const source = parts[1] || ''
  const exp = parts[2] || ''
  const country = parts[3] || ''

  // Acknowledge the callback query so loading indicator disappears in Telegram
  await postToTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId }, token)

  if (!source) {
    // Should select source
    await sendSourceSelection(chatId, token, messageId)
  } else if (!exp) {
    // Should select experience
    await sendExperienceSelection(chatId, source, token, messageId)
  } else if (!country) {
    // Should select country
    await sendCountrySelection(chatId, source, exp, token, messageId)
  } else {
    // Final state: Fetch and display filtered jobs!
    await sendFilteredJobs(chatId, source, exp, country, token, messageId)
  }
}

// Screen 1: Select Source
async function sendSourceSelection(chatId, token, messageId = null) {
  const text = '🔍 <b>Step 1: Choose a Job Source</b>\nSelect which job board API or official portal you want to query:'
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🟢 Greenhouse', callback_data: 'f:greenhouse::' },
        { text: '🔵 Lever', callback_data: 'f:lever::' }
      ],
      [
        { text: '🟣 Ashby', callback_data: 'f:ashby::' },
        { text: '🟠 SmartRecruiters', callback_data: 'f:smartrecruiters::' }
      ],
      [
        { text: '🏢 Workday', callback_data: 'f:workday::' },
        { text: '💻 Microsoft', callback_data: 'f:microsoft::' }
      ],
      [
        { text: '🌐 Official Portals', callback_data: 'f:generic::' },
        { text: '✨ All Sources', callback_data: 'f:all::' }
      ]
    ]
  }

  if (messageId) {
    await postToTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }, token)
  } else {
    await postToTelegram('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }, token)
  }
}

// Screen 2: Select Experience
async function sendExperienceSelection(chatId, source, token, messageId) {
  const text = `💼 <b>Step 2: Experience Level</b>\nChoose the experience criteria for your job search:`
  const keyboard = {
    inline_keyboard: [
      [
        { text: '👶 Entry-Level (0-2 Yrs)', callback_data: `f:${source}:entry:` },
        { text: '🧑 Mid-Level (2-5 Yrs)', callback_data: `f:${source}:mid:` }
      ],
      [
        { text: '🧓 Senior (5+ Yrs)', callback_data: `f:${source}:sr:` },
        { text: '✨ Any Experience', callback_data: `f:${source}:any:` }
      ],
      [
        { text: '⬅️ Back to Sources', callback_data: 'f:::' }
      ]
    ]
  }

  await postToTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: keyboard
  }, token)
}

// Screen 3: Select Country
async function sendCountrySelection(chatId, source, exp, token, messageId) {
  const text = `📍 <b>Step 3: Location / Country</b>\nSelect your target country for job openings:`
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇮🇳 India', callback_data: `f:${source}:${exp}:in` },
        { text: '🇺🇸 United States', callback_data: `f:${source}:${exp}:us` }
      ],
      [
        { text: '🌍 Any Country', callback_data: `f:${source}:${exp}:any` }
      ],
      [
        { text: '⬅️ Back to Experience', callback_data: `f:${source}::` }
      ]
    ]
  }

  await postToTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: keyboard
  }, token)
}

// Screen 4: Fetch and Display Results
async function sendFilteredJobs(chatId, source, exp, country, token, messageId) {
  // Show a "loading..." message
  await postToTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: '⏳ <i>Fetching and filtering latest jobs... Please wait.</i>',
    parse_mode: 'HTML'
  }, token)

  try {
    const gitUser = process.env.GITHUB_USERNAME || 'kaustubh0777'
    const gitRepo = process.env.GITHUB_REPO || 'jobs_apply'
    const jobsUrl = `https://raw.githubusercontent.com/${gitUser}/${gitRepo}/main/src/data/jobs.json`

    const response = await fetch(jobsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs.json: ${response.statusText}`)
    }

    const data = await response.json()
    const allJobs = data.jobs || []

    // Filter logic
    const filteredJobs = allJobs.filter(job => {
      // 1. Source check
      if (source !== 'all') {
        const sourceLower = (job.source || '').toLowerCase()
        const idLower = (job.id || '').toLowerCase()
        
        if (source === 'greenhouse' && !sourceLower.includes('greenhouse') && !idLower.startsWith('greenhouse')) return false
        if (source === 'lever' && !sourceLower.includes('lever') && !idLower.startsWith('lever')) return false
        if (source === 'ashby' && !sourceLower.includes('ashby') && !idLower.startsWith('ashby')) return false
        if (source === 'smartrecruiters' && !sourceLower.includes('smart') && !idLower.startsWith('smartrecruiters')) return false
        if (source === 'workday' && !sourceLower.includes('workday') && !idLower.startsWith('workday')) return false
        if (source === 'microsoft' && !sourceLower.includes('microsoft') && !idLower.startsWith('official-microsoft')) return false
        if (source === 'generic' && !sourceLower.includes('official') && !sourceLower.includes('generic')) return false
      }

      // 2. Experience check
      if (exp !== 'any') {
        const minExp = job.experienceMin === null || job.experienceMin === undefined ? 0 : job.experienceMin
        if (exp === 'entry' && minExp > 2) return false
        if (exp === 'mid' && (minExp <= 2 || minExp > 5)) return false
        if (exp === 'sr' && minExp <= 5) return false
      }

      // 3. Country check
      if (country !== 'any') {
        const cLower = (job.country || '').toLowerCase()
        const locLower = (job.location || '').toLowerCase()
        if (country === 'in' && cLower !== 'india' && !locLower.includes('india')) return false
        if (country === 'us' && cLower !== 'united states' && cLower !== 'us' && !locLower.includes('us') && !locLower.includes('usa')) return false
      }

      return true
    })

    console.log(`[Webhook] Filters: source=${source}, exp=${exp}, country=${country}. Found ${filteredJobs.length} matches.`)

    // Format output
    let messageText = `✅ <b>Search Results</b>\n`
    messageText += `Filters: <code>source:${source}</code> | <code>exp:${exp}</code> | <code>country:${country}</code>\n`
    messageText += `Found <b>${filteredJobs.length}</b> matches.\n\n`

    if (filteredJobs.length === 0) {
      messageText += `<i>No SDE jobs found matching these filters. Try broadening your criteria!</i>\n\n`
    } else {
      // Limit to top 8 jobs to fit message bounds
      const displayCount = Math.min(filteredJobs.length, 8)
      for (let i = 0; i < displayCount; i++) {
        const job = filteredJobs[i]
        const role = job.role || 'Software Engineer'
        const company = job.company || 'Unknown Company'
        const location = job.location || 'Not Specified'
        const expLabel = job.experienceLabel || job.experienceSource || 'Not Specified'
        const applyUrl = job.directApplyUrl || job.url || '#'

        messageText += `<b>${i + 1}. ${escapeHtml(role)}</b> at <b>${escapeHtml(company)}</b>\n`
        messageText += `📍 <i>${escapeHtml(location)}</i> | 💼 <i>Exp: ${escapeHtml(expLabel)}</i>\n`
        messageText += `🔗 <a href="${applyUrl}">Apply Here</a>\n\n`
      }

      if (filteredJobs.length > displayCount) {
        messageText += `<i>...and ${filteredJobs.length - displayCount} more jobs matching these filters.</i>\n\n`
      }
    }

    const resetKeyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Search Again', callback_data: 'f:::' }
        ]
      ]
    }

    // Edit the loading message with the results
    await postToTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: messageText,
      parse_mode: 'HTML',
      reply_markup: resetKeyboard,
      disable_web_page_preview: true
    }, token)

  } catch (error) {
    console.error('Error fetching/filtering jobs database:', error)
    await postToTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: `❌ <b>Error fetching jobs database.</b>\nDetail: <code>${escapeHtml(error.message)}</code>\n\nMake sure your GitHub username and repository secrets are correct.`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Try Again', callback_data: 'f:::' }]]
      }
    }, token)
  }
}

// General function to talk to Telegram Bot API
async function postToTelegram(method, payload, token) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.text()
      console.error(`[Telegram Webhook Error] API ${method} failed:`, response.status, err)
    }
  } catch (err) {
    console.error(`[Telegram Webhook Error] Failed to post:`, err.message)
  }
}
