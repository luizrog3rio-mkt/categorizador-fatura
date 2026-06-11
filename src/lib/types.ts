// ── Enums das tabelas novas (Fase 1c, schema EN) ─────────────────────────────
export type EntryType = 'payable' | 'receivable'
export type EntryStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'
export type AccountType = 'checking' | 'credit_card' | 'inter_company'

// ── Tabelas novas (EN) ───────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string | null
  role: 'admin' | 'viewer'
  created_at: string | null
}

export interface Company {
  id: string
  name: string
  cnpj: string | null
  created_at: string
}

export interface Account {
  id: string
  company_id: string
  name: string
  type: AccountType
  bank: string | null
  initial_balance: number
  counterparty_company_id: string | null
  statement_closing_day: number | null
  due_day: number | null
  active: boolean
  created_at: string
}

export interface Entry {
  id: string
  company_id: string
  account_id: string | null
  category_id: string | null
  type: EntryType
  description: string
  amount: number
  issue_date: string
  due_date: string
  payment_date: string | null
  status: EntryStatus
  counterparty: string | null
  notes: string | null
  invoice_account_id: string | null
  invoice_month: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // embeds opcionais (select com join)
  category?: Category | null
  account?: Account | null
}

export interface BankTransaction {
  id: string
  account_id: string
  fit_id: string
  date: string
  amount: number // COM sinal (despesa negativa)
  memo: string | null
  tx_type: string | null
  category_id: string | null
  entry_id: string | null
  invoice_id: string | null
  auto_categorized: boolean
  imported_at: string
  category?: Category | null
}

export interface HotmartSale {
  id: string
  company_id: string
  transaction_code: string
  product: string
  sale_date: string
  release_date: string | null
  currency: string       // moeda da venda (price.currency_code — ex.: 'BRL', 'USD')
  total_amount: number   // total pago pelo comprador (price.value — inclui juros de parcelamento)
  gross_amount: number   // bruto: preço base do produto (hotmart_fee.base — sem juros de parcelamento)
  hotmart_fee: number
  fee_percentage: number | null  // % cobrada pela Hotmart (hotmart_fee.percentage)
  installments: number | null    // nº de parcelas (payment.installments_number; 1 = à vista)
  affiliate_commission: number
  coproduction_commission: number
  net_amount: number
  affiliate: string | null
  coproducer: string | null
  payment_method: string | null
  status: string
  buyer: string | null
  imported_at: string
}

// ── Tabelas vivas (modelo PT do app original; categoria como TEXTO é decisão
//    de design — Fase 3 auditou e manteve: dado íntegro, sem FK) ──

export interface Category {
  id: string
  user_id: string
  name: string
  color_index: number
  created_at: string | null
}

export interface AutoRule {
  id: string
  user_id: string
  keywords: string[]
  category: string // nome da categoria (texto por design; Fase 3 manteve)
  created_at: string | null
}

export interface Invoice {
  id: string
  user_id: string
  name: string | null
  total: number | null
  transaction_count: number | null
  imported_at: string | null
  account_id: string | null // Fase 1c; preencher nos imports novos
}

export interface Transaction {
  id: string
  user_id: string
  invoice_id: string | null
  fit_id: string | null // NÃO é único (Sicoob repete entre parcelas/faturas)
  memo: string
  amount: number // sempre positivo no modelo vivo (despesa de cartão)
  date: string // 'DD/MM/YYYY' em texto (formato vivo; Fase 3 manteve)
  category: string | null // nome da categoria (texto livre)
  auto_categorized: boolean | null
  created_at: string | null
}

export interface PurchaseItem {
  id: string
  user_id: string
  invoice_id: string | null // null = pendente (aguardando próxima fatura)
  description: string
  amount: number | null
  category: string | null
  month: string | null
  purchase_date: string | null
  payment_method: string | null
  created_at: string | null
}

export interface PurchaseCategory {
  id: string
  user_id: string
  name: string
  color_index: number
  created_at: string | null
}
