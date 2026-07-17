import type { Page, Route } from '@playwright/test'

type Role = 'admin' | 'viewer'

const apiOrigin = 'http://127.0.0.1:54321'

function isoDate(monthOffset = 0): string {
  const date = new Date()
  date.setMonth(date.getMonth() + monthOffset, 10)
  return date.toISOString().slice(0, 10)
}

function json(route: Route, body: unknown, headers: Record<string, string> = {}) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  })
}

export async function mockAuthenticatedSupabase(page: Page, role: Role): Promise<void> {
  const userId = `user-${role}`
  const now = new Date().toISOString()

  await page.addInitScript(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    {
      storageKey: 'sb-127-auth-token',
      session: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: `${role}@example.test`,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: now,
        },
      },
    },
  )

  await page.route(`${apiOrigin}/**`, async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.endsWith('/profiles')) {
      return json(route, { id: userId, email: `${role}@example.test`, role, created_at: now })
    }
    if (path.endsWith('/companies')) {
      return json(route, [{ id: 'company-1', name: 'RB7 DIGITAL', cnpj: null, created_at: now }])
    }
    if (path.endsWith('/purchase_items')) {
      return json(route, [], { 'content-range': '0-0/0' })
    }
    if (path.endsWith('/accounts')) {
      return json(route, [{
        id: 'account-1', company_id: 'company-1', name: 'Conta Corrente', type: 'checking',
        bank: 'Sicoob', initial_balance: 0, counterparty_company_id: null,
        statement_closing_day: null, due_day: null, active: true, created_at: now,
      }])
    }
    if (path.endsWith('/chart_of_accounts')) {
      return json(route, [
        {
          id: 'coa-result', code: '6.3.01', name: 'Aluguel / Condomínio', parent_id: null,
          company_id: null, tipo: 'resultado', nature: 'fixed_cost', redutora: false,
          is_analytical: true, sort_order: 6_003_001, active: true,
          rateio_por_produto: false, dre_product_id: null, parent: null,
        },
        {
          id: 'coa-consorcio', code: '1.2.01', name: 'Consórcio a Contemplar', parent_id: null,
          company_id: 'company-1', tipo: 'patrimonial', nature: 'asset', redutora: false,
          is_analytical: true, sort_order: 1_002_001, active: true,
          rateio_por_produto: false, dre_product_id: null, parent: null,
        },
      ])
    }
    if (path.endsWith('/dre_products') || path.endsWith('/closed_periods') || path.endsWith('/user_table_prefs')) {
      return json(route, [])
    }
    if (path.endsWith('/entries_atrasados')) return json(route, 0)
    if (path.endsWith('/hotmart_totals')) {
      return json(route, [{ liquido: 125_000, fora_moeda: 0 }])
    }
    if (path.endsWith('/entries')) {
      return json(route, [
        {
          id: 'entry-receivable', company_id: 'company-1', account_id: null,
          type: 'receivable', description: 'Receita teste', amount: 80_000,
          interest_amount: 0, fine_amount: 0, discount_amount: 0,
          issue_date: isoDate(), due_date: isoDate(), payment_date: null,
          status: 'to_pay', counterparty: null, notes: null, is_recurring: false,
          recurrence_day: null, invoice_account_id: null, invoice_month: null,
          created_by: userId, created_at: now, updated_at: now, transfer_id: null,
        },
        {
          id: 'entry-payable', company_id: 'company-1', account_id: null,
          type: 'payable', description: 'Despesa teste', amount: 35_000,
          interest_amount: 0, fine_amount: 0, discount_amount: 0,
          issue_date: isoDate(1), due_date: isoDate(1), payment_date: null,
          status: 'to_pay', counterparty: null, notes: null, is_recurring: false,
          recurrence_day: null, invoice_account_id: null, invoice_month: null,
          created_by: userId, created_at: now, updated_at: now, transfer_id: null,
        },
      ])
    }
    if (path.endsWith('/hotmart_sales')) {
      return json(route, [{ transaction_code: 'MOCK-1', sale_date: isoDate(), status: 'APPROVED' }])
    }
    if (path.endsWith('/invoices')) {
      return json(route, [{
        id: 'invoice-1', name: 'Fatura teste', total: 12_345,
        account_id: 'account-1', imported_at: now,
        account: { company_id: 'company-1' },
      }])
    }
    if (path.endsWith('/transactions')) {
      return json(route, [], { 'content-range': '0-2/3' })
    }

    return json(route, [])
  })
}
