import { expect, test } from '@playwright/test'
import { mockAuthenticatedSupabase } from './support/mockSupabase'

test.use({ storageState: { cookies: [], origins: [] } })

test('admin vê dashboard, gráficos e menu administrativo', async ({ page }) => {
  await mockAuthenticatedSupabase(page, 'admin')
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fluxo de caixa por vencimento' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gasto por fatura' })).toBeVisible()
  await expect(page.locator('.recharts-responsive-container')).toHaveCount(2)
  expect(await page.locator('svg.recharts-surface').count()).toBeGreaterThanOrEqual(2)
  await expect(page.getByRole('link', { name: 'Usuários' })).toBeVisible()
})

test('viewer vê os relatórios sem receber controles administrativos', async ({ page }) => {
  await mockAuthenticatedSupabase(page, 'viewer')
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.locator('.recharts-responsive-container')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0)
})

test('admin administra plano por empresa e classifica consórcio como patrimonial', async ({ page }) => {
  await mockAuthenticatedSupabase(page, 'admin')
  await page.goto('/plano-de-contas')

  await expect(page.getByRole('heading', { name: 'Plano de Contas' })).toBeVisible()
  await expect(page.getByText('Patrimonial', { exact: true })).toBeVisible()
  await expect(page.getByText('RB7 DIGITAL', { exact: true })).toBeVisible()

  await page.goto('/pagar')
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  const tratamento = page.getByLabel('Tratamento contábil *')
  await expect(tratamento).toBeVisible()
  await expect(tratamento.locator('optgroup[label="Patrimonial — não entra na DRE"]')).toHaveCount(1)
  await tratamento.selectOption('coa-consorcio')
  await expect(tratamento).toHaveValue('coa-consorcio')
  await expect(page.getByText(/taxa administrativa/i)).toBeVisible()
})

test('custo por obra evidencia quando falta a conta que pagou', async ({ page }) => {
  await mockAuthenticatedSupabase(page, 'admin')
  await page.goto('/custo-por-obra')

  await expect(page.getByRole('heading', { name: 'Custo por Obra' })).toBeVisible()
  await expect(page.getByText('Sem conta de pagamento', { exact: true })).toBeVisible()
  await expect(page.getByText('Contrapartida do Balanço ainda incompleta')).toBeVisible()
  await expect(page.getByText('MATERIAL CASAS ALFENAS')).toBeVisible()
  await expect(page.getByText('sem conta', { exact: true })).toBeVisible()
})
