-- APLICADA: 20260701030209
-- Auditoria arredondamento/moeda #7: invoices.total era numeric SEM escala e recebia a soma de
-- floats feita no cliente (importarFatura.ts: txs.reduce(+valorComSinal)) -> dust de ponto flutuante
-- gravado no banco (ex.: 140585.03999999992 em vez de 140585.04; as 6 faturas tinham >2 casas).
-- Fix em duas frentes: (a) o cliente agora arredonda pra 2 casas antes de gravar; (b) a coluna vira
-- numeric(14,2) -> o ALTER arredonda as 6 existentes E barra dust futuro no banco (defesa). Tabela
-- de 6 linhas, ALTER instantaneo. As demais colunas de dinheiro sem escala (transactions.amount,
-- purchase_items.amount, hotmart_sales.total_amount) estao LIMPAS e nao tem fonte de dust (valores
-- por-linha de 2 casas, nao somas) -> deixadas como estao (evita reescrever tabelas vivas).
alter table public.invoices alter column total type numeric(14,2) using round(total, 2);
