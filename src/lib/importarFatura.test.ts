import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  single: vi.fn(),
  insertInvoice: vi.fn(),
  insertTransactions: vi.fn(),
  updateEq: vi.fn(),
  updateInvoice: vi.fn(),
  purchaseOrder2: vi.fn(),
  purchaseOrder1: vi.fn(),
  purchaseIs: vi.fn(),
  purchaseSelect: vi.fn(),
  upload: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: () => ({ upload: mocks.upload }) },
  },
}))

import { importarFaturaOFX } from './importarFatura'

const arquivo = (conteudo: string) =>
  new File([conteudo], 'Fatura Julho.ofx', { type: 'application/x-ofx' })

const tx = (tipo: 'DEBIT' | 'CREDIT', valor: string, fitid: string, memo: string) => `
<STMTTRN>
  <TRNTYPE>${tipo}
  <DTPOSTED>20260715
  <TRNAMT>${valor}
  <FITID>${fitid}
  <MEMO>${memo}
</STMTTRN>`

describe('importarFaturaOFX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertInvoice.mockReturnValue({ select: () => ({ single: mocks.single }) })
    mocks.updateInvoice.mockReturnValue({ eq: mocks.updateEq })
    mocks.purchaseOrder1.mockReturnValue({ order: mocks.purchaseOrder2 })
    mocks.purchaseIs.mockReturnValue({ order: mocks.purchaseOrder1 })
    mocks.purchaseSelect.mockReturnValue({ is: mocks.purchaseIs })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'invoices') return { insert: mocks.insertInvoice, update: mocks.updateInvoice }
      if (table === 'transactions') return { insert: mocks.insertTransactions }
      if (table === 'purchase_items') return { select: mocks.purchaseSelect }
      throw new Error(`Tabela inesperada no teste: ${table}`)
    })
    mocks.single.mockResolvedValue({
      data: { id: 'fatura-1', name: 'Fatura Julho', total: 0, ofx_path: null },
      error: null,
    })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.insertTransactions.mockResolvedValue({ error: null })
    mocks.purchaseOrder2.mockResolvedValue({ data: [], error: null })
  })

  it('barra OFX vazio sem criar fatura', async () => {
    const resultado = await importarFaturaOFX(arquivo('OFXHEADER:100'), 'user-1', 'cartao-1')

    expect(resultado.ok).toBeNull()
    expect(resultado.erro).toContain('Nenhum lançamento')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('soma débito e abate crédito, persistindo o kind de cada linha', async () => {
    const conteudo =
      tx('DEBIT', '-100.10', 'D-1', 'COMPRA') +
      tx('CREDIT', '20.05', 'C-1', 'ESTORNO')

    const resultado = await importarFaturaOFX(arquivo(conteudo), 'user-1', 'cartao-1')

    expect(mocks.insertInvoice).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      account_id: 'cartao-1',
      name: 'Fatura Julho',
      total: 80.05,
      transaction_count: 2,
    }))
    expect(mocks.insertTransactions).toHaveBeenCalledWith([
      expect.objectContaining({ fit_id: 'D-1', amount: 100.1, kind: 'debit' }),
      expect.objectContaining({ fit_id: 'C-1', amount: 20.05, kind: 'credit' }),
    ])
    expect(resultado.erro).toBeNull()
    expect(resultado.ok?.invoice.ofx_path).toBe('fatura-1/Fatura Julho.ofx')
  })

  it('reporta falha ao criar a fatura e não tenta inserir lançamentos', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'sem permissão' } })

    const resultado = await importarFaturaOFX(
      arquivo(tx('DEBIT', '-100', 'D-1', 'COMPRA')),
      'user-1',
      'cartao-1',
    )

    expect(resultado).toEqual({ ok: null, erro: 'Erro ao criar a fatura: sem permissão' })
    expect(mocks.insertTransactions).not.toHaveBeenCalled()
  })
})
