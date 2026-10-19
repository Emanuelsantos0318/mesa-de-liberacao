import { chromium } from 'playwright'

const appUrl = process.env.APP_URL || 'http://localhost:5174'
const email = process.env.SUPABASE_TEST_EMAIL
const password = process.env.SUPABASE_TEST_PASSWORD

if (!email || !password) {
  throw new Error('Defina SUPABASE_TEST_EMAIL e SUPABASE_TEST_PASSWORD somente para homologação.')
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.waitForSelector('text=LBGS', { timeout: 20000 })
  await page.getByRole('button', { name: '+ Novo paciente' }).click()

  await page.getByLabel('Nome completo').fill('Paciente Cenário Real')
  await page.getByLabel('Prontuário').fill('CR-1001')
  await page.getByLabel('Enfermaria').fill('3A')
  await page.getByLabel('Ala / setor').fill('Clínica médica')
  await page.getByLabel('Leito').fill('301-A')
  await page.getByRole('button', { name: 'Salvar paciente' }).click()

  await page.waitForSelector('text=Paciente Cenário Real', { timeout: 20000 })

  await page.getByRole('button', { name: '+ Nova liberação' }).click()
  await page.getByLabel('Horário de saída').fill('11:30')
  await page.getByLabel('Solicitante').fill('Enf. Joana')
  await page.getByLabel('Observações').fill('Paciente em cenário real de liberação')
  await page.getByRole('button', { name: 'Registrar liberação' }).click()

  await page.waitForSelector('text=11:30', { timeout: 20000 })
  console.log('SCENARIO_OK: login, cadastro do paciente e liberação concluídos com sucesso.')
} catch (error) {
  console.error('SCENARIO_ERROR:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await browser.close()
}
