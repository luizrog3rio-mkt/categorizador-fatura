// Export genérico de tabela (header + linhas arbitrárias) — reusado por relatórios
// (categorias, DRE...). Espelha o padrão pt-BR do exportFatura.ts: CSV com BOM +
// ';' + vírgula decimal + CRLF; XLSX via tarball oficial do SheetJS, com formato
// numérico '#,##0.00' nas células numéricas. O xlsx entra por dynamic import.

type Cell = string | number

export function exportTabelaCSV(header: string[], rows: Cell[][], filename: string) {
  const esc = (v: Cell) =>
    typeof v === 'number' ? v.toFixed(2).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`
  const linhas = [
    header.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'),
    ...rows.map((r) => r.map(esc).join(';')),
  ]
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${filename}.csv`)
}

export async function exportTabelaXLSX(header: string[], rows: Cell[][], filename: string, sheet = 'Relatório') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const range = XLSX.utils.decode_range(ws['!ref']!)
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00'
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
