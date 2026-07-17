import { describe, expect, it } from 'vitest'
import { REGRA_VAZIA, regraParaForm, type RegraDB } from './regra'

describe('regraParaForm', () => {
  it('converte null do banco em campos vazios editáveis', () => {
    const regra: RegraDB = {
      id: 'regra-1',
      src_value: null,
      src_match: 'exact',
      sck_value: null,
      sck_match: 'contains',
      xcode_value: null,
      xcode_match: 'starts_with',
      afiliado_value: null,
      afiliado_match: 'is_empty',
      group_id: null,
      seller_id: null,
    }

    expect(regraParaForm(regra)).toEqual({
      src_value: '', src_match: 'exact',
      sck_value: '', sck_match: 'contains',
      xcode_value: '', xcode_match: 'starts_with',
      afiliado_value: '', afiliado_match: 'is_empty',
      group_id: '', seller_id: '',
    })
  })

  it('preserva condições e destinos existentes', () => {
    const regra: RegraDB = {
      id: 'regra-2',
      src_value: 'instagram', src_match: 'contains',
      sck_value: 'luiz', sck_match: 'starts_with',
      xcode_value: 'X-1', xcode_match: 'exact',
      afiliado_value: 'Pessoa', afiliado_match: 'exact',
      group_id: 'grupo-1', seller_id: 'seller-1',
    }

    expect(regraParaForm(regra)).toMatchObject({
      src_value: 'instagram', sck_value: 'luiz', xcode_value: 'X-1',
      afiliado_value: 'Pessoa', group_id: 'grupo-1', seller_id: 'seller-1',
    })
  })
})

describe('REGRA_VAZIA', () => {
  it('nasce sem condição ou destino e com match exato', () => {
    expect(REGRA_VAZIA).toMatchObject({
      src_value: '', src_match: 'exact',
      sck_value: '', sck_match: 'exact',
      xcode_value: '', xcode_match: 'exact',
      afiliado_value: '', afiliado_match: 'exact',
      group_id: '', seller_id: '',
    })
  })
})
