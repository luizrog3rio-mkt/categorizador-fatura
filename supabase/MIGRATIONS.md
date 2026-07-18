# Migrations — runbook (Fases 1a/1b/1c ✅ · Fase 2 cutover ✅ · Fase 3 ✅ · Fase 4 ❌ descartada por design)

> **Inventário local completo: 115 migrations em 2026-07-16.** O índice abaixo é
> derivado dos arquivos presentes em `supabase/migrations/`, em ordem de timestamp.
> Ele não consulta nem revalida o banco remoto e não infere status: **o header de
> cada arquivo SQL é a fonte primária do status de aplicação e das verificações**.
> Para o marco histórico `phase1a_hardening`, cujo header não traz marcador explícito,
> vale a seção narrativa deste runbook. O baseline é a exceção operacional
> documentada no próprio header: foi registrado sem executar o snapshot contra
> produção. As seções narrativas antigas foram preservadas abaixo por conterem
> contexto, aprovações e procedimentos históricos.

## Índice vivo completo dos arquivos locais

### 2026-06-09 (1)

- [`20260609120000_baseline.sql`](migrations/20260609120000_baseline.sql)

### 2026-06-10 (6)

- [`20260610010051_phase1a_hardening.sql`](migrations/20260610010051_phase1a_hardening.sql)
- [`20260610115934_phase1b_team_model.sql`](migrations/20260610115934_phase1b_team_model.sql)
- [`20260610160202_phase1c_new_tables.sql`](migrations/20260610160202_phase1c_new_tables.sql)
- [`20260610194751_hotmart_totals_rpc.sql`](migrations/20260610194751_hotmart_totals_rpc.sql)
- [`20260610202455_enable_cron_net.sql`](migrations/20260610202455_enable_cron_net.sql)
- [`20260610203722_hotmart_cron_daily.sql`](migrations/20260610203722_hotmart_cron_daily.sql)

### 2026-06-11 (10)

- [`20260611002326_phase3_data_fixes.sql`](migrations/20260611002326_phase3_data_fixes.sql)
- [`20260611021420_move_pgnet_to_extensions.sql`](migrations/20260611021420_move_pgnet_to_extensions.sql)
- [`20260611142142_add_role_to_profiles.sql`](migrations/20260611142142_add_role_to_profiles.sql)
- [`20260611143617_hotmart_total_amount.sql`](migrations/20260611143617_hotmart_total_amount.sql)
- [`20260611164005_hotmart_currency_and_refresh_cols.sql`](migrations/20260611164005_hotmart_currency_and_refresh_cols.sql)
- [`20260611164017_hotmart_totals_v2_currency.sql`](migrations/20260611164017_hotmart_totals_v2_currency.sql)
- [`20260611164022_hotmart_refresh_status_cron.sql`](migrations/20260611164022_hotmart_refresh_status_cron.sql)
- [`20260611173533_hotmart_fee_pct_installments.sql`](migrations/20260611173533_hotmart_fee_pct_installments.sql)
- [`20260611180441_entries_issue_date_nullable.sql`](migrations/20260611180441_entries_issue_date_nullable.sql)
- [`20260611184217_user_table_prefs.sql`](migrations/20260611184217_user_table_prefs.sql)

### 2026-06-15 (2)

- [`20260615132218_entries_status_add_to_pay_enum.sql`](migrations/20260615132218_entries_status_add_to_pay_enum.sql)
- [`20260615132225_entries_status_migrate_overdue_and_default.sql`](migrations/20260615132225_entries_status_migrate_overdue_and_default.sql)

### 2026-06-17 (1)

- [`20260617135607_entries_add_is_recurring.sql`](migrations/20260617135607_entries_add_is_recurring.sql)

### 2026-06-18 (1)

- [`20260618192454_entries_recurrence_day.sql`](migrations/20260618192454_entries_recurrence_day.sql)

### 2026-06-22 (6)

- [`20260622125458_fatura_ofx_storage.sql`](migrations/20260622125458_fatura_ofx_storage.sql)
- [`20260622133542_transactions_kind.sql`](migrations/20260622133542_transactions_kind.sql)
- [`20260622164136_account_balances_rpc.sql`](migrations/20260622164136_account_balances_rpc.sql)
- [`20260622170139_relatorio_categorias_rpc.sql`](migrations/20260622170139_relatorio_categorias_rpc.sql)
- [`20260622171823_dre_competencia_rpc.sql`](migrations/20260622171823_dre_competencia_rpc.sql)
- [`20260622174210_reconciliation.sql`](migrations/20260622174210_reconciliation.sql)

### 2026-06-23 (1)

- [`20260623135902_entries_charges_discount.sql`](migrations/20260623135902_entries_charges_discount.sql)

### 2026-06-24 (6)

- [`20260624115030_dre_plano_contas.sql`](migrations/20260624115030_dre_plano_contas.sql)
- [`20260624171720_hotmart_a_liberar.sql`](migrations/20260624171720_hotmart_a_liberar.sql)
- [`20260624202331_plano_contas_v2.sql`](migrations/20260624202331_plano_contas_v2.sql)
- [`20260624204653_dre_produto_base.sql`](migrations/20260624204653_dre_produto_base.sql)
- [`20260624205030_hotmart_produtos_rpc.sql`](migrations/20260624205030_hotmart_produtos_rpc.sql)
- [`20260624210012_dre_by_product_rpc.sql`](migrations/20260624210012_dre_by_product_rpc.sql)

### 2026-06-25 (6)

- [`20260625163650_remove_categorias.sql`](migrations/20260625163650_remove_categorias.sql)
- [`20260625185947_account_type_cash.sql`](migrations/20260625185947_account_type_cash.sql)
- [`20260625192507_transferencias.sql`](migrations/20260625192507_transferencias.sql)
- [`20260625210240_hotmart_commission_checked_at.sql`](migrations/20260625210240_hotmart_commission_checked_at.sql)
- [`20260625211436_hotmart_commissions_cron.sql`](migrations/20260625211436_hotmart_commissions_cron.sql)
- [`20260625211536_hotmart_by_affiliate_rpc.sql`](migrations/20260625211536_hotmart_by_affiliate_rpc.sql)

### 2026-06-26 (8)

- [`20260626124334_vendedores_base.sql`](migrations/20260626124334_vendedores_base.sql)
- [`20260626124506_vendedores_rpcs.sql`](migrations/20260626124506_vendedores_rpcs.sql)
- [`20260626142135_afiliados_tracking_base.sql`](migrations/20260626142135_afiliados_tracking_base.sql)
- [`20260626142158_afiliados_rpcs.sql`](migrations/20260626142158_afiliados_rpcs.sql)
- [`20260626162350_transactions_chart_of_account.sql`](migrations/20260626162350_transactions_chart_of_account.sql)
- [`20260626162413_dre_by_competency_card.sql`](migrations/20260626162413_dre_by_competency_card.sql)
- [`20260626203914_hotmart_webhook_base.sql`](migrations/20260626203914_hotmart_webhook_base.sql)
- [`20260626203926_hotmart_webhook_drain_cron.sql`](migrations/20260626203926_hotmart_webhook_drain_cron.sql)

### 2026-06-27 (1)

- [`20260627010255_hotmart_origem_base.sql`](migrations/20260627010255_hotmart_origem_base.sql)

### 2026-06-29 (15)

- [`20260629125443_hotmart_origem_por_sck.sql`](migrations/20260629125443_hotmart_origem_por_sck.sql)
- [`20260629133817_origem_canais_v2.sql`](migrations/20260629133817_origem_canais_v2.sql)
- [`20260629135735_origem_seller_report.sql`](migrations/20260629135735_origem_seller_report.sql)
- [`20260629142205_origem_drop_legado.sql`](migrations/20260629142205_origem_drop_legado.sql)
- [`20260629150351_origem_classificacao_por_venda.sql`](migrations/20260629150351_origem_classificacao_por_venda.sql)
- [`20260629155027_origem_tracking_rules.sql`](migrations/20260629155027_origem_tracking_rules.sql)
- [`20260629160033_origem_force_apply_rule.sql`](migrations/20260629160033_origem_force_apply_rule.sql)
- [`20260629160459_origem_rules_add_afiliado.sql`](migrations/20260629160459_origem_rules_add_afiliado.sql)
- [`20260629161019_origem_rules_multi_condition.sql`](migrations/20260629161019_origem_rules_multi_condition.sql)
- [`20260629163109_origem_rules_match_type.sql`](migrations/20260629163109_origem_rules_match_type.sql)
- [`20260629163852_origem_rules_is_empty_match.sql`](migrations/20260629163852_origem_rules_is_empty_match.sql)
- [`20260629213111_origem_unmapped_values.sql`](migrations/20260629213111_origem_unmapped_values.sql)
- [`20260629214649_origem_sale_class_proveniencia.sql`](migrations/20260629214649_origem_sale_class_proveniencia.sql)
- [`20260629214724_origem_reapply_all.sql`](migrations/20260629214724_origem_reapply_all.sql)
- [`20260629221738_origem_rules_unique.sql`](migrations/20260629221738_origem_rules_unique.sql)

### 2026-06-30 (26)

- [`20260630005614_extrato_totais.sql`](migrations/20260630005614_extrato_totais.sql)
- [`20260630012653_dre_product_link_chart_account.sql`](migrations/20260630012653_dre_product_link_chart_account.sql)
- [`20260630104453_seguranca_revoke_anon_rpcs.sql`](migrations/20260630104453_seguranca_revoke_anon_rpcs.sql)
- [`20260630110613_dre_competencia_inclui_hotmart.sql`](migrations/20260630110613_dre_competencia_inclui_hotmart.sql)
- [`20260630111651_seguranca_papel_fail_safe.sql`](migrations/20260630111651_seguranca_papel_fail_safe.sql)
- [`20260630114247_dre_cash_reconciliation_filtra_dre.sql`](migrations/20260630114247_dre_cash_reconciliation_filtra_dre.sql)
- [`20260630115851_entries_datas_sanas_check.sql`](migrations/20260630115851_entries_datas_sanas_check.sql)
- [`20260630144220_origem_auto_classifica_venda_nova.sql`](migrations/20260630144220_origem_auto_classifica_venda_nova.sql)
- [`20260630150138_perf_indices_fks_quentes.sql`](migrations/20260630150138_perf_indices_fks_quentes.sql)
- [`20260630160952_origem_remove_cluster_canal.sql`](migrations/20260630160952_origem_remove_cluster_canal.sql)
- [`20260630161801_seguranca_lockdown_funcoes_origem.sql`](migrations/20260630161801_seguranca_lockdown_funcoes_origem.sql)
- [`20260630162626_higiene_indices_e_entry_installments.sql`](migrations/20260630162626_higiene_indices_e_entry_installments.sql)
- [`20260630163745_hotmart_cron_health_rpc.sql`](migrations/20260630163745_hotmart_cron_health_rpc.sql)
- [`20260630174246_corrige_datas_lixo_entries.sql`](migrations/20260630174246_corrige_datas_lixo_entries.sql)
- [`20260630174317_dre_nao_classificado_rpc.sql`](migrations/20260630174317_dre_nao_classificado_rpc.sql)
- [`20260630181831_backfill_competency_e_payment_date.sql`](migrations/20260630181831_backfill_competency_e_payment_date.sql)
- [`20260630181902_closed_periods_enforcement_trigger.sql`](migrations/20260630181902_closed_periods_enforcement_trigger.sql)
- [`20260630183541_deletions_log_forense.sql`](migrations/20260630183541_deletions_log_forense.sql)
- [`20260630190014_dre_competencia_guarda_natureza_cartao.sql`](migrations/20260630190014_dre_competencia_guarda_natureza_cartao.sql)
- [`20260630190737_listar_delecoes_rpc.sql`](migrations/20260630190737_listar_delecoes_rpc.sql)
- [`20260630202547_dre_products_chart_of_account.sql`](migrations/20260630202547_dre_products_chart_of_account.sql)
- [`20260630202639_dre_competencia_split_hotmart_por_conta.sql`](migrations/20260630202639_dre_competencia_split_hotmart_por_conta.sql)
- [`20260630204421_hotmart_product_map_chart_account_direto.sql`](migrations/20260630204421_hotmart_product_map_chart_account_direto.sql)
- [`20260630204455_dre_competencia_hotmart_conta_direta.sql`](migrations/20260630204455_dre_competencia_hotmart_conta_direta.sql)
- [`20260630211005_corrige_hotmart_rafael_para_rb7.sql`](migrations/20260630211005_corrige_hotmart_rafael_para_rb7.sql)
- [`20260630212201_congela_company_id_hotmart.sql`](migrations/20260630212201_congela_company_id_hotmart.sql)

### 2026-07-01 (12)

- [`20260701001316_corrige_net_hotmart_afiliado.sql`](migrations/20260701001316_corrige_net_hotmart_afiliado.sql)
- [`20260701021714_seguranca_viewer_readonly_real.sql`](migrations/20260701021714_seguranca_viewer_readonly_real.sql)
- [`20260701030209_invoices_total_numeric_2casas.sql`](migrations/20260701030209_invoices_total_numeric_2casas.sql)
- [`20260701033821_dre_competencia_a_classificar.sql`](migrations/20260701033821_dre_competencia_a_classificar.sql)
- [`20260701034823_webhook_skip_nao_e_erro.sql`](migrations/20260701034823_webhook_skip_nao_e_erro.sql)
- [`20260701104204_auditoria_forense_hotmart_e_lockdown_logs.sql`](migrations/20260701104204_auditoria_forense_hotmart_e_lockdown_logs.sql)
- [`20260701104248_dre_exclui_transferencia_a_classificar.sql`](migrations/20260701104248_dre_exclui_transferencia_a_classificar.sql)
- [`20260701110727_auditoria_onda3_atrasados_e_valor_pendente.sql`](migrations/20260701110727_auditoria_onda3_atrasados_e_valor_pendente.sql)
- [`20260701110740_cron_edge_audit_observabilidade.sql`](migrations/20260701110740_cron_edge_audit_observabilidade.sql)
- [`20260701125024_hotmart_sales_product_id.sql`](migrations/20260701125024_hotmart_sales_product_id.sql)
- [`20260701125954_webhook_grava_product_id.sql`](migrations/20260701125954_webhook_grava_product_id.sql)
- [`20260701140553_produto_por_id_mapa_e_rpcs.sql`](migrations/20260701140553_produto_por_id_mapa_e_rpcs.sql)

### 2026-07-06 (1)

- [`20260706193610_entries_atrasados_valor_efetivo.sql`](migrations/20260706193610_entries_atrasados_valor_efetivo.sql)

### 2026-07-15 (7)

- [`20260715173423_plano_contas_por_empresa.sql`](migrations/20260715173423_plano_contas_por_empresa.sql)
- [`20260715192144_saneamento_datas_entries.sql`](migrations/20260715192144_saneamento_datas_entries.sql)
- [`20260715200047_obras_incorporadora.sql`](migrations/20260715200047_obras_incorporadora.sql)
- [`20260715202831_regras_sugestao_conta.sql`](migrations/20260715202831_regras_sugestao_conta.sql)
- [`20260715215959_balanco_digital.sql`](migrations/20260715215959_balanco_digital.sql)
- [`20260715220733_balanco_holding.sql`](migrations/20260715220733_balanco_holding.sql)
- [`20260715220938_balanco_incorporadora.sql`](migrations/20260715220938_balanco_incorporadora.sql)

### 2026-07-16 (5)

- [`20260716140052_custo_por_obra_rpcs.sql`](migrations/20260716140052_custo_por_obra_rpcs.sql)
- [`20260716143144_partidas_estrutura.sql`](migrations/20260716143144_partidas_estrutura.sql)
- [`20260716143345_partidas_backfill.sql`](migrations/20260716143345_partidas_backfill.sql)
- [`20260716152621_dre_deducao_paga.sql`](migrations/20260716152621_dre_deducao_paga.sql)
- [`20260716154007_dre_lancamentos_invisiveis.sql`](migrations/20260716154007_dre_lancamentos_invisiveis.sql)

### 2026-07-18 (1)

- [`20260718153823_saneamento_deterministico_abr_jun.sql`](migrations/20260718153823_saneamento_deterministico_abr_jun.sql) — saneamento atômico aprovado: corrige 8 entries e 1 lançamento de cartão invisíveis na DRE e classifica 11 entries de destino factual. Validado pós-apply: 19/19 entries, cartão em `6.3.13`, 19 eventos no `entry_audit_log` e impacto abr–jun conforme snapshot.
- [`20260718161547_fechamento_obras_e_conta_pessoal.sql`](migrations/20260718161547_fechamento_obras_e_conta_pessoal.sql) — capitaliza 58 custos/R$134.172,06 nas obras Alfenas e Cristais, classifica 5 parcelas da betoneira/R$5.031,63 no imobilizado e retira 27 movimentos pessoais/R$99.830,71 da DRE operacional. Smoke: NC-2 zerado no período, 10 partidas de obra balanceadas e versão `20260718161547` confirmada no banco.

> **Status: APLICADO em 2026-06-10 (SQL revisado e aprovado pelo Luiz em 2026-06-09).**
> Histórico vivo: `20260609120000 baseline` (registrado sem execução) → `20260610010051 phase1a_hardening`
> (executado via MCP `apply_migration`). Advisors pós-apply: **os 13 achados SQL-fixáveis zeraram**
> (0011, 0028, 0029, 0001, 0003×9); performance só um INFO `unused_index` no índice recém-criado
> (esperado — acabou de nascer, some com o uso). Smoke test ✅ PASSOU em 2026-06-10. HIBP ✅
> habilitado em 2026-06-10 (projeto transferido pra org Pro) — **advisors security: zero achados**.
> (A pendência da service key foi resolvida no mesmo dia — ver passo manual 2, marcado [x].)
>
> Regra do projeto (segue valendo): nenhuma migration encosta no banco sem o Luiz revisar o SQL e aprovar.

## Contexto

O banco vivo (`qdnqghefwjpeiidjlzjy`) nunca teve histórico de migrations — todo o schema
foi aplicado via SQL Editor (confirmado: `supabase_migrations.schema_migrations` não
existe; `list_migrations` vazio). Os arquivos antigos do repo (`supabase/legacy/*.sql`,
removidos do repo em 2026-06-10 — histórico no git) estavam desatualizados em
relação à produção. A Fase 1a estabelece o marco zero:

| Arquivo | Papel | Como entra no banco |
|---|---|---|
| `migrations/20260609120000_baseline.sql` | Snapshot fiel do schema vivo (2026-06-09) | **Só registrado** no histórico — NUNCA executado (objetos já existem) |
| `migrations/20260610010051_phase1a_hardening.sql` | Correções dos advisors + menor privilégio | **Executado** via MCP `apply_migration` em 2026-06-10 |
| `audit/live-catalog-20260609.json` | Dump bruto do catálogo (proveniência do baseline) | Não entra — é documentação |

Verificação: ambos os SQLs passaram por revisão adversarial de 6 agentes (fidelidade ao
catálogo vivo, semântica de policies/grants, função/trigger vs signup, docs oficiais,
compatibilidade com o App.jsx, e este runbook) — 0 blockers em 2026-06-09.

## Ordem de aplicação (passos 1–5 ✅ executados em 2026-06-10, incluindo o smoke)

1. **Aplicar o hardening** via MCP `apply_migration` com name `phase1a_hardening` e o
   conteúdo de `20260609120100_phase1a_hardening.sql` (nome pré-rename; hoje o
   arquivo é `20260610010051_phase1a_hardening.sql`). Isso cria a tabela
   `supabase_migrations.schema_migrations` e registra a migration. Em seguida, rodar
   `list_migrations` para confirmar a criação e **anotar o version real gravado**.
2. **Renomear o arquivo local** para casar com o version real — o `apply_migration`
   gera o version com o timestamp do momento do apply, então a divergência com
   `20260609120100` é **certa**, não condicional. Atualizar também as referências
   cruzadas (tabela acima e header do baseline, se necessário).
3. **Registrar o baseline retroativamente** (sem executar) — via MCP `execute_sql` ou
   SQL Editor. **NUNCA via `apply_migration`**, que criaria um terceiro registro órfão
   no histórico:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name, statements)
   values (
     '20260609120000',
     'baseline',
     array['-- baseline registrado sem execução; schema já existia em produção. Ver supabase/migrations/20260609120000_baseline.sql']
   );
   ```
   O layout `(version, name, statements text[])` é o formato canônico do CLI
   (confirmado em `supabase/cli` `pkg/migration/history.go`); ainda assim, vale um
   `select * from supabase_migrations.schema_migrations` antes do insert.
   Alternativa canônica com CLI linkado: `supabase migration repair --status applied 20260609120000`.
   O version `20260609120000` ordena antes de qualquer timestamp futuro → histórico
   coerente: baseline → hardening.
4. **Re-rodar os advisors** (`get_advisors` security + performance): os **13 achados
   SQL-fixáveis devem zerar** (0011, 0028, 0029, 0001 e os 9× 0003). Deve restar
   **apenas** `auth_leaked_password_protection`, que só some com o passo manual de HIBP.
5. **Smoke test** (logado como a Lívia, em produção):
   - dashboard carrega (categorias, regras, faturas);
   - abrir uma fatura e editar a categoria de uma transação;
   - criar/editar/excluir um item de compra;
   - **importar um OFX de teste** (exercita os INSERTs de invoices + transactions sob
     as policies novas) e excluir a fatura criada (cascade limpa as transactions);
   - na tela deslogada, conferir o console — requests anon agora retornam 401/42501
     em vez de lista vazia (esperado; ver notas abaixo);
   - **signup de um usuário descartável** valida o trigger corrigido — e **deletar o
     usuário no dashboard (Auth → Users) depois**: o primeiro login dele semeia
     categorias/regras default e agravaria a consolidação da Fase 1b (21→30 em vez de
     21→12). Todas as FKs `user_id` têm `on delete cascade`, então o delete limpa tudo.

## Notas de comportamento pós-hardening

- **anon passa a receber 401/42501** nas 7 tabelas (antes: 200 + lista vazia, filtrada
  pela RLS). Nenhuma chamada do app roda como anon (verificado no App.jsx — tudo
  gated por `if (!user)`), mas curl/healthcheck/teste com a anon key pura muda de
  resposta. Lembrar disso em debugging futuro.
- **O app engole erros do Supabase** (destructura só `{ data }`, nunca lê `error`) —
  uma regressão apareceria como "lista vazia" silenciosa, não como mensagem de erro.
  Por isso o smoke test manual do passo 5 é obrigatório, não opcional.
- **Não usar `supabase migration fetch`** neste projeto — ele reconstruiria os arquivos
  a partir do histórico, e o `statements` do baseline lá é só um marcador. Os arquivos
  do repo são a fonte da verdade.
- **Funções RPC futuras** precisarão de `GRANT EXECUTE ... TO authenticated` explícito
  (os default privileges de functions foram revogados de PUBLIC/anon/authenticated,
  conforme o quick-reference oficial do lint 0029).

## Passos manuais no dashboard (sem SQL equivalente)

- [x] **Habilitar proteção contra senhas vazadas (HIBP)** — advisor
      `auth_leaked_password_protection`. ✅ **FEITO em 2026-06-10**: Luiz transferiu o
      projeto pra uma organização Pro (pré-requisito: Pro Plan ou superior,
      [doc oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
      e ativou o toggle no dashboard ([Authentication → Providers → Email](https://supabase.com/dashboard/project/qdnqghefwjpeiidjlzjy/auth/providers)).
      Verificado via `get_advisors`: security zerou. ⚠️ Nota da transferência de org: ref,
      URL, JWT secret e chaves não mudam (app/Vercel intactos), mas o **OAuth do MCP
      supabase precisou ser reautenticado** (`/mcp`) — o grant era da org antiga.
- [x] **Service key exposta REVOGADA** ✅ (2026-06-10): migração pras API keys novas
      concluída sem downtime — app (Vercel env + `.env` local) trocado pra
      `sb_publishable_CYnY2cJ5mgmKJ4ZhV5IFcA_7mHEQhdo`, redeploy verificado (bundle
      servindo a chave nova), e **legacy API keys desabilitadas** no dashboard às
      14:25 UTC (probe: legada → "Legacy API keys are disabled"; nova → viva; app →
      200). O JWT secret NÃO foi tocado — sessões de login seguem válidas. Daqui pra
      frente: front usa só a `sb_publishable_`; se algum backend/webhook precisar de
      acesso admin (Fase 1c+), criar uma `sb_secret_` na hora (Settings → API Keys)
      — revogável individualmente.

## O que o hardening NÃO faz (de propósito)

- **Não muda a semântica de acesso**: continua "cada usuário vê só o que é seu".
  O modelo de equipe (`using (true)` para authenticated) é a **Fase 1b**, que depende
  da consolidação dos seeds duplicados (categories 21→12, auto_rules 124→62).
- **Não mexe em dados** (qualidade de dados é Fase 3).
- **Não cria tabelas novas** (companies/accounts/entries é Fase 1c).

---

# Fase 1b — modelo de equipe

> **Status: APLICADO em 2026-06-10 (SQL revisado e aprovado pelo Luiz no mesmo dia).**
> Arquivo: `migrations/20260610115934_phase1b_team_model.sql` (renomeado do placeholder
> `20260610120000` pro version real registrado pelo apply). Todas as 5 guardas passaram.
> Verificação pós-apply: counts 12/62/8 e dados da Lívia intactos (3/519/9); 9 policies
> (7 team + 2 own de profiles); 6 FKs user_id em RESTRICT, profiles em CASCADE; anon
> segue 401/42501. Advisors security: **6 WARN `rls_policy_always_true` (lint 0024)
> nas 6 policies de equipe — é exatamente o design da 1b, aceitos por decisão** (a
> previsão "security zerado" do rascunho estava errada; o lint 0024 flagra using(true)
> em ALL). Pré-requisitos confirmados por probe na janela do apply: `signup_disabled`,
> `anonymous_provider_disabled`, auth.users = só as 2 contas, backup diário de
> 2026-06-10 07:58 UTC presente.
>
> **Smoke test ✅ PASSOU em 2026-06-10** (Playwright/Edge contra prod, usuário
> descartável criado pelo admin no dashboard e deletado via SQL no fim; banco voltou
> byte-a-byte ao baseline): membro novo vê as 3 faturas + modal de pendentes lista os
> 9 itens da Lívia em 2 grupos de mês (fix do `.eq` exercitado; "Pular" preservou
> tudo), import de OFX descartável, edição de categoria persistiu entre sessões,
> CRUD de purchase_item, `window.confirm` novo disparou no delete da fatura, logout —
> zero erros de console/HTTP. RESTRICT validado nos DOIS sentidos: delete do usuário
> COM dados → `23503 invoices_user_id_fkey` (bloqueado); depois da limpeza → passou.
> Probes REST: team READ (200 + linhas da Lívia) e team UPDATE no-op em transação
> dela (200, `with check (true)` ok); anon segue 401/42501.

## O que muda

1. **Consolidação dos seeds duplicados** — deleta as 9 `categories` e os 62
   `auto_rules` do usuário Luiz (`20eb0773`), verificados como cópias exatas dos
   da Lívia (`7540c0b9`) em 2026-06-10 (par por name+color_index nas categorias;
   category+keywords idênticos nos dois sentidos nas regras). Resultado:
   categories 21→12, auto_rules 124→62, purchase_item_categories já era 8 (só
   da Lívia). O DO block tem 5 guardas + conferência de row_count nos deletes:
   a guarda 0 exige `auth.users` com EXATAMENTE as 2 contas conhecidas (mata o
   vetor de conta-fantasma criada com o signup aberto), e as demais pinam as
   contagens/conteúdos verificados na aprovação. Qualquer divergência aborta a
   transação inteira sem efeito.
2. **Policies de equipe** — as 6 tabelas de dados saem de
   `(select auth.uid()) = user_id` para `for all to authenticated using (true)
   with check (true)`. O `with check (true)` é obrigatório: o app edita linhas
   alheias preservando o `user_id` original (recategorizar transação da Lívia
   mantém o user_id dela — um own-check quebraria toda edição de equipe).
   `profiles`: equipe lê todos os perfis; INSERT/UPDATE continuam do dono.
3. **FKs de user_id: CASCADE → RESTRICT** — no modelo de equipe os dados são da
   empresa. Antes, deletar a conta da Lívia no dashboard apagaria as 3 faturas e
   as 519 transações em cascata. Com RESTRICT, deletar usuário com dados falha
   explicitamente. `profiles` mantém CASCADE (1:1 com a conta).

Acompanham 3 fixes de app no `App.jsx` (todos no-op ou inofensivos sob as
policies atuais — deployar ANTES do apply, ver ordem abaixo):

- remover o `.eq("user_id", user.id)` do load de itens pendentes (modal
  pós-import de OFX) — era o único filtro explícito por dono; sem remover,
  esse modal mostraria só os itens do usuário logado enquanto o resto do app
  mostra os da equipe;
- **seed-on-error**: os 3 blocos de seed (`categories`, `auto_rules`,
  `purchase_item_categories`) semeavam quando `data` vinha null — ou seja,
  também em ERRO de rede/token, não só em tabela vazia. Sob o modelo de equipe
  isso re-poluiria os dados consolidados na primeira falha transiente. Agora
  só semeia quando o select respondeu com array vazio (`else if (dbCats)`);
- **confirmação no deleteInvoice**: sob `using (true)` qualquer membro apaga a
  fatura da Lívia (519 transações em cascade) com 1 clique — agora tem
  `window.confirm` antes.

Pós-1b, `user_id` deixa de ser campo de autoria confiável (o `with check
(true)` permite gravar user_id alheio — aceito por design; não usar pra
auditoria sem revalidar server-side).

## Pré-requisitos DUROS antes do apply

Pós-1b o gate inteiro vira "ter um JWT authenticated" — então TODAS as portas
de emissão precisam estar fechadas, não só o signup por e-mail:

- [x] **Fechar o signup público** (dashboard → Authentication → Sign In / Providers
      → desativar "Allow new users to sign up"). Com `using (true)` e signup
      aberto (e-mail já auto-confirma), qualquer pessoa criaria conta e veria
      todos os dados da empresa. Contas de equipe passam a nascer no dashboard
      (Authentication → Users → Add user → e-mail auto-confirmado).
- [x] **"Allow anonymous sign-ins" = OFF** (toggle SEPARADO do signup — JWT
      anônimo também é role `authenticated` e passaria nas policies).
- [x] **Nenhum provider além de Email** habilitado (OAuth/phone emitiriam JWT
      por fora do toggle de signup).
- [x] **Auditar `auth.users`**: `select id, email, created_at from auth.users`
      deve devolver SÓ as 2 contas conhecidas. Se houver conta estranha:
      deletar E **aguardar a expiração do access token dela** (JWT é stateless
      — vale até o `exp` mesmo com a conta deletada; ver JWT expiry em
      Settings → Auth, default 3600s) antes do apply. A guarda 0 da migration
      re-checa isso em SQL na hora do apply.

Probes de verificação (nunca criam usuário), re-rodar IMEDIATAMENTE antes do
apply — probe velho não vale:
`POST /auth/v1/signup` com senha de 1 caractere → fechado responde
`signup_disabled`; aberto responde `weak_password`. Anonymous:
`POST /auth/v1/signup` com body `{}` → deve dar erro. **Probes finais na
janela do apply (2026-06-10): `signup_disabled` ✓ e
`anonymous_provider_disabled` ✓.**

## Ordem de aplicação

0. **Conferir backup** (dashboard → Database → Backups): existe backup diário
   recente (org Pro)? Anotar o timestamp. É a única restauração de DADOS — e
   restore é do projeto INTEIRO (perde o dia corrente), não de tabela isolada.
   A 1b é exatamente o momento em que isso deixa de ser nice-to-have: qualquer
   membro passa a poder deletar tudo.
1. **Commit local** da migration + App.jsx + runbook ANTES do apply (sem push
   ainda — o artefato aprovado não pode viver só no working tree durante a
   operação; o deploy Vercel só dispara no push).
2. **Push → deploy do fix do App.jsx** (no-op sob as policies atuais; assim o
   smoke do passo 6 já exercita o app novo contra as policies novas).
3. Re-rodar os probes dos pré-requisitos (acima) na mesma janela do apply.
4. `apply_migration` com name `phase1b_team_model` e o conteúdo do arquivo.
5. `list_migrations` → anotar o version real, renomear o arquivo local E
   atualizar as referências cruzadas (linha "Arquivo:" desta seção, header do
   SQL, status do runbook → aplicada).
6. Re-rodar advisors (security mostra **6 WARN `rls_policy_always_true`/lint
   0024 nas policies de equipe — é o design da 1b, aceitos**; performance pode
   reclamar `unused_index` — INFO inofensivo) e o smoke test do modelo de equipe
   (usuário descartável criado pelo admin no dashboard): login → vê as 3
   faturas e 519 transações da Lívia → **importa um OFX descartável e confere
   que o modal de pendentes lista os itens da Lívia** (exercita o fix do
   filtro) → exclui a fatura importada (cascade limpa) → cria e deleta um item
   de compra → logout → deletar o usuário descartável no dashboard (com
   RESTRICT, só depois de limpar o que ele criou — o smoke já limpa; o profile
   dele morre via CASCADE, que ficou intacto). Probes REST: anon segue
   401/42501; authenticated de outro usuário agora lê os dados da equipe.
7. Commit final (rename + referências) + push.

## Rollback (se precisar voltar atrás)

Policies RLS são permissivas (OR): recriar as own-rows SEM dropar as de equipe
manteria acesso total. Reverter = **primeiro dropar as 7 policies de equipe**:

```sql
drop policy "Team manages all categories" on public.categories;
drop policy "Team manages all rules" on public.auto_rules;
drop policy "Team manages all invoices" on public.invoices;
drop policy "Team manages all transactions" on public.transactions;
drop policy "Team manages all purchase items" on public.purchase_items;
drop policy "Team manages all purchase categories" on public.purchase_item_categories;
drop policy "Team views all profiles" on public.profiles;
```

…e então recriar as 9 policies own-rows da Fase 1a (estão por extenso, com
`drop policy if exists` + `create policy`, no arquivo
`20260610010051_phase1a_hardening.sql`) e, se desejado, voltar as FKs pra
CASCADE (espelho da seção 3 da migration trocando `restrict` por `cascade`).
Não há restauração dos seeds deletados nem precisa: eram cópias exatas, e o
próprio app re-semeia os defaults do Luiz (9+62, mais 5 purchase categories
que ele nunca teve) no primeiro login dele sob own-rows — a tabela parecerá
vazia pra ele. Os fixes do App.jsx são no-op nos dois modelos — não precisam
reverter. PERDA DE DADOS (vs. policies) só se recupera por restore
full-project do backup.

## Follow-ups pós-1b — status final (2026-06-10)

- ~~**Service key exposta**~~ ✅ RESOLVIDA: app migrado pra `sb_publishable_`,
  legacy API keys desabilitadas (ver passo manual 2).
- **`unique(name)` team-wide** em categories/purchase_item_categories —
  DECISÃO: **adiado indefinidamente** (o app TS valida duplicata por nome na
  UI; sem caso real de colisão). ⚠️ Se um dia adotar, lembrar da interação com
  o rollback (re-seed colidiria).
- ~~**Ocultar a aba "Criar conta"**~~ ✅ RESOLVIDA pela Fase 2: o Login.tsx do
  app TS é login-only (Auth.jsx não existe mais).
- ~~**Updates otimistas sem leitura de `error`**~~ ✅ RESOLVIDA no port TS:
  setCategory/updateItem/etc. checam `error` e mostram banner.

---

# Fase 1c — tabelas novas em inglês

> **Status: APLICADO em 2026-06-10 (SQL revisado e aprovado pelo Luiz no mesmo dia,
> com correção dele: seeds fictícios do rb7 — Berta, contas Sicredi/C6 — descartados).**
> Arquivo: `migrations/20260610160202_phase1c_new_tables.sql` (renomeado do placeholder
> `20260610200000`). Fonte: as 3 migrations do rb7-financeiro + mapa da auditoria
> cruzada, recuperados do transcript/Lixeira em 2026-06-10 e **versionados em
> `supabase/audit/rb7-recovery/`** (insumo também das Fases 3 e 4).
> Verificação adversarial: 6 agentes, 39 achados, **0 blockers** + re-check focado
> pós-redução de seeds (APROVADO). Pós-apply verificado: 5 tabelas + 3 enums criados,
> seed exato (RB7 Digital / Cartão Sicoob RB7, byte-perfeito), backfill 3/3 faturas,
> 9 FKs RESTRICT, anon sem grant (REST → 401/42501), advisors = exatamente os 11
> WARNs 0024 previstos. **Smoke authenticated ✅ PASSOU em 2026-06-10** — executado
> por impersonação de role no SQL (`set local role authenticated` + claims JWT, a
> mesma técnica do SQL Editor; signup fechado dispensou usuário descartável):
> INSERT/UPDATE/DELETE em entries como authenticated (policy + grants + trigger
> `updated_at` avançou), INSERT de invoices no formato exato do App.jsx pós-ALTER
> (account_id nasce NULL como documentado) + delete. Banco voltou ao estado pós-1c
> exato (3/519/0, 1 company, 1 account). **Fase 1c 100% fechada.**

## O que cria

| Nova (EN) | Fonte (rb7, PT) | Notas |
|---|---|---|
| `companies` | empresas | seed: só **RB7 Digital** (a "Berta" do rb7 era fictícia — Luiz, 2026-06-10) |
| `accounts` | contas | enum EN (checking/credit_card/inter_company); seed: só **Cartão Sicoob RB7** (contas Sicredi/C6 do rb7 eram fictícias) |
| `entries` | lancamentos | enums payable/receivable + pending/paid/overdue/cancelled; trigger `set_updated_at` hardened |
| `bank_transactions` | transacoes_ofx | + `invoice_id` e `auto_categorized` (herança do categorizador p/ merge Fase 4); UNIQUE(account_id, fit_id) |
| `hotmart_sales` | vendas_hotmart | status mantém valores PT dos relatórios |

Mais: `invoices.account_id` (nullable, FK accounts RESTRICT) com backfill das 3
faturas → Cartão Sicoob RB7 (guarda row_count=3).

## Decisões de desenho (desvios conscientes do rb7 — detalhadas no header do SQL)

1. **RESTRICT no lugar de CASCADE** (filosofia 1b); vínculos fracos = SET NULL.
2. **category_id → tabela viva `categories`** (um sistema só na transição; tipo
   pagar/receber e modelo unificado = Fase 3).
3. **Team RLS desde o dia 1** → +5 WARNs lint 0024 esperados nos advisors (aceitos).
4. **Sem user_id** nas tabelas novas; autoria informativa via `entries.created_by`.
5. ⚠️ **Cartão Sicoob NÃO usa o dedupe de bank_transactions** (FITID repete entre
   parcelas) — fluxo de cartão segue em invoices/transactions até a Fase 4.
6. `invoices.account_id` nullable até o app TS (Fase 2) preenchê-la — faturas
   importadas entre a 1c e a Fase 2 nascem com NULL (re-backfill na Fase 2).
7. **Consequência futura do SET NULL** (decidida agora, vale na Fase 4): excluir
   uma fatura passa a ÓRFANAR os `bank_transactions.invoice_id` em vez de
   deletá-los — extrato bancário é fato independente do agrupamento. A UX de
   exclusão de fatura do app TS deve comunicar isso.
8. **Empresa dona do "Cartão Sicoob RB7" = RB7 Digital** — ✅ ratificado pelo
   Luiz em 2026-06-10 (junto com o descarte dos seeds fictícios do rb7).

## Impacto no app atual: ZERO

Tabelas novas não são lidas pelo App.jsx; a coluna nova em invoices é ignorada
pelo `select *` e os inserts continuam válidos (nullable).

## Ordem de aplicação

1. Verificação adversarial (workflow) ✅ → aprovação do Luiz.
2. Conferir backup diário recente (a 1c muta dados vivos no backfill) e
   **commit local nomeando os arquivos** (a migration + MIGRATIONS.md +
   `supabase/audit/rb7-recovery/`; `.mcp.json`/CLAUDE.md só por decisão
   explícita).
3. **Janela quieta** (ninguém importando OFX — a guarda do backfill pina n=3 e
   abortaria com fatura nova concorrente; abort é seguro, só reavalia e repete)
   → `apply_migration` com name `phase1c_new_tables`, conteúdo lido via
   Read/MCP — **nunca via `Get-Content` sem `-Encoding utf8`** (arquivo UTF-8
   sem BOM com seeds multibyte; mojibake passaria pelas guardas de contagem).
4. `list_migrations` → rename + referências cruzadas + status deste runbook.
5. Advisors (security: 6 WARNs 0024 da 1b + 5 novos = 11, todos aceitos;
   performance: INFOs `unused_index` nos 16 índices recém-criados — esperado).
6. Smoke: SQL de verificação (tabelas/policies/grants/seeds/backfill + check
   byte-exato `select count(*) from public.accounts where name = 'Cartão
   Sicoob RB7'` = 1); probe REST (anon barrado nas tabelas novas; authenticated
   lê accounts — se vier `PGRST205`, é o schema cache do PostgREST recarregando:
   aguardar segundos e re-tentar antes de suspeitar de grant); **import de OFX
   descartável + delete da fatura** (INSERT de invoices pós-ALTER, account_id
   nasce NULL); round-trip em `entries` como authenticated (INSERT/UPDATE/DELETE
   descartável conferindo que `updated_at` avança — valida trigger + policy).
7. Commit final + push.

## Rollback

Tabelas novas sem dados de produção até a Fase 2 ⇒ rollback = drop limpo, NESTA
ordem (FKs mandam): 1) `alter table public.invoices drop column account_id`
(libera accounts), 2) `drop table` em bank_transactions → hotmart_sales →
entries → accounts → companies, 3) `drop function public.set_updated_at()` e
`drop type` nos 3 enums. Sem perda possível além dos próprios seeds.
4) **Corrigir o histórico**: `delete from supabase_migrations.schema_migrations
where version = '<version real do apply>'` (ou `supabase migration repair
--status reverted <version>`) + remover o arquivo local renomeado — o histórico
é fonte de fatos do projeto e não pode listar migration cujos objetos não
existem.

## Follow-ups pra Fase 2/4 — status final (2026-06-10)

- ~~**Import deve REPORTAR duplicatas puladas**~~ ✅ IMPLEMENTADO
  (src/lib/importarExtrato.ts: relatório "N no arquivo · X novas · Y
  duplicadas · Z sem FITID").
- ~~**FITID vazio → sintético**~~ ✅ IMPLEMENTADO (src/lib/importarExtrato.ts:
  `syn:data:valor:memo` determinístico, com #n pra colisão intra-arquivo; o
  parser ofxExtrato.ts apenas entrega o fitid vazio).
- ~~**Upsert Hotmart em reimport**~~ — superado: o fluxo primário virou o sync
  via API (Edge Function), single-company na prática; merge por
  transaction_code mantido de propósito (atualiza status de reembolso).
- **Fase 4 (migrar transactions→bank_transactions): ❌ DESCARTADA por design**
  (decisão do Luiz, 2026-06-10) — violaria `UNIQUE(account_id, fit_id)` pelos
  parcelamentos Sicoob (FITID repete; R$ 22.475,33 legítimos) e misturaria
  conceitos distintos. Cartão (invoices/transactions) e extrato
  (bank_transactions) são fluxos separados permanentes.

---

# Migrations operacionais pós-1c (Fase 2/3 — todas APLICADAS)

| Version | Nome | O que faz |
|---|---|---|
| `20260626162413` | dre_by_competency_card | **DRE por competência passa a UNIR o cartão classificado.** `dre_by_competency` redefinida com CTE `mov` = entries (filtros de hoje) UNION `transactions` com `chart_of_account_id`. Cartão: competência = data da compra (`to_date(date,'DD/MM/YYYY')`), empresa via fatura→conta, sinal pelo `kind` (débito soma, crédito abate). **Guarda anti-dupla-contagem:** exclui entries que são a fatura agregada do cartão (`invoice_account_id is not null` — hoje 0). Escopo: só esta RPC (NÃO `dre_by_product` nem `dre_cash_reconciliation`). Mantém SECURITY DEFINER/search_path/grants. Verificado e2e: lançamento de R$3,20 (mai) entrou em 6.3.09 m5. |
| `20260626162350` | transactions_chart_of_account | Coluna `transactions.chart_of_account_id` (FK chart_of_accounts, ON DELETE SET NULL) + índice. A "marcação" de Plano de Contas de cada lançamento da fatura (aba Lançamentos da tela Fatura, seletor inline com as contas `is_analytical`). Aditiva. |
| `20260626142158` | afiliados_rpcs | `hotmart_affiliates(p_currency='BRL')` (de-para afiliado, molde hotmart_scks sem is_ruido — nome do afiliado é canônico) + `hotmart_by_person(p_company,p_start,p_end,p_currency='BRL')`: total por PESSOA pelos 2 canais (sck e afiliado) lado a lado em colunas separadas (sem dupla contagem) — junta `hotmart_sck_map` e `hotmart_affiliate_map` → `sellers`. Hardening padrão. Substitui o `hotmart_by_seller` na tela (que segue existindo, só-sck). Alimenta a 2ª seção de de-para em /vendedores + "Total por pessoa" na Hotmart. |
| `20260626142135` | afiliados_tracking_base | **Afiliado unificado na pessoa (vendedor).** Tabela `hotmart_affiliate_map` (nome do afiliado → `sellers`, espelha `hotmart_sck_map`) — afiliado e sck viram a MESMA pessoa (são as mesmas pessoas, canais diferentes). + colunas `hotmart_sales.src` (=`tracking.source`) e `external_code` (=`tracking.external_code`): tracking de origem/campanha, **NÃO carrega vendedor** (`xcode` a API não traz). Aditiva. |
| `20260626124506` | vendedores_rpcs | RPCs de vendedores via sck. `hotmart_scks(p_currency='BRL')` (molde `hotmart_produtos`) lista os sck distintos das vendas aprovadas com vendas/bruto/líquido + LEFT JOIN no mapa (`seller_id` NULL = a mapear) + flag `is_ruido` (visitor-id `^\d{10,}_\d+$` ou UTM `%\|%`); ordena candidatos primeiro (se truncar em 1000, cai só a cauda de visitor-id). `hotmart_by_seller(p_company,p_start,p_end,p_currency='BRL')` (molde `hotmart_by_affiliate`) junta vendas → `hotmart_sck_map` → `sellers` e soma por vendedor (variantes de grafia mapeadas pro mesmo vendedor somam). Hardening padrão. Alimenta tela Vendedores + seção "Total por vendedor". |
| `20260626124334` | vendedores_base | **Vendedores diretos (atribuição por sck).** Validação real: a API `/sales/history` traz `purchase.tracking.source_sck` (NÃO `sck`) — visitor-id/UTM (ruído) **ou** código fixo de vendedor (`raphaella_silva`, `maikom_vinicius`, `luiz_otavio`…). Cria `sellers` (cadastro, modelo-equipe), `hotmart_sck_map` (de-para sck→vendedor, espelha `hotmart_product_map`) e colunas `hotmart_sales.sck` (o source_sck) + `sck_checked_at` (rodízio do backfill, mirror `commission_checked_at`). Aditiva. |
| `20260625211536` | hotmart_by_affiliate_rpc | RPC `hotmart_by_affiliate(p_company, p_start, p_end, p_currency='BRL')` → "Total por afiliado": agrupa as vendas com afiliado (`affiliate is not null and affiliate_commission > 0`) por nome e soma `comissao` (do afiliado), `bruto`, `total` e `liquido_produtor` (net da RB7), ordenado por comissão desc. Filtra moeda + allowlist de status de receita. Agregação no banco (PostgREST 1000-row), hardening = hotmart_totals (sql STABLE, search_path='', GRANT a authenticated). Alimenta a seção "Total por afiliado" da tela Hotmart. Read-only/aditiva. |
| `20260625211436` | hotmart_commissions_cron | Cron `hotmart-commissions-diario` (09:45 UTC, **depois** do sync 09:00 e do refresh-status 09:30): chama `hotmart-sync` em modo `refresh_commissions=400` via `net.http_post` lendo o Vault. Preenche afiliado/coprodução/líquido exato. O backfill inicial (~14,9k) rodou por um cron temporário `hotmart-commissions-backfill` (*/2, auto-removível ao zerar) — não versionado. |
| `20260625210240` | hotmart_commission_checked_at | Coluna `hotmart_sales.commission_checked_at timestamptz` pro rodízio do preenchimento de comissões via `/sales/commissions` (espelha `status_checked_at`; NULL = nunca checada, prioridade no backfill). O `/sales/history` NÃO traz comissão de afiliado/coprodução nem o líquido exato — só a API `/sales/commissions` (por transação) traz. Aditiva/read-only. |
| `20260625192507` | transferencias | **Transferência entre contas.** Coluna `entries.transfer_id uuid` + índice parcial. Uma transferência = 2 lançamentos pagos amarrados pelo `transfer_id`: saída (`payable`) na conta de origem + entrada (`receivable`) no destino, ambos **sem `chart_of_account`** (neutros na DRE). Cada perna fica na empresa da sua própria conta (suporta entre empresas). Saldos (`account_balances`/`account_ledger`) incluem as pernas (efeito desejado). Redefine `dre_cash_reconciliation` (corpo idêntico + `and e.transfer_id is null` nos 2 CTEs) pra transferência não inflar os números brutos. Frontend: botão "Transferência" em Contas a Pagar/Receber, selo nas listas (fora dos KPIs/total), exclusão apaga as 2 pernas, Dashboard tira do fluxo. |
| `20260625185947` | account_type_cash | Novo tipo de conta **"Conta caixa"** (`cash`) no enum `account_type` (após `checking`). Caixa = dinheiro em espécie: sem OFX, saldo = saldo inicial + lançamentos pagos (RPCs `account_balances`/`account_ledger` inalteradas — já tratam tudo que não é "checking com OFX" por esse caminho). Aditiva/backward-compatible. Frontend: ícone Wallet, rótulo "Conta caixa" e opção nos selects da tela Contas. |
| `20260625163650` | remove_categorias | **Remoção TOTAL do conceito de categoria** (decisão do Luiz, 2026-06-25). A classificação financeira passa a ser só Plano de Contas (`chart_of_accounts`) + Produto DRE (`dre_products`). Dropa: RPCs órfãs `relatorio_categorias` e `dre_competencia` (a DRE viva é `dre_by_competency`, nature-based); colunas `entries.category_id`, `bank_transactions.category_id`/`auto_categorized`, `transactions.category`/`auto_categorized`, `purchase_items.category`; tabelas `categories`/`purchase_item_categories`/`auto_rules`. **IRREVERSÍVEL** — apagou 915 categorizações de cartão, 76 lançamentos, 10 compras, 62 auto-regras, dicionários (13+8). Frontend limpo nas Fases 1/2 (telas Categorias e Relatório de Categorias removidas, auto-categorização aposentada, `useFaturaWorld`/`TagSelector` apagados, FaturaDashboard slim). Verificado pós-apply: 0 colunas/tabelas/RPCs de categoria. |
| `20260610194751` | hotmart_totals_rpc | RPC de agregação dos KPIs Hotmart (PostgREST limita resposta a 1000 linhas — somas vão pro banco). SECURITY INVOKER, search_path='', GRANT explícito a authenticated. |
| `20260610202455` | enable_cron_net | Habilita pg_cron + pg_net pro auto-sync diário da Hotmart. |
| `20260610203722` | hotmart_cron_daily | Job `hotmart-sync-diario` (09:00 UTC): chama a Edge Function `hotmart-sync` via `net.http_post` em modo-serviço, lendo o segredo do **Vault** (`hotmart_service_key`); janela 1 mês, timeout 60s, idempotente. |
| `20260611002326` | phase3_data_fixes | Fase 3 — 2 fixes pontuais (valor 1.16398→1163.98; regra captions.ai Viagem→Ferramenta). Diagnóstico atestou dados íntegros; categoria continua TEXTO por design. |
| `20260611021420` | move_pgnet_to_extensions | Move pg_net do public pro schema extensions (advisor 0014). API `net.*` inalterada; cron re-testado vivo. |
| `20260622125458` | fatura_ofx_storage | Bucket Storage PRIVADO `faturas-ofx` (10 MB/arquivo) + policy RLS modelo equipe escopada ao bucket (+1 WARN `rls_policy_always_true` aceito) + coluna `invoices.ofx_path text`. Guarda o `.ofx` original de cada import novo (best-effort no `importarFatura.ts`; botão "Baixar OFX" na tela da fatura). Faturas pré-existentes ficam `ofx_path` NULL. |
| `20260622133542` | transactions_kind | Coluna `transactions.kind text not null default 'debit' check (in 'debit','credit')`. O parser de cartão passou a importar créditos do OFX (estornos/descontos) que ABATEM o total — `amount` segue positivo, `kind` dá o sinal (helper `valorComSinal`). Pagamento da fatura anterior (CREDIT memo `/PAGAMENTO\|BOLETO/`) é descartado. Backfill: 1321 tx viram 'debit'. Desvia do contrato #3 (decisão do Luiz, 2026-06-22). Faturas antigas seguem com total inflado até reimportar. |
| `20260622164136` | account_balances_rpc | Controle de saldo (passo 1/4 do bloco financeiro). 2 RPCs server-side espelhando `hotmart_totals` (sql STABLE, SECURITY INVOKER, search_path='', GRANT a authenticated+service_role): `account_balances(p_company)` = saldo por conta com a regra **OFX XOR lançamentos-pagos** (exclusivo por conta) movida do cliente pro banco — mata o bug do `.in()` em `Contas.tsx` que truncava em 1000 linhas; `account_ledger(p_account,p_start,p_end)` = extrato com saldo acumulado (running balance real na data, desempate por data+imported_at/created_at+id). Sem coluna nova. +2 índices (`idx_bank_tx_account_date` compartilhado com a futura Conciliação, `idx_entries_account_paid`). Saldo fica R$0 até preencher initial_balance/account_id. |
| `20260622170139` | relatorio_categorias_rpc | Relatório de categorias (passo 2/4 — o "motor" de agregação que a DRE reusa). RPC `relatorio_categorias(p_start,p_end,p_company,p_regime,p_inc_cartao,p_inc_entries,p_inc_extrato)` soma por categoria atravessando a assimetria categoria-TEXTO (cartão) vs FK (entries/bank). Fixes dos críticos: **dedup de categorias por `lower(btrim(name))`** (categories.name não é unique team-wide → evita fan-out que dobraria somas), **anti-dupla-contagem** (exclui `entries.invoice_account_id` not null; extrato só `entry_id IS NULL`), blindagem regex no `to_date` do cartão, 3 sinais normalizados. Decisões: consolidado com toggles, regime=competência default, cartão sempre visível (sem company_id, igual Dashboard, alinhado c/ DRE), Hotmart+Compras fora. Sem coluna nova. |
| `20260622171823` | dre_competencia_rpc | DRE gerencial por margem de contribuição (passo 3/4 — estrutura do Excel do contato da RB7). Coluna `categories.dre_group` (CHECK: Receita Bruta/Dedução/Custo Variável/Despesa Fixa/Resultado Financeiro/Imposto s/ Lucro; NULL=a classificar) + RPC `dre_competencia(p_company,p_start,p_end,p_currency)` que devolve `(bloco,categoria,valor)`; o frontend monta a cascata (Receita Bruta→Deduções→Receita Líquida→Custos Var→Margem→Despesas Fixas→EBITDA→Resultado Fin→Impostos→Lucro). Receita = Hotmart gross **por produto** (SKU cru; de-para p/ taxonomia do Excel = v2); deduções = taxas+comissões Hotmart; despesas = cartão+entries por `dre_group` da categoria (reusa os fixes do passo 2). Classificação inicial das 13 categorias semeada à parte (UPDATE de dados, ajustável na tela Categorias). v1 consolidada (decisão do Luiz). |
| `20260623135902` | entries_charges_discount | Juros, multa e desconto nos lançamentos (pagar **e** receber). 3 colunas `entries.interest_amount/fine_amount/discount_amount` (`numeric(14,2) not null default 0`, CHECK `>= 0`; aditivas → backfill trivial, RLS de equipe já cobre). **Valor pago/recebido = amount + juros + multa − desconto** (sinal de caixa pelo `type`, como o amount). Recria 3 RPCs (hardening preservado): `account_balances`/`account_ledger` passam a usar o valor com encargos no movimento da entry PAGA (saldo fecha com o extrato); `dre_competencia` ganha aporte ao bloco **Resultado Financeiro** (payable juros/multa +, desconto −; receivable é o espelho), sem dupla contagem do amount original. **NÃO** toca `relatorio_categorias` (gasto por categoria = valor de face) nem as RPCs de conciliação (casar o delta extrato−entry nos encargos = follow-up). Frontend: 3 campos no form de lançamento (pagar/receber) + sublinha "pago" na coluna Valor + card Pago/Recebido no caixa real + colunas opcionais Juros/Multa/Desconto no import. Smoke pós-apply ✅ (rollback forçado): delta de saldo −1060,00; DRE RF +60,00. Advisors: nada novo. |
| `20260624210012` | dre_by_product_rpc | **DRE por produto (2/2).** RPC `dre_by_product(p_company, p_year, p_month_from, p_month_to, p_currency)` → `(dre_product_id, bloco, valor)`. ACIMA DA MARGEM rateia por produto: Hotmart por SKU mapeado (gross→receita_bruta, hotmart_fee→deducao, afiliados+coprod→custo_variavel) + entries de contas rateáveis (nature revenue/deduction/variable_cost) por `dre_product_id` (NULL = a classificar; exclui `invoice_account_id`). ESTRUTURA (empresa, NULL): entries fixed_cost/financial/depreciation/tax. Classifica pela natureza da conta (sem filtro de type). Tela `/dre-produto` pivota (produtos nas colunas, MC por produto; estrutura só no Total). Read-only, hardening = hotmart_totals. |
| `20260624205030` | hotmart_produtos_rpc | RPC `hotmart_produtos(p_currency='BRL')` — resumo por SKU cru do Hotmart (product, vendas, bruto, líquido) com LEFT JOIN no `hotmart_product_map` (SKU novo → `dre_product_id` NULL). Agrega no banco (PostgREST 1000-row). Alimenta a tela `/produtos-hotmart`. Read-only, hardening = hotmart_totals. |
| `20260624204653` | dre_produto_base | **Base da DRE por produto.** (1) `chart_of_accounts.rateio_por_produto boolean` default por natureza (true = revenue/deduction/variable_cost, "acima da margem"). (2) Tabela `hotmart_product_map (product PK, dre_product_id FK)` RLS-equipe = de-para SKU Hotmart → produto da DRE. (3) Seed: ~56 SKUs auto-mapeados por palavra-chave (Apruma/Colheita/Trampolim → mentorias; Virada/Imersão → Palestras; comunidade/recorrência → Recorrência; combo/pagamento/mastermind/visita/boné → NULL "a classificar"; resto → Cursos). Aditiva. O Luiz refina os ~8 ambíguos na tela `/produtos-hotmart`. |
| `20260624202331` | plano_contas_v2 | **Substitui o plano de contas DRE pelo v2 do contador** (`RB7_Plano_de_Contas_DRE_v2.xlsx`): 46 → **82 contas** (numeração nova: 1 Receita→2 Deduções→4 Custos Var→6 Despesas Fixas→8 Financeiro→9 Depreciação→11 IRPJ/CSLL). Naturezas mapeiam 1:1 no enum atual → **DRE.tsx e dre_by_competency inalteradas** (são nature-based). Migration: captura o código antigo dos 18 lançamentos classificados → apaga o plano antigo (zera refs; entries SET NULL, parent_id RESTRICT) → insere o v2 (code/name/nature) → deriva parent_id (pelo código), sort_order (3 díg/segmento) e is_analytical (grupo=tem filha) → **re-classifica os 18 lançamentos via de-para das 7 contas em uso** (sem perda). FORA do plano (não lançáveis): subtotais (3/5/7/10/12), Balanço (B.1/B.2), 3 cursos-placeholder. Limitação herdada: `nature='financial'` só capta saída (8.1 Receitas Financeiras não vai à DRE até a RPC evoluir). Verificado pós-apply. |
| `20260624171720` | hotmart_a_liberar | RPC `hotmart_a_liberar(p_company, p_currency='BRL')` → soma do `net_amount` das vendas Hotmart aprovadas com `release_date >= current_date` (o "A liberar"/previsibilidade de saque do Dashboard), agregada no banco — o sum client-side truncava em 1000 linhas (mesma razão da `hotmart_totals`). Hardening = espelha hotmart_totals (sql STABLE, SECURITY INVOKER, `search_path=''`, revoke public/anon + GRANT a authenticated). Read-only/aditiva (só cria função). Sanity pós-apply: 0 vendas a liberar hoje → RPC devolve 0 (dado real, não subcount). O hero do Dashboard passou a ler o "A liberar" desta RPC. |
| `20260622174210` | reconciliation | Conciliação bancária (passo 4/4 — o último). Liga extrato (`bank_transactions`) a contas a pagar/receber (`entries`) via o hook `bank_transactions.entry_id` que já existia desde a Fase 1c (nunca exercido). Colunas: `bank_transactions.reconciled_at/reconciled_by`, `entries.paid_via_reconciliation`; **unique index parcial** em `entry_id` (1:1 estrito). 4 RPCs (hardening hotmart_totals): `reconciliation_suggest` (casa por conta+valor-com-sinal+tipo+data±tolerância), `reconcile_entry` (liga + **bootstrap do account_id** + marca pago só se não era pago, p/ desfazer seguro), `unreconcile_entry` (reverte só o que a conciliação marcou via `paid_via_reconciliation`), `reconciliation_summary`. **Inerte até importar OFX** (bank_transactions vazia hoje). Fora do v1: caso fatura-de-cartão (invoice_account_id) e N:1. |

---

## `20260624115030_dre_plano_contas.sql` — DRE completa por plano de contas

> **Status: APLICADA em 2026-06-24 via MCP `apply_migration` (aprovada pelo Luiz).**

O que faz (numa única transação, exceto o `ADD VALUE` inicial):

1. `ALTER TYPE public.entry_status ADD VALUE IF NOT EXISTS 'refunded'` — adiciona status de estorno ao enum existente.
2. Cria `public.chart_of_accounts` + seed completo do plano de contas para infoprodutor (40 contas): grupos 1–6 (Receitas, Custos Variáveis, Despesas Fixas, Financeiras, Depreciação, Impostos s/ Lucro) + contas analíticas 1.1.01–6.1.02. RLS `USING(true) WITH CHECK(true)` para authenticated.
3. Cria `public.dre_products` + seed (12 produtos/centros de custo: Mentoria Individual, Apruma, Trampolim, Colheita, Cursos, Ebooks, Livros, Recorrência, Palestras, Publicidade, Não Rateado, Outras). RLS idem.
4. Adiciona 7 colunas a `public.entries`: `competency_date date` (data de competência para DRE; usa `issue_date` quando NULL), `chart_of_account_id uuid FK`, `dre_product_id uuid FK`, `refund_of_entry_id uuid FK` (vínculo de estorno), `parent_entry_id uuid FK` (série de apropriação temporal), `appropriation_month int`, `appropriation_total_months int`. + 3 índices.
5. Cria `public.entry_installments` — parcelas de caixa de uma venda única (entry_id FK CASCADE, installment_number, due_date, amount, payment_date, status). RLS idem.
6. Cria `public.closed_periods` — trava mensal por empresa (company_id FK CASCADE, period 'YYYY-MM' com regex check, UNIQUE(company_id, period), closed_by FK SET NULL). RLS: SELECT + INSERT + DELETE para authenticated.
7. Cria `public.entry_audit_log` — log de alterações em entries (entry_id FK CASCADE, changed_by FK SET NULL, field_name, old_value, new_value). RLS: só SELECT para authenticated (INSERT via trigger SECURITY DEFINER). Trigger `entry_audit_log_tg` AFTER UPDATE em entries loga alterações em: status, amount, competency_date, due_date, chart_of_account_id, dre_product_id, description, counterparty.
8. RPC `public.dre_by_competency(p_company_id, p_year, p_month_from=1, p_month_to=12)` — pivot anual por conta contábil: retorna todas as contas ativas com colunas m1..m12 (soma dos entries por mês de competência); grupos retornam zeros, frontend soma filhos. Filtra `status NOT IN ('cancelled','refunded')`, separa receivable (revenue/deduction) de payable (demais). SET search_path=''; SECURITY DEFINER; GRANT a authenticated.
9. RPC `public.dre_cash_reconciliation(p_company_id, p_year)` — 12 linhas fixas comparando DRE (competência = COALESCE(competency_date, issue_date)) vs caixa (payment_date) por mês; retorna dre_receivable, dre_payable, cash_receivable, cash_payable, dre_net, cash_net, difference. SET search_path=''; SECURITY DEFINER; GRANT a authenticated.

Smoke test a fazer pós-apply:
- `SELECT count(*) FROM chart_of_accounts` = 40; `SELECT count(*) FROM dre_products` = 12
- Abrir Contas a Pagar, criar lançamento com Data de Competência + Conta DRE + Produto → salvar → verificar na tabela
- Abrir DRE (nova versão por plano de contas) → conferir linha Receita Bruta e subtotais
- Abrir Conciliação DRE → ano atual → ver 12 linhas
- Abrir Plano de Contas, Produtos DRE, Períodos Fechados → carregam sem erro

Infra fora do histórico de migrations: Edge Function **`hotmart-sync`**
(deployada no projeto Supabase; fonte versionada em
`supabase/functions/hotmart-sync/index.ts`; verify_jwt=false; modos
usuário/serviço/debug). Os SEGREDOS vivem só no projeto (não no repo):
`HOTMART_CLIENT_ID`/`HOTMART_CLIENT_SECRET`/`HOTMART_SYNC_SERVICE_KEY` no env
da function e `hotmart_service_key` no **Vault** (consumido pelo cron).
hotmart_sales carrega ~13k vendas reais (backfill 12 meses, 2026-06-10).
