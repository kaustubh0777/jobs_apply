import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'

let updaterProcess: ChildProcess | null = null

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'add-company-api',
      configureServer(server) {
        const startUpdater = () => {
          if (process.env.AUTO_UPDATE_JOBS === '0' || updaterProcess) return
          updaterProcess = spawn('node', ['scripts/auto-update-jobs.mjs'], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              JOB_UPDATE_INTERVAL_MS: process.env.JOB_UPDATE_INTERVAL_MS || String(30 * 60 * 1000),
              WEB_DISCOVERY_BATCH_SIZE: process.env.WEB_DISCOVERY_BATCH_SIZE || '40',
              WEB_DISCOVERY_CONCURRENCY: process.env.WEB_DISCOVERY_CONCURRENCY || '12',
              WEB_DISCOVERY_TIMEOUT_MS: process.env.WEB_DISCOVERY_TIMEOUT_MS || '2500',
              WEB_DISCOVERY_COMPANY_TIMEOUT_MS: process.env.WEB_DISCOVERY_COMPANY_TIMEOUT_MS || '9000',
              WEB_DISCOVERY_MAX_DOMAINS: process.env.WEB_DISCOVERY_MAX_DOMAINS || '5',
              WEB_DISCOVERY_MAX_PATHS: process.env.WEB_DISCOVERY_MAX_PATHS || '4',
              WEB_DISCOVERY_USE_SEARCH: process.env.WEB_DISCOVERY_USE_SEARCH || '0',
              GENERIC_BATCH_SIZE: process.env.GENERIC_BATCH_SIZE || '50',
              GENERIC_USE_BROWSER: process.env.GENERIC_USE_BROWSER || '0',
            },
            stdio: ['ignore', 'inherit', 'inherit'],
          })
          updaterProcess.on('exit', () => {
            updaterProcess = null
          })
        }

        startUpdater()
        server.httpServer?.once('close', () => {
          updaterProcess?.kill('SIGTERM')
          updaterProcess = null
        })

        server.middlewares.use((req, res, next) => {
          if (req.method === 'GET' && req.url?.startsWith('/api/update-status')) {
            try {
              const statusPath = path.resolve('src/data/update-status.json')
              const status = fs.existsSync(statusPath)
                ? JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
                : { state: 'unknown' }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...status, updaterRunning: Boolean(updaterProcess) }))
            } catch (e) {
              const err = e as Error
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ state: 'error', error: err.message, updaterRunning: Boolean(updaterProcess) }))
            }
            return
          }

          if (req.method === 'POST' && req.url === '/api/add-company') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const newCompany = JSON.parse(body)
                const catalogPath = path.resolve('src/data/company-catalog.json')
                const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
                
                const existingIndex = catalog.companies.findIndex(
                  (c: { name: string }) => c.name.toLowerCase() === newCompany.name.toLowerCase()
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

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true, catalog }))
              } catch (e) {
                const err = e as Error
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, error: err.message }))
              }
            })
          } else {
            next()
          }
        })
      },
    },
  ],
})
