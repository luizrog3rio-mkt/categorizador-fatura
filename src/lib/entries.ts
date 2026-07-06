// Matemática de dinheiro dos lançamentos (`entries`) — pura, compartilhada entre
// Lançamentos e Dashboard pra manter as telas na MESMA régua. Não importar
// ./supabase aqui (mantém testável no vitest).

// o tipo Entry inteiro não é necessário: só os campos de dinheiro/estado.
export interface EntryValores {
  amount: number
  interest_amount: number
  fine_amount: number
  discount_amount: number
  status: string
  transfer_id?: string | null
}

// valor efetivo (amount + juros + multa − desconto): é o que foi pago quando o
// lançamento está pago, e o que FALTA pagar enquanto está em aberto. Os encargos
// costumam ser preenchidos no pagamento, então até lá isto é igual ao amount —
// salvo desconto/juros registrados antes (ex.: desconto negociado).
export const valorEfetivo = (l: EntryValores) =>
  Number(l.amount) + Number(l.interest_amount ?? 0) + Number(l.fine_amount ?? 0) - Number(l.discount_amount ?? 0)

// em aberto = ainda falta pagar/receber. Transferência já nasce paga, mas fica
// fora por segurança; cancelado/estornado não são dívida.
export const emAberto = (l: EntryValores) =>
  (l.status === 'to_pay' || l.status === 'pending') && !l.transfer_id
