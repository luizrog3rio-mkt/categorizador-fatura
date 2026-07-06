import { describe, it, expect } from 'vitest'
import { valorEfetivo, emAberto, type EntryValores } from './entries'

const base: EntryValores = {
  amount: 3000,
  interest_amount: 0,
  fine_amount: 0,
  discount_amount: 0,
  status: 'to_pay',
  transfer_id: null,
}

describe('valorEfetivo', () => {
  it('sem encargos é o próprio valor', () => {
    expect(valorEfetivo(base)).toBe(3000)
  })

  it('desconto abate (caso real da fatura: 3000 − 825 = 2175)', () => {
    expect(valorEfetivo({ ...base, discount_amount: 825 })).toBe(2175)
  })

  it('juros e multa somam, desconto abate', () => {
    expect(valorEfetivo({ ...base, interest_amount: 10, fine_amount: 5, discount_amount: 15 })).toBe(3000)
  })

  it('tolera encargos ausentes (linha antiga sem os campos)', () => {
    expect(valorEfetivo({ amount: 100, status: 'to_pay' } as EntryValores)).toBe(100)
  })

  it('aceita valores vindos como string do PostgREST (numeric)', () => {
    expect(valorEfetivo({ ...base, amount: '1000.50' as unknown as number, interest_amount: '0.50' as unknown as number })).toBe(1001)
  })
})

describe('emAberto', () => {
  it('a pagar e pendente estão em aberto', () => {
    expect(emAberto({ ...base, status: 'to_pay' })).toBe(true)
    expect(emAberto({ ...base, status: 'pending' })).toBe(true)
  })

  it('pago, cancelado e estornado não devem nada', () => {
    expect(emAberto({ ...base, status: 'paid' })).toBe(false)
    expect(emAberto({ ...base, status: 'cancelled' })).toBe(false)
    expect(emAberto({ ...base, status: 'refunded' })).toBe(false)
  })

  it('perna de transferência nunca está em aberto', () => {
    expect(emAberto({ ...base, status: 'to_pay', transfer_id: 'uuid-x' })).toBe(false)
  })
})
