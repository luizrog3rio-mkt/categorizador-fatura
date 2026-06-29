// Tipos e helpers das regras de propagação de origem (origin_tracking_rules),
// compartilhados entre o RegraModal e as telas que o usam (/regras, /hotmart).

export type MatchType = 'exact' | 'contains' | 'starts_with' | 'is_empty'

// Formato do formulário (strings; o vazio vira null no payload)
export interface NovaRegra {
  src_value: string; src_match: MatchType
  sck_value: string; sck_match: MatchType
  xcode_value: string; xcode_match: MatchType
  afiliado_value: string; afiliado_match: MatchType
  group_id: string; seller_id: string
}

export const REGRA_VAZIA: NovaRegra = {
  src_value: '', src_match: 'exact',
  sck_value: '', sck_match: 'exact',
  xcode_value: '', xcode_match: 'exact',
  afiliado_value: '', afiliado_match: 'exact',
  group_id: '', seller_id: '',
}

// referência opcional: valores de tracking de uma venda → chips clicáveis
export interface VendaRef { src?: string | null; sck?: string | null; xcod?: string | null; affiliate?: string | null }

// Formato da regra como vem do banco
export interface RegraDB {
  id: string
  src_value: string | null; src_match: MatchType
  sck_value: string | null; sck_match: MatchType
  xcode_value: string | null; xcode_match: MatchType
  afiliado_value: string | null; afiliado_match: MatchType
  group_id: string | null; seller_id: string | null
}

// Converte uma regra do banco no formato do formulário (pra editar)
export const regraParaForm = (r: RegraDB): NovaRegra => ({
  src_value: r.src_value ?? '', src_match: r.src_match,
  sck_value: r.sck_value ?? '', sck_match: r.sck_match,
  xcode_value: r.xcode_value ?? '', xcode_match: r.xcode_match,
  afiliado_value: r.afiliado_value ?? '', afiliado_match: r.afiliado_match,
  group_id: r.group_id ?? '', seller_id: r.seller_id ?? '',
})
