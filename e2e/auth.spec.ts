import { expect, test } from '@playwright/test'

test.describe('painel autenticado de homologação', () => {
  test('cadastra um paciente no painel autenticado de homologação', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.online')).toContainText('Operador')
    await page.getByRole('button', { name: '+ Novo paciente' }).click()

    await page.getByLabel('Nome completo').fill('Paciente E2E')
    await page.getByLabel('Enfermaria').fill('5A')
    await page.getByLabel('Leito').fill('501-A')
    await page.getByRole('button', { name: 'Salvar paciente' }).click()

    await expect(page.getByRole('heading', { name: 'Paciente E2E' })).toBeVisible()
    await expect(page.locator('.toast')).toContainText('Paciente cadastrado')
  })

  test('salva dieta vigente e registra nova liberação no modal', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Atualizar dieta' }).click()
    await expect(page.getByRole('dialog', { name: 'Prescrição de dieta' })).toBeVisible()
    await page.getByLabel('Dieta vigente').fill('B')
    await page.getByLabel('Solicitante').fill('Nutrição E2E')
    await page.getByRole('button', { name: 'Salvar prescrição' }).click()
    await expect(page.locator('.toast')).toContainText('Prescrição de dieta atualizada')

    await page.getByRole('button', { name: '+ Nova liberação' }).click()
    await expect(page.getByRole('dialog', { name: 'Nova liberação' })).toBeVisible()
    await page.getByLabel('Solicitante').fill('Nutrição E2E')
    await page.getByRole('button', { name: 'Registrar liberação' }).click()
    await expect(page.locator('.toast')).toContainText('Liberação registrada')
  })

  test('prepara três etiquetas 70x40mm para lanche reforçado de acompanhante', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '+ Nova liberação' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nova liberação' })
    await dialog.getByLabel('Refeição').selectOption({ label: 'Lanche Reforçado' })
    await dialog.getByLabel('Destino').selectOption('companion')
    await dialog.getByLabel('Solicitante').fill('Nutrição E2E')
    await dialog.getByRole('button', { name: 'Registrar liberação' }).click()

    const releaseRecord = page.locator('.records').nth(2).locator('.record').first()
    await expect(releaseRecord).toContainText('Acompanhante')
    await expect(releaseRecord).toContainText('Pendente')
  })

  test('marca a liberação como impressa somente após abrir a janela de impressão', async ({ page }) => {
    await page.goto('/')
    const releaseRecord = page.locator('.records').filter({ hasText: 'Liberações de hoje' }).locator('.record').first()
    page.once('dialog', (dialog) => dialog.accept())
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      releaseRecord.getByRole('button', { name: 'Imprimir', exact: true }).click(),
    ])
    await expect(popup).toHaveTitle('Etiquetas pendentes')
    await popup.close()
    await expect(releaseRecord).toContainText('Impresso')
  })

  test('filtra pacientes na barra lateral e abre o paciente no painel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Pacientes', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Filtros de pacientes' })).toBeVisible()
    const patientCard = page.locator('.patient-list-card').first()
    const patientName = await patientCard.locator('strong').innerText()
    await patientCard.click()
    await expect(page.locator('.patienthead h1')).toHaveText(patientName)
  })

  test('abre o relatório completo para salvar em PDF', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Exportar PDF', exact: true }).click(),
    ])
    await expect(popup).toHaveTitle(/Relatorio operacional/)
    await expect(popup.locator('body')).toContainText('Liberacoes detalhadas')
    await popup.close()
  })

  test('confirma e persiste a ação de zerar dieta', async ({ page }) => {
    await page.goto('/')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Zerar dieta', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('Dieta zerada')
    await expect(page.locator('.details')).toContainText('Não informada')
  })

  test('persiste dieta e transferência após recarregar a página', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Dados do paciente', exact: true }).click()
    await page.getByText('B', { exact: true }).click()
    await page.getByRole('button', { name: 'Salvar paciente', exact: true }).click()
    await expect(page.locator('.details')).toContainText('B')

    await page.getByRole('button', { name: 'Transferir', exact: true }).click()
    const transferDialog = page.getByRole('dialog', { name: 'Transferir paciente' })
    await transferDialog.getByLabel('Enfermaria').fill('9Z')
    await transferDialog.getByLabel('Leito').fill('901')
    await transferDialog.getByRole('button', { name: 'Confirmar transferência' }).click()
    await expect(page.locator('.patienthead')).toContainText('9Z')
    await page.reload()
    await expect(page.locator('.patienthead')).toContainText('9Z')
    await expect(page.locator('.details')).toContainText('B')
  })
})
