const { spawn } = require('node:child_process')

const port = 4173
const baseUrl = `http://127.0.0.1:${port}`
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_SUPABASE_ANON_KEY: '', VITE_E2E_MODE: 'true' },
})

const stop = () => {
  if (!vite.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' })
  } else {
    vite.kill('SIGTERM')
  }
}

const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Servidor E2E não iniciou em ${baseUrl}`)
}

const run = async () => {
  await waitForServer()
  const result = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
    stdio: ['inherit', 'pipe', 'inherit'],
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
  })
  let summaryHandled = false
  result.stdout.on('data', (chunk) => {
    const output = chunk.toString()
    process.stdout.write(output)
    if (summaryHandled || (!/\b\d+ passed\b/.test(output) && !/\b\d+ failed\b/.test(output))) return
    summaryHandled = true
    const exitCode = /\b\d+ failed\b/.test(output) ? 1 : 0
    setTimeout(() => {
      stop()
      if (!result.killed) result.kill()
      process.exit(exitCode)
    }, 100)
  })
  result.on('exit', (code, signal) => {
    if (summaryHandled) return
    stop()
    process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0
  })
}

run().catch((error) => {
  console.error(error)
  stop()
  process.exitCode = 1
})

process.on('SIGINT', () => { stop(); process.exitCode = 130 })
process.on('SIGTERM', () => { stop(); process.exitCode = 143 })
