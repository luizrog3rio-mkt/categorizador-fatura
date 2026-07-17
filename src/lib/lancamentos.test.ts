import { describe, expect, it } from 'vitest'
import {
  avancarUmMes,
  contaCompativelComCartao,
  contaCompativelComLancamento,
  contaDisponivelParaEmpresa,
  mapearColunasImportacao,
  parseDataPlanilha,
  parseValorPlanilha,
  tributoSobreVendaMencionado,
} from './lancamentos'
import type { ChartOfAccount } from './types'

const conta = (parcial: Partial<ChartOfAccount>): ChartOfAccount => ({
  id: '1', code: '1.1', name: 'Conta', parent_id: null, company_id: null,
  nature: 'revenue', tipo: 'resultado', redutora: false, is_analytical: true,
  sort_order: 1, active: true, ...parcial,
})

describe('importação de lançamentos', () => {
  it('reconhece competência e conta contábil sem confundir com conta bancária', () => {
    expect(mapearColunasImportacao(['Descrição', 'Competência', 'Conta', 'Conta contábil'])).toEqual({
      description: 0, competency_date: 1, account: 2, chart_of_account: 3,
    })
  })

  it('converte datas e valores brasileiros', () => {
    expect(parseDataPlanilha('31/05/2026')).toBe('2026-05-31')
    expect(parseValorPlanilha('R$ 1.234,56')).toBe(1234.56)
  })
})

describe('recorrência mensal', () => {
  it('mantém o dia-âncora e faz clamp em fevereiro', () => {
    expect(avancarUmMes('2026-01-31', 31)).toBe('2026-02-28')
    expect(avancarUmMes('2026-02-28', 31)).toBe('2026-03-31')
  })

  it('avança emissão e competência pelos próprios dias', () => {
    expect(avancarUmMes('2026-05-15')).toBe('2026-06-15')
    expect(avancarUmMes('2026-05-31')).toBe('2026-06-30')
  })
})

describe('contas contábeis por empresa e finalidade', () => {
  it('aceita compartilhada ou da própria empresa, mas não de outra', () => {
    expect(contaDisponivelParaEmpresa(conta({ company_id: null }), 'empresa-a')).toBe(true)
    expect(contaDisponivelParaEmpresa(conta({ company_id: 'empresa-a' }), 'empresa-a')).toBe(true)
    expect(contaDisponivelParaEmpresa(conta({ company_id: 'empresa-b' }), 'empresa-a')).toBe(false)
  })

  it('impede combinações de resultado que desapareceriam da DRE', () => {
    expect(contaCompativelComLancamento(conta({ nature: 'revenue' }), 'receivable')).toBe(true)
    expect(contaCompativelComLancamento(conta({ nature: 'revenue' }), 'payable')).toBe(false)
    expect(contaCompativelComLancamento(conta({ nature: 'fixed_cost' }), 'payable')).toBe(true)
    expect(contaCompativelComLancamento(conta({ nature: 'fixed_cost' }), 'receivable')).toBe(false)
    expect(contaCompativelComLancamento(conta({ nature: 'deduction' }), 'payable')).toBe(true)
    expect(contaCompativelComLancamento(conta({ nature: 'asset', tipo: 'patrimonial' }), 'payable')).toBe(true)
  })

  it('cartão aceita custos e patrimônio, mas bloqueia receita e dedução invisíveis', () => {
    expect(contaCompativelComCartao(conta({ nature: 'fixed_cost' }))).toBe(true)
    expect(contaCompativelComCartao(conta({ nature: 'deduction' }))).toBe(false)
    expect(contaCompativelComCartao(conta({ nature: 'asset', tipo: 'patrimonial' }))).toBe(true)
  })

  it('identifica os quatro tributos da reunião sem falso positivo por trecho', () => {
    expect(tributoSobreVendaMencionado('Guia PIS / COFINS maio')).toBe('PIS')
    expect(tributoSobreVendaMencionado('ISSQN competência 05/2026')).toBe('ISS')
    expect(tributoSobreVendaMencionado('ICMS')).toBe('ICMS')
    expect(tributoSobreVendaMencionado('Comissão comercial')).toBeNull()
  })
})
