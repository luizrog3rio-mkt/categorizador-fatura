import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
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

const alignClasse = (a?: string) =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

export default function DataTable<T>({ columns, data, tableKey, getRowId, empty, enableSelection, rowSelection, onRowSelectionChange }: DataTableProps<T>) {
  const prefs = useColumnPrefs(tableKey)
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

  const ordemIds = table.getVisibleLeafColumns().map((c) => c.id)
  const temFooter = table.getVisibleLeafColumns().some((col) => colMap.get(col.id)?.footer !== undefined)

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
      <div className="flex justify-end mb-2">
        <ColunasMenu table={table} columns={columns} onReset={prefs.reset} />
      </div>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
        >
          <table className="table-fixed border-collapse text-sm" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200">
                  {enableSelection && (
                    <th className="bg-white px-3 py-3 align-middle" style={{ width: 44 }}>
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
                      />
                    ))}
                  </SortableContext>
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={`border-b border-slate-100 ${row.getIsSelected() ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                  {enableSelection && (
                    <td className="px-3 py-2.5 align-middle" style={{ width: 44 }}>
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
                      style={{ width: cell.column.getSize() }}
                      className={`px-4 py-2.5 align-middle ${alignClasse(colMap.get(cell.column.id)?.align)}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length + (enableSelection ? 1 : 0)} className="text-center py-10 text-slate-400 text-sm">
                    {empty ?? 'Nada por aqui.'}
                  </td>
                </tr>
              )}
            </tbody>
            {temFooter && table.getRowModel().rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  {enableSelection && <td style={{ width: 44 }} />}
                  {table.getVisibleLeafColumns().map((col) => {
                    const dc = colMap.get(col.id)
                    return (
                      <td
                        key={col.id}
                        style={{ width: col.getSize() }}
                        className={`px-4 py-2.5 align-middle font-semibold text-slate-800 ${alignClasse(dc?.align)}`}
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
      className="cursor-pointer accent-indigo-600 align-middle disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

function CabecalhoCelula<T>({ header, align, podeReordenar }: { header: Header<T, unknown>; align?: string; podeReordenar: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
    disabled: !podeReordenar,
  })
  const style: CSSProperties = {
    width: header.getSize(),
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : undefined,
  }
  const just = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th ref={setNodeRef} style={style} className="relative bg-white px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 select-none">
      <div
        className={`flex items-center gap-1 ${just} ${alignClasse(align)} ${podeReordenar ? 'cursor-grab active:cursor-grabbing' : ''}`}
        {...(podeReordenar ? { ...attributes, ...listeners } : {})}
      >
        {flexRender(header.column.columnDef.header, header.getContext())}
      </div>
      {header.column.getCanResize() && (
        <div
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-indigo-300 ${header.column.getIsResizing() ? 'bg-indigo-400' : ''}`}
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50"
        title="Organizar colunas"
      >
        <SlidersHorizontal size={14} /> Colunas
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 z-20 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <p className="px-2 py-1 text-xs text-slate-400">Mostrar colunas</p>
            <div className="max-h-72 overflow-y-auto">
              {ocultaveis.map((col) => (
                <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
                  <span className="truncate">{rotulo(col.id)}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => { onReset(); setAberto(false) }}
              className="mt-1 w-full border-t border-slate-100 px-2 py-1.5 text-left text-xs text-slate-500 hover:text-indigo-600"
            >
              Restaurar padrão
            </button>
          </div>
        </>
      )}
    </div>
  )
}
