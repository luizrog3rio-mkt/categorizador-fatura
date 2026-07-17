import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { from: mocks.from },
}))

import { importarExtratoOFX } from './importarExtrato'

const arquivo = (conteudo: string) =>
  new File([conteudo], 'extrato.ofx', { type: 'application/x-ofx' })

const tx = (fitid = '', valor = '-10.50', memo = 'TARIFA') => `
<STMTTRN>
  <TRNTYPE>DEBIT
  <DTPOSTED>20260715120000[-3:BRT]
  <TRNAMT>${valor}
  ${fitid ? `<FITID>${fitid}` : ''}
  <MEMO>${memo}
</STMTTRN>`

describe('importarExtratoOFX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ upsert: mocks.upsert })
    mocks.upsert.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'nova-1' }], error: null }),
    })
  })

  it('barra arquivo vazio antes de consultar o banco', async () => {
    const resultado = await importarExtratoOFX(arquivo('OFXHEADER:100'), 'conta-1')

    expect(resultado.ok).toBeNull()
    expect(resultado.erro).toContain('Nenhuma transação')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('gera FITIDs sintéticos determinísticos sem perder linhas idênticas', async () => {
    const resultado = await importarExtratoOFX(arquivo(tx() + tx()), 'conta-1')

    const linhas = mocks.upsert.mock.calls[0][0]
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({
      account_id: 'conta-1',
      fit_id: 'syn:2026-07-15:-10.50:TARIFA',
      amount: -10.5,
    })
    expect(linhas[1].fit_id).toBe('syn:2026-07-15:-10.50:TARIFA#2')
    expect(mocks.upsert).toHaveBeenCalledWith(linhas, {
      onConflict: 'account_id,fit_id',
      ignoreDuplicates: true,
    })
    expect(resultado.ok).toMatchObject({ total: 2, novas: 1, duplicadas: 1, semFitid: 2 })
  })

  it('preserva FITID do banco e devolve erro de persistência', async () => {
    mocks.upsert.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS bloqueou' } }),
    })

    const resultado = await importarExtratoOFX(arquivo(tx('FIT-123')), 'conta-1')

    expect(mocks.upsert.mock.calls[0][0][0].fit_id).toBe('FIT-123')
    expect(resultado).toEqual({ ok: null, erro: 'Erro ao importar: RLS bloqueou' })
  })
})
