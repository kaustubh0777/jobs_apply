# SDE Jobs Telegram Bot — Webhook Server

Deploy this to **Render.com** (free, no credit card needed) for instant bot responses.

## Deploy Steps

### 1. Create a new Web Service on Render
- Go to https://render.com → New → Web Service
- Connect your GitHub repo: `kaustubh0777/jobs_apply`
- **Root Directory**: `webhook-server`
- **Build Command**: *(leave empty)*
- **Start Command**: `node server.js`
- **Instance Type**: Free

### 2. Set Environment Variables in Render
| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `TELEGRAM_TOKEN_REDACTED` |
| `JOBS_JSON_URL` | `https://raw.githubusercontent.com/kaustubh0777/jobs_apply/main/src/data/jobs.json` |

### 3. Register the Webhook with Telegram
Once Render gives you a URL like `https://sde-jobs-bot.onrender.com`, run:

```
https://api.telegram.org/botTELEGRAM_TOKEN_REDACTED/setWebhook?url=https://YOUR-APP.onrender.com/webhook
```

Open that URL in your browser — done! ✅

### 4. Disable the GitHub Actions bot workflow
Once the webhook is live, disable `.github/workflows/telegram-bot.yml` in GitHub → Actions → Telegram Bot → Disable workflow.
