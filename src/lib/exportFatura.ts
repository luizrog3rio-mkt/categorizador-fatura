// Export CSV/XLSX da fatura — contrato #9: CSV pt-BR (BOM + ';' + vírgula
// decimal + CRLF + "Sem categoria" fallback), nomes de arquivo fixos, XLSX
// com formato numérico e mesmas colunas. O xlsx entra por dynamic import:
// são ~400 kB que só servem pro botão exportar — fora do bundle inicial.

import { valorComSinal } from './fatura'

interface TxExport {
  date: string
  memo: string
  amount: number // magnitude positiva; o sinal contábil vem de kind
  category: string | null
  kind: 'debit' | 'credit'
}

export function exportCSV(transactions: TxExport[]) {
  const header = ['Data', 'Descrição', 'Valor (R$)', 'Categoria']
  const rows = transactions.map((t) => [
    t.date,
    `"${t.memo.replace(/"/g, '""')}"`,
    valorComSinal(t).toFixed(2).replace('.', ','),
    t.category ? `"${t.category.replace(/"/g, '""')}"` : 'Sem categoria',
  ])
  const csv = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, 'fatura_categorizada.csv')
}

export async function exportXLSX(transactions: TxExport[]) {
  const XLSX = await import('xlsx')
  const rows = transactions.map((t) => ({
    Data: t.date,
    Descrição: t.memo,
    'Valor (R$)': valorComSinal(t),
    Categoria: t.category || 'Sem categoria',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 13 }, { wch: 42 }, { wch: 14 }, { wch: 24 }]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  for (let ri = 1; ri <= range.e.r; ri++) {
    const cell = ws[XLSX.utils.encode_cell({ r: ri, c: 2 })]
    if (cell) cell.z = '#,##0.00'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fatura')
  XLSX.writeFile(wb, 'fatura_categorizada.xlsx')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
