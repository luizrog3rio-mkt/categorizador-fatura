import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SlidersHorizontal, FoldHorizontal, UnfoldHorizontal } from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type Header,
  type Table as TanTable,
  type RowSelectionState,
  type OnChangeFn,
} from '@tanstack/react-table'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { useColumnPrefs } from '../hooks/useColumnPrefs'

// Tabela reordenável (arrastar o cabeçalho), redimensionável (puxar a borda) e
// com colunas ocultáveis (menu). O layout é salvo por usuário (useColumnPrefs).
// Headless: a página só descreve as colunas (id/header/cell); o visual é Tailwind.
//
// Largura — 2 modos (preferência salva por tabela):
//  • "Ajustar à largura" (default): cabe tudo na tela. As colunas de NÚMERO/DATA
//    ficam no tamanho natural (nunca truncam); só as de TEXTO (Descrição etc.)
//    encolhem e truncam com "…" pra fechar a largura. Se nem assim couber (tela
//    estreita), cai pro scroll — mas número nunca é cortado.
//  • "Largura natural": colunas nos tamanhos px; quando passa da tela rola na
//    horizontal (a rodinha vertical já rola, sem shift) + sombra na borda direita.

export interface DataColumn<T> {
  id: string
  header: ReactNode
  label?: string // rótulo no menu de colunas (default: header se for texto)
  cell: (row: T) => ReactNode
  size?: number
  minSize?: number
  align?: 'left' | 'right' | 'center'
  footer?: ReactNode // se alguma coluna definir, a tabela renderiza um rodapé (ex.: total)
  enableReorder?: boolean // default true
  enableResize?: boolean // default true
  enableHiding?: boolean // default true
  grow?: boolean // no modo fit, esta coluna encolhe/trunca (texto). default: heurística (esquerda & larga)
}

interface DataTableProps<T> {
  columns: DataColumn<T>[]
  data: T[]
  tableKey: string
  getRowId: (row: T) => string
  empty?: ReactNode
  // seleção de linhas (opt-in): a coluna de checkbox vive FORA do columnOrder
  // (sempre fixa à esquerda, fora do menu/reordenação). Controlada pela página.
  enableSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
}

const SEL_W = 44 // largura da coluna de checkbox
const FLEX_MIN = 64 // largura mínima de uma coluna de texto no modo fit

const alignClasse = (a?: string) =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

export default function DataTable<T>({ columns, data, tableKey, getRowId, empty, enableSelection, rowSelection, onRowSelectionChange }: DataTableProps<T>) {
  const prefs = useColumnPrefs(tableKey)
  const fit = prefs.fitWidth
  const colMap = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  const columnDefs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: () => c.header,
        cell: (ctx) => c.cell(ctx.row.original),
        size: c.size ?? 150,
        minSize: c.minSize ?? 60,
        enableResizing: c.enableResize !== false,
        enableHiding: c.enableHiding !== false,
      })),
    [columns]
  )

  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    state: {
      columnOrder: prefs.columnOrder,
      columnSizing: prefs.columnSizing,
      columnVisibility: prefs.columnVisibility,
      rowSelection: rowSelection ?? {},
    },
    onColumnOrderChange: prefs.onColumnOrderChange,
    onColumnSizingChange: prefs.onColumnSizingChange,
    onColumnVisibilityChange: prefs.onColumnVisibilityChange,
    onRowSelectionChange,
    enableRowSelection: !!enableSelection,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const visibleCols = table.getVisibleLeafColumns()
  const ordemIds = visibleCols.map((c) => c.id)
  const temFooter = visibleCols.some((col) => colMap.get(col.id)?.footer !== undefined)

  // texto (encolhe) vs rígida (número/data/ação — mantém o tamanho). Heurística:
  // alinhada à esquerda E larga (>=140) = texto; a página pode forçar via `grow`.
  const ehFlex = (id: string, size: number) => {
    const dc = colMap.get(id)
    if (dc?.grow !== undefined) return dc.grow
    return (dc?.align ?? 'left') !== 'right' && size >= 140
  }

  // ── medir a largura disponível (p/ decidir se o fit cabe) ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const selW = enableSelection ? SEL_W : 0
  const flexCols = visibleCols.filter((c) => ehFlex(c.id, c.getSize()))
  const rigidTotal = visibleCols.filter((c) => !ehFlex(c.id, c.getSize())).reduce((s, c) => s + c.getSize(), 0) + selW
  const flexNatural = flexCols.reduce((s, c) => s + c.getSize(), 0) || 1
  const naturalTotal = visibleCols.reduce((s, c) => s + c.getSize(), 0) + selW
  const avail = containerW - rigidTotal
  // o fit "fecha" a largura só se sobra espaço pras colunas de texto no mínimo
  const fitsAll = fit && containerW > 0 && flexCols.length > 0 && avail >= flexCols.length * FLEX_MIN

  // distribui `avail` entre as colunas de texto respeitando o mínimo, somando
  // EXATO (os que batem no piso fixam; o resto reparte o que sobra) — assim não
  // sobra 1-2px de scroll.
  const flexW = new Map<string, number>()
  if (fitsAll) {
    const floored = flexCols.filter((c) => (c.getSize() / flexNatural) * avail < FLEX_MIN)
    let restante = avail
    let base = flexNatural
    floored.forEach((c) => { flexW.set(c.id, FLEX_MIN); restante -= FLEX_MIN; base -= c.getSize() })
    const resto = flexCols.filter((c) => !floored.includes(c))
    resto.forEach((c) => flexW.set(c.id, base > 0 ? (c.getSize() / base) * restante : restante / Math.max(1, resto.length)))
  }
  const larguraPx = (col: { id: string; getSize: () => number }) =>
    fitsAll && flexW.has(col.id) ? flexW.get(col.id)! : col.getSize()
  const wcss = (n: number) => `${n}px`
  const truncCol = (id: string, size: number) => (fitsAll && ehFlex(id, size) ? 'truncate [&_p]:truncate' : '')
  const padX = fit ? 'px-2' : 'px-4'

  // ── scroll horizontal sem shift (rodinha vertical → horizontal) + sombra ──
  const [maisDireita, setMaisDireita] = useState(false)
  const atualizarSombra = () => {
    const el = scrollRef.current
    setMaisDireita(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return // nada a rolar na horizontal
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // já é horizontal
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    setMaisDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    return () => el.removeEventListener('wheel', onWheel)
  }, [fit, fitsAll, containerW, data, prefs.columnVisibility, prefs.columnSizing])

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const atual = table.getState().columnOrder.length
      ? table.getState().columnOrder
      : table.getAllLeafColumns().map((c) => c.id)
    const de = atual.indexOf(active.id as string)
    const para = atual.indexOf(over.id as string)
    if (de < 0 || para < 0) return
    prefs.onColumnOrderChange(arrayMove(atual, de, para))
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-2">
        <button
          type="button"
          onClick={() => prefs.setFitWidth(!fit)}
          title={fit ? 'Ver as colunas em largura natural (rola na horizontal)' : 'Ajustar as colunas à largura da tela'}
          className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-2"
        >
          {fit ? <UnfoldHorizontal size={14} /> : <FoldHorizontal size={14} />}
          {fit ? 'Largura natural' : 'Ajustar'}
        </button>
        <ColunasMenu table={table} columns={columns} onReset={prefs.reset} />
      </div>
      <div className="relative">
        <div ref={scrollRef} onScroll={atualizarSombra} className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={handleDragEnd}
          >
            <table className="table-fixed border-collapse text-sm tnum" style={fitsAll ? { width: '100%' } : { width: naturalTotal, minWidth: '100%' }}>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border">
                    {enableSelection && (
                      <th className={`bg-surface ${padX} py-2.5 align-middle`} style={{ width: wcss(SEL_W) }}>
                        <IndeterminateCheckbox
                          checked={table.getIsAllRowsSelected()}
                          indeterminate={table.getIsSomeRowsSelected()}
                          onChange={table.getToggleAllRowsSelectedHandler()}
                        />
                      </th>
                    )}
                    <SortableContext items={ordemIds} strategy={horizontalListSortingStrategy}>
                      {hg.headers.map((header) => (
                        <CabecalhoCelula
                          key={header.id}
                          header={header}
                          align={colMap.get(header.column.id)?.align}
                          podeReordenar={colMap.get(header.column.id)?.enableReorder !== false}
                          largura={wcss(larguraPx(header.column))}
                          padX={padX}
                          truncar={!!truncCol(header.column.id, header.column.getSize())}
                        />
                      ))}
                    </SortableContext>
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={`border-b border-border last:border-0 ${row.getIsSelected() ? 'bg-brand-subtle' : 'hover:bg-surface-2'}`}>
                    {enableSelection && (
                      <td className={`${padX} py-2.5 align-middle`} style={{ width: wcss(SEL_W) }}>
                        <IndeterminateCheckbox
                          checked={row.getIsSelected()}
                          disabled={!row.getCanSelect()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: wcss(larguraPx(cell.column)) }}
                        className={`${padX} py-2.5 align-middle ${alignClasse(colMap.get(cell.column.id)?.align)} ${truncCol(cell.column.id, cell.column.getSize())}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + (enableSelection ? 1 : 0)} className="text-center py-10 text-fg-subtle text-sm">
                      {empty ?? 'Nada por aqui.'}
                    </td>
                  </tr>
                )}
              </tbody>
              {temFooter && table.getRowModel().rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border-strong bg-surface-2">
                    {enableSelection && <td style={{ width: wcss(SEL_W) }} />}
                    {visibleCols.map((col) => {
                      const dc = colMap.get(col.id)
                      return (
                        <td
                          key={col.id}
                          style={{ width: wcss(larguraPx(col)) }}
                          className={`${padX} py-2.5 align-middle font-semibold text-fg ${alignClasse(dc?.align)} ${truncCol(col.id, col.getSize())}`}
                        >
                          {dc?.footer}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </DndContext>
        </div>
        {!fitsAll && maisDireita && (
          <div className="pointer-events-none absolute top-px bottom-px right-px w-12 rounded-r-card bg-gradient-to-l from-fg/[0.07] to-transparent" />
        )}
      </div>
    </div>
  )
}

// checkbox com estado "indeterminate" (parcial) — só setável via property, não atributo
function IndeterminateCheckbox({ checked, indeterminate, onChange, disabled }: {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: unknown) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !checked && !!indeterminate
  }, [checked, indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="cursor-pointer accent-brand align-middle disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

function CabecalhoCelula<T>({ header, align, podeReordenar, largura, padX, truncar }: { header: Header<T, unknown>; align?: string; podeReordenar: boolean; largura: string; padX: string; truncar: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
    disabled: !podeReordenar,
  })
  const style: CSSProperties = {
    width: largura,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : undefined,
  }
  const just = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th ref={setNodeRef} style={style} className={`relative bg-surface ${padX} h-10 text-xs font-medium uppercase tracking-wide text-fg-subtle select-none`}>
      <div
        className={`flex items-center gap-1 ${just} ${alignClasse(align)} ${podeReordenar ? 'cursor-grab active:cursor-grabbing' : ''} ${truncar ? 'min-w-0' : ''}`}
        {...(podeReordenar ? { ...attributes, ...listeners } : {})}
      >
        <span className={truncar ? 'truncate' : ''}>{flexRender(header.column.columnDef.header, header.getContext())}</span>
      </div>
      {header.column.getCanResize() && (
        <div
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-brand/40 ${header.column.getIsResizing() ? 'bg-brand' : ''}`}
          aria-hidden
        />
      )}
    </th>
  )
}

function ColunasMenu<T>({ table, columns, onReset }: { table: TanTable<T>; columns: DataColumn<T>[]; onReset: () => void }) {
  const [aberto, setAberto] = useState(false)
  const colMap = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])
  const ocultaveis = table.getAllLeafColumns().filter((c) => c.getCanHide())
  const rotulo = (id: string): string => {
    const dc = colMap.get(id)
    if (dc?.label) return dc.label
    if (typeof dc?.header === 'string' && dc.header.trim()) return dc.header
    return id
  }
  return (
    <div className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-2"
        title="Organizar colunas"
      >
        <SlidersHorizontal size={14} /> Colunas
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 z-20 w-60 rounded-control border border-border bg-surface p-2 shadow-pop">
            <p className="px-2 py-1 text-xs text-fg-subtle">Mostrar colunas</p>
            <div className="max-h-72 overflow-y-auto">
              {ocultaveis.map((col) => (
                <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input type="checkbox" className="accent-brand" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
                  <span className="truncate">{rotulo(col.id)}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => { onReset(); setAberto(false) }}
              className="mt-1 w-full border-t border-border px-2 py-1.5 text-left text-xs text-fg-subtle hover:text-brand"
            >
              Restaurar padrão
            </button>
          </div>
        </>
      )}
    </div>
  )
}
