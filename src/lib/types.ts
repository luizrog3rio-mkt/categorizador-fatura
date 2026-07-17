// ── Enums das tabelas novas (Fase 1c, schema EN) ─────────────────────────────
export type EntryType = 'payable' | 'receivable'
// 'to_pay' = cadastrado, não enviado para pagamento (status inicial)
// 'pending' = enviado para pagamento, aguardando aprovação
// 'paid'    = pago e confirmado
// 'cancelled' = cancelado
// (o valor 'overdue' continua no enum do banco por restrição do Postgres,
//  mas não é mais usado no fluxo — entradas antigas foram migradas para 'to_pay')
export type EntryStatus = 'to_pay' | 'pending' | 'paid' | 'cancelled' | 'refunded'
export type AccountType = 'checking' | 'cash' | 'credit_card' | 'inter_company'
export type ChartAccountType = 'resultado' | 'patrimonial'
export type ChartAccountNature =
  | 'revenue' | 'deduction' | 'variable_cost' | 'fixed_cost' | 'financial' | 'depreciation' | 'tax'
  | 'asset' | 'liability' | 'equity'

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

// retornos das RPCs de saldo (account_balances / account_ledger)
export interface AccountBalance {
  account_id: string
  name: string
  type: AccountType
  initial_balance: number
  movimento: number
  saldo: number
  fonte: 'ofx' | 'entries' | 'inicial'
}

export interface AccountLedgerRow {
  data: string
  descricao: string | null
  amount: number
  saldo_acumulado: number
  fonte: 'ofx' | 'entries'
  origem_id: string
}

export interface Entry {
  id: string
  company_id: string
  account_id: string | null
  type: EntryType
  description: string
  amount: number
  // encargos/desconto do pagamento (magnitude >= 0; default 0). Valor pago/recebido =
  // amount + interest + fine - discount. Sinal de caixa vem do type, como o amount.
  interest_amount: number // juros de mora
  fine_amount: number     // multa
  discount_amount: number // desconto
  issue_date: string | null
  due_date: string
  payment_date: string | null
  status: EntryStatus
  counterparty: string | null
  notes: string | null
  is_recurring: boolean
  recurrence_day: number | null // dia-âncora da série recorrente (1-31); null se não recorrente
  invoice_account_id: string | null
  invoice_month: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  competency_date?: string | null
  chart_of_account_id?: string | null
  dre_product_id?: string | null
  refund_of_entry_id?: string | null
  parent_entry_id?: string | null
  appropriation_month?: number | null
  appropriation_total_months?: number | null
  transfer_id?: string | null // par de lançamentos de uma transferência entre contas
  // embeds opcionais (select com join)
  account?: Account | null
  chart_of_account?: ChartOfAccount | null
  dre_product?: DreProduct | null
}

export interface BankTransaction {
  id: string
  account_id: string
  fit_id: string
  date: string
  amount: number // COM sinal (despesa negativa)
  memo: string | null
  tx_type: string | null
  entry_id: string | null
  invoice_id: string | null
  imported_at: string
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
  sck: string | null            // purchase.tracking.source_sck (vendedor direto / visitor-id / UTM)
  src: string | null            // purchase.tracking.source (canal de origem)
  xcod: string | null           // origin.xcode (webhook-only; a API não traz)
  external_code: string | null  // purchase.tracking.external_code
  imported_at: string
  origem?: string               // derivado pela view: nome do GRUPO (ou 'a_classificar')
  vendedor?: string | null      // derivado pela view: nome do vendedor
  group_id?: string | null      // classificação por venda (hotmart_sale_class)
  seller_id?: string | null     // classificação por venda
}

// Vendedor direto (atribuição por sck, não-afiliado) + de-para sck → vendedor
export interface Seller {
  id: string
  name: string
  code: string | null
  active: boolean
  company_id: string | null
  created_at: string
}

// ── Tabelas vivas do "mundo cartão" (modelo PT do app original) ──

export interface Invoice {
  id: string
  user_id: string
  name: string | null
  total: number | null
  transaction_count: number | null
  imported_at: string | null
  account_id: string | null // Fase 1c; preencher nos imports novos
  ofx_path: string | null // caminho do .ofx no bucket Storage `faturas-ofx` (só imports novos)
}

export interface Transaction {
  id: string
  user_id: string
  invoice_id: string | null
  fit_id: string | null // NÃO é único (Sicoob repete entre parcelas/faturas)
  memo: string
  amount: number // sempre positivo (magnitude); o sinal vem de kind
  date: string // 'DD/MM/YYYY' em texto (formato vivo; Fase 3 manteve)
  kind: 'debit' | 'credit' // débito = despesa; crédito = estorno/desconto (abate o total)
  created_at: string | null
}

export interface PurchaseItem {
  id: string
  user_id: string
  invoice_id: string | null // null = pendente (aguardando próxima fatura)
  description: string
  amount: number | null
  month: string | null
  purchase_date: string | null
  payment_method: string | null
  created_at: string | null
}

export interface ChartOfAccount {
  id: string
  code: string
  name: string
  parent_id: string | null
  company_id: string | null
  tipo: ChartAccountType
  nature: ChartAccountNature
  redutora: boolean
  is_analytical: boolean
  sort_order: number
  active: boolean
  rateio_por_produto?: boolean
  dre_product_id?: string | null // vínculo conta → produto DRE (DRE por produto)
  parent?: ChartOfAccount | null
}

// De-para SKU cru do Hotmart → produto da DRE (dre_products). Usado na DRE por produto.
export interface HotmartProductMap {
  product: string
  dre_product_id: string | null
  updated_at?: string
}

export interface DreProduct {
  id: string
  company_id: string | null
  name: string
  active: boolean
  sort_order: number
  created_at: string
}

export interface EntryInstallment {
  id: string
  entry_id: string
  installment_number: number
  due_date: string
  amount: number
  payment_date: string | null
  status: EntryStatus
  created_at: string
}

export interface ClosedPeriod {
  id: string
  company_id: string
  period: string
  closed_at: string
  closed_by: string | null
}

export interface EntryAuditLog {
  id: string
  entry_id: string
  changed_by: string | null
  changed_at: string
  field_name: string
  old_value: string | null
  new_value: string | null
}

export interface DreRow {
  account_code: string
  account_name: string
  parent_code: string | null
  nature: ChartOfAccount['nature']
  is_analytical: boolean
  sort_order: number
  m1: number; m2: number; m3: number; m4: number; m5: number; m6: number
  m7: number; m8: number; m9: number; m10: number; m11: number; m12: number
  total: number
}

export interface DreCashRow {
  month_num: number
  month_label: string
  dre_receivable: number
  dre_payable: number
  cash_receivable: number
  cash_payable: number
  dre_net: number
  cash_net: number
  difference: number
}
