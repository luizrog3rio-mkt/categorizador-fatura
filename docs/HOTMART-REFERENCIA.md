# Hotmart — Referência completa de integração

> Documento consolidado de TUDO que foi mapeado e **validado em produção** no projeto
> Auditoria da Jornada do Aluno (RB7, jun/2026). Serve como referência portátil para
> qualquer projeto novo que integre com a Hotmart: Webhook 2.0, API de Pagamentos,
> ponte de identidade via `sck`, modelo de receita e todas as pegadinhas descobertas.

---

## 1. Visão geral das integrações

| Integração | Para quê | Confiabilidade |
|---|---|---|
| **Webhook 2.0** | Receber vendas/estornos em tempo real | Fonte de verdade financeira (valor BRUTO) |
| **API de Pagamentos** | Buscar líquido + tarifa retida (não vêm confiáveis no webhook) | Exato, bate com o painel |
| **Parâmetro `sck`** | Ponte de identidade: visitor_id entra no link do checkout e volta no webhook | Robusto quando o link é injetado |
| **CSV "modelo detalhado"** | Backfill histórico (o webhook só existe do dia da configuração em diante) | Exato, bate centavo com o painel |

---

## 2. Webhook 2.0

### 2.1 Configuração no painel

- **Onde:** Hotmart → Ferramentas → Webhook (versão 2.0) → URL do seu endpoint.
- **Eventos a assinar** (os 6 com tratamento dedicado):
  `PURCHASE_APPROVED`, `PURCHASE_COMPLETE`, `PURCHASE_REFUNDED`,
  `PURCHASE_CHARGEBACK`, `PURCHASE_CANCELED`, `SUBSCRIPTION_CANCELLATION`
- Ao salvar, a Hotmart gera um **`hottok`** — guarde em env var (`HOTMART_HOTTOK`).

### 2.2 Autenticação (hottok)

- A Hotmart envia o hottok no **header `x-hotmart-hottok`**; em payloads antigos pode
  vir no corpo (`payload.hottok`) — validar header primeiro, corpo como fallback.
- Comparar em **tempo constante** (hash SHA-256 dos dois lados e comparação byte a byte,
  sem early-return) para não vazar o segredo via timing.
- Rejeitar com 401 **antes de qualquer escrita** no banco.

### 2.3 Estrutura do payload (caminhos validados em produção)

```text
payload.id                                  → id único do evento Hotmart (UUID)
payload.event                               → tipo: "PURCHASE_APPROVED" etc.
payload.hottok                              → (fallback de auth; o normal é vir no header)

data.purchase.transaction                   → "HP1234567890" (id da transação — chave!)
data.purchase.status                        → "APPROVED" | "COMPLETE" | ... (pode faltar)
data.purchase.order_date                    → EPOCH EM MILISSEGUNDOS (ex.: 1781108846000)
data.purchase.approved_date                 → epoch ms
data.purchase.price.value                   → valor BRUTO pago pelo comprador
data.purchase.price.currency_value          → "BRL" | "USD" ...
data.purchase.full_price.value              → preço cheio (fallback do value)
data.purchase.original_offer_price          → preço da oferta original
data.purchase.payment.type                  → "CREDIT_CARD" | "PIX" | "BILLET" ...
data.purchase.payment.installments_number   → nº de parcelas
data.purchase.offer.code                    → código da oferta (ex.: "fjcjy3gi")
data.purchase.origin.sck                    → ⭐ o sck do link de checkout (ponte de identidade)
data.purchase.origin.src                    → src do link (ex.: "ig|social|link_in_bio")
data.purchase.origin.xcode                  → xcode do link
data.purchase.recurrence_number             → nº da recorrência (assinaturas)
data.purchase.is_funnel / order_bump / business_model / checkout_country / invoice_by

data.buyer.email                            → e-mail do comprador
data.buyer.checkout_phone                   → telefone digitado no checkout (preferir este)
data.buyer.phone                            → telefone do cadastro (fallback)
data.buyer.name / first_name / last_name
data.buyer.document / document_type         → CPF **ou CNPJ** (compras PJ acontecem!)
data.buyer.address.{city,state,zipcode,...} → endereço do checkout (nem sempre vem)

data.product.id                             → id numérico do produto (chave do catálogo)
data.product.name

data.subscription.subscriber_code           → código do assinante (assinaturas)
data.subscription.plan                      → plano
```

### 2.4 ⚠️ Pegadinhas do webhook (todas vividas em produção)

1. **Reentrega até 5×, possivelmente FORA DE ORDEM.** A Hotmart reenvia o mesmo evento
   em caso de não-2xx (e às vezes mesmo com 2xx). Consequências obrigatórias:
   - **Idempotência por `dedupe_key`** = `transaction_id + ':' + event_type`
     (fallback: `payload.id`; último recurso: SHA-256 do JSON). **Nunca NULL** —
     NULL não colide em UNIQUE no Postgres e duplicaria reentregas.
   - **Anti-regressão de status**: um `PURCHASE_APPROVED` reentregue depois de um
     `PURCHASE_REFUNDED` não pode voltar o status. Ranking usado:
     `APPROVED (1) < COMPLETE/COMPLETED (2) < REFUNDED/CHARGEBACK/CANCELED/EXPIRED (3)`.
     Implementado como trigger no banco (`guard_transaction_status`), que também impede
     que timestamps (`approved_at`, `refunded_at`...) regridam a NULL.
   - Em colisão de dedupe (cru já gravado), **não retornar cedo** — reprocessar a
     derivação, porque a entrega anterior pode ter falhado depois de gravar o cru.

2. **Refund/chargeback/cancel chegam SEM `origin` e SEM `buyer`** (frequentemente).
   O payload desses eventos costuma vir sem `origin.sck` e sem e-mail/telefone.
   Se você gravar incondicionalmente, **apaga o vínculo de identidade** que o
   PURCHASE_APPROVED já tinha casado. Regra: todo update derivado deve ser
   **não-destrutivo** — só inclui no patch os campos que o evento atual trouxe.

3. **`origin` pode vir ausente INTEIRO mesmo em compra aprovada** (visto em produção:
   compra via navegador in-app do Instagram/iOS chegou sem o bloco `origin`).
   Tenha sempre o fallback de match por e-mail/telefone normalizado.

4. **`SUBSCRIPTION_CANCELLATION` pode vir SEM `data.purchase.transaction`** — só com
   `data.subscription.subscriber_code`. Solução: reconciliar por `subscription_id`
   (update nas transações com aquele subscriber_code: `status='CANCELED'` + `canceled_at`).

5. **`purchase.status` pode faltar no payload.** Mapeie `event` → status canônico NU:
   `PURCHASE_APPROVED→APPROVED`, `PURCHASE_COMPLETE→COMPLETE`, `PURCHASE_REFUNDED→REFUNDED`,
   `PURCHASE_CHARGEBACK→CHARGEBACK`, `PURCHASE_CANCELED→CANCELED`,
   `SUBSCRIPTION_CANCELLATION→CANCELED`. (Os nomes crus com prefixo `PURCHASE_` não
   são status e quebram qualquer ranking de não-regressão.)

6. **`order_date`/`approved_date` vêm em epoch MILISSEGUNDOS**, não ISO.
   `new Date(purchase.order_date).toISOString()` resolve.

7. **Produto desconhecido derruba FK.** Compra de produto que não está no seu catálogo
   não pode falhar. Padrão "self-healing": upsert do produto com classificação NULL
   (`ON CONFLICT DO NOTHING` para nunca sobrescrever o que o operador classificou)
   antes do upsert da transação; classifica-se depois e um trigger retro-preenche.

8. **O líquido do webhook NÃO é confiável.** A comissão PRODUCER que eventualmente vem
   no payload **não bate** com o "Faturamento líquido" do painel. Líquido exato só via
   API (`/sales/commissions`) ou CSV. Guarde `value` = bruto no webhook e preencha
   `net_value` depois via sync.

9. **PIX vs cartão**: o valor pago muda (ex.: PIX R$ 297,00 vs cartão R$ 296,99) —
   não usar igualdade de valor para deduplicar nada.

10. **Compras com CNPJ existem** (`document_type: "CNPJ"`) — não assuma CPF.

11. **Grava cru primeiro.** Persistir o payload bruto (append-only, ex.: tabela
    `purchase_events` com `raw_payload jsonb`) **antes** de qualquer derivação.
    Se a derivação falhar, responda 5xx — a reentrega da Hotmart completa o trabalho.

### 2.5 Ordem de processamento de referência (battle-tested)

```text
1. Validar hottok (401 antes de qualquer escrita)
2. INSERT do payload cru (append-only, dedupe_key única, nunca NULL)
   └─ colisão 23505 → marcar duplicate=true e SEGUIR (não retornar cedo)
3. Resolver identidade: origin.sck → email normalizado → phone normalizado
4. Enriquecer identidade (não-destrutivo: só campos não-nulos)
5. Garantir produto no catálogo (self-healing, ON CONFLICT DO NOTHING)
6. UPSERT da transação (onConflict transaction_id, patch não-destrutivo,
   status canônico, timestamps por evento; trigger anti-regressão no banco)
7. Caso especial: SUBSCRIPTION_CANCELLATION sem transaction → update por subscriber_code
8. Qualquer falha pós-cru → 5xx (deixa a Hotmart reentregar)
```

---

## 3. Ponte de identidade — `sck` / `src` / `xcode`

### 3.1 Como funciona

- O checkout da Hotmart aceita parâmetros de tracking na URL:
  `https://pay.hotmart.com/XXXX?sck=<valor>&src=<valor>&xcode=<valor>`
- Tudo que vai no `sck`/`src`/`xcode` do link **volta no webhook** em
  `data.purchase.origin.{sck,src,xcode}`. É a única ponte first-party confiável
  entre a navegação no seu site e a venda na Hotmart.
- Estratégia: injetar `sck=<visitor_id>` (id do cookie first-party do visitante) em
  todos os links de checkout da página de vendas.

### 3.2 Injeção robusta do sck (aprendizados)

- Reescrever os links **e** interceptar o clique (links podem ser re-renderizados).
- Usar **MutationObserver** para links inseridos tardiamente no DOM.
- Domínios de checkout a cobrir: `hotmart.com`, `pay.hotmart.com`, `hotm.art`,
  `hotmart.com.br`.
- Preservar UTMs/query existente ao anexar o `sck`.
- Formato livre aceito: testado com ids tipo `1779206410088_17792063868442`
  (texto com underscore) — passa sem problema. UUID de 36 chars também.

### 3.3 Resolução de identidade na venda (prioridade)

```text
1) origin.sck   → lookup direto (sck = visitor_id)        [método mais forte]
2) buyer.email  → normalizado (lowercase, trim, etc.)
3) buyer.checkout_phone ?? buyer.phone → normalizado (dígitos, com DDI 55)
```

- **Normalizar SEMPRE, na escrita E na busca** — o fallback só funciona se os dois
  lados aplicarem a mesma normalização.
- Pode existir **mais de uma identidade** com o mesmo e-mail/telefone (multi-dispositivo,
  cookie recriado). Não usar `maybeSingle()`; ordenar por `last_seen_at desc` e pegar
  a mais recente.

### 3.4 Furos de tracking conhecidos

- **Navegador in-app do Instagram (iOS)**: visto em produção sessão que registrou o
  `page_view` mas perdeu o clique de checkout e o sck (compra chegou órfã, payload sem
  `origin`). O fallback por e-mail/telefone é essencial para esse tráfego.
- Venda assistida (vendedor manda link manualmente por WhatsApp/DM): o link
  normalmente vai **sem sck** → essas vendas dependem 100% do fallback. Na prática,
  só uma minoria das identidades tem e-mail/telefone capturado → vendas assistidas
  ficam majoritariamente órfãs. É limitação estrutural, não bug.

---

## 4. API de Pagamentos (developers.hotmart.com)

### 4.1 Autenticação OAuth (client_credentials)

```text
POST https://api-sec-vlc.hotmart.com/security/oauth/token
     ?grant_type=client_credentials
     &client_id=<CLIENT_ID>
     &client_secret=<CLIENT_SECRET>

Headers:
  Authorization: Basic <base64(client_id:client_secret)>
  Content-Type: application/json
```

- ⚠️ **Peculiaridade: os parâmetros vão na QUERY STRING**, não no body (form-encoded
  padrão OAuth NÃO funciona). Basic auth no header junto.
- Token dura ~48h. Credenciais geradas em Hotmart → Ferramentas → Credenciais (app).

### 4.2 Líquido exato — `GET /payments/api/v1/sales/commissions`

```text
GET https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=HP...
Authorization: Bearer <token>
```

- Resposta: `items[0].commissions[]` — pegar a comissão com **`source == "PRODUCER"`**
  → `commission.value` = **"Faturamento líquido"** do painel (validado centavo a
  centavo: HP1212955323 → 281,15 == CSV).

### 4.3 Tarifa da Hotmart — `GET /payments/api/v1/sales/history`

```text
GET https://developers.hotmart.com/payments/api/v1/sales/history?transaction=HP...
Authorization: Bearer <token>
```

- Resposta: `items[0].purchase.hotmart_fee.{total, percentage}` = tarifa retida + %.
- ⚠️ A tarifa vem **na moeda da venda** (BRL para vendas BRL, USD para USD) — filtrar
  por moeda antes de somar. Tarifa média observada na base: **~8,45%**.

### 4.4 ⚠️ Pegadinha crítica: buscar POR TRANSAÇÃO, não por janela de data

- `/sales/commissions` e `/sales/history` filtrados por **data omitem vendas** de
  alguns status (APPROVED/REFUNDED somem). Por janela de data → 0 resultados úteis;
  por `?transaction=<id>` → **sempre retorna**.
- Padrão que funciona: **sync dirigido pelo banco** — selecionar as transações com
  campo faltante (`net_value IS NULL OR hotmart_fee IS NULL`) e consultar a API uma a
  uma, escrevendo só o campo que faltava (idempotente, re-tenta a cada execução até a
  comissão existir na API). Agendar diário (ex.: pg_cron 06:00 BRT) com teto por
  execução (~300) para evitar rate limit/timeout.

---

## 5. Modelo de receita (bruto × líquido)

| Campo | Fonte | Equivale a |
|---|---|---|
| `value` (BRUTO) | webhook `purchase.price.value` | CSV "Valor de compra com impostos" — o que o comprador pagou |
| `net_value` (LÍQUIDO) | API `/sales/commissions` (PRODUCER) ou CSV | CSV/painel "Faturamento líquido" — o que o produtor recebe |
| `currency` | webhook `price.currency_value` | CSV "Moeda de recebimento" |
| `hotmart_fee` / `_pct` | API `/sales/history` | Tarifa retida pela Hotmart |

- Dashboards de receita usam `coalesce(net_value, value)` e filtram `currency='BRL'`
  (vendas novas ficam com `net_value` NULL até o sync noturno preencher).
- **A Hotmart NÃO fornece a DATA do reembolso/chargeback** — nem no CSV nem na
  `/sales/history`. Estornos históricos ficam com data placeholder (= data da venda);
  estornos novos via webhook ganham a data real (`now()` na chegada do evento).

---

## 6. CSV "modelo detalhado" (backfill histórico)

- Exportado no painel (Vendas → Exportar → modelo detalhado). Usado para importar o
  histórico anterior ao webhook.
- Colunas-chave: `Transação`, `Valor de compra com impostos` (= bruto),
  `Faturamento líquido` (= líquido), `Moeda de recebimento`, `Status`,
  `SCK` (quando o link tinha), e-mail/telefone do comprador, produto, datas.
- ⚠️ **Status pode vir em inglês OU português** dependendo do idioma da conta
  (`COMPLETED` vs `COMPLETE` vs "Completa") — normalizar com mapa PT+EN antes de
  qualquer comparação/ranking.
- Import idempotente por `transaction_id` (upsert) permite re-rodar para true-up.

---

## 7. Env vars de referência

```bash
HOTMART_HOTTOK=...        # token do webhook (gerado ao configurar o webhook 2.0)
HOTMART_CLIENT_ID=...     # OAuth da API (Ferramentas → Credenciais)
HOTMART_CLIENT_SECRET=...
HOTMART_BASIC=...         # base64(client_id:client_secret) — opcional, derivável
```

---

## 8. Checklist de replicação em projeto novo

1. [ ] Criar endpoint do webhook; validar hottok em tempo constante; 401 antes de escrever.
2. [ ] Tabela append-only para o payload cru com `dedupe_key` UNIQUE nunca-NULL.
3. [ ] Tabela de estado (transações) com upsert por `transaction_id` + trigger
       anti-regressão de status (+ timestamps que nunca voltam a NULL).
4. [ ] Patch não-destrutivo: campos só entram no update quando o evento os trouxe.
5. [ ] Resolução de identidade sck → email → phone, com normalização nos dois lados.
6. [ ] Self-healing de produtos (FK nunca derruba uma venda).
7. [ ] Tratar `SUBSCRIPTION_CANCELLATION` sem transaction (reconciliar por subscriber_code).
8. [ ] Configurar webhook no painel (6 eventos) e guardar o hottok.
9. [ ] Injeção de `sck` nos links de checkout (MutationObserver + clique, 4 domínios).
10. [ ] Credenciais OAuth da API + sync diário dirigido pelo banco (líquido + tarifa).
11. [ ] Testes: evento de teste do painel (confirmar caminho do `origin.sck`), compra
       real com sck, compra sem sck (fallback), reentrega 5× (idempotência + status).

---

*Gerado em 2026-06-11 a partir do código em produção (`supabase/functions/hotmart-webhook`,
`hotmart-sync`, `_shared/`), da spec (`docs/specs.md`) e das memórias de sessão do projeto
Auditoria da Jornada do Aluno.*
