// src/components/reports/annual-rollup-table.tsx
"use client"

import type { AnnualRollupData, AnnualRollupRow } from "@/app/actions/annual-reports"

interface AnnualRollupTableProps {
  data: AnnualRollupData
  className?: string
}

const formatBRL = (cents: number | null): string => {
  if (cents === null) return "—"
  const value = cents / 100
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)
}

const CellBRL = ({ value, highlight = false }: { value: number | null; highlight?: boolean }) => {
  if (value === null) return <td className="px-3 py-2 text-right font-mono text-xs text-txt-300">—</td>
  const positive = value >= 0
  const colorClass = highlight
    ? positive ? "text-trade-buy" : "text-trade-sell"
    : "text-txt-100"
  return (
    <td className={`px-3 py-2 text-right font-mono text-xs ${colorClass} tabular-nums`}>
      {formatBRL(value)}
    </td>
  )
}

const CellNum = ({ value }: { value: number | null }) => (
  <td className="px-3 py-2 text-right font-mono text-xs text-txt-100 tabular-nums">
    {value === null ? "—" : value}
  </td>
)

const RowData = ({ row }: { row: AnnualRollupRow }) => {
  if (row.disabled) {
    return (
      <tr className="opacity-30">
        <th scope="row" className="sticky left-0 bg-bg-200 px-3 py-2 text-left text-xs font-medium text-txt-200 min-w-[80px]">
          {row.monthName.slice(0, 3)}
        </th>
        {Array.from({ length: 13 }).map((_, i) => (
          <td key={i} className="px-3 py-2 text-right font-mono text-xs text-txt-300">—</td>
        ))}
      </tr>
    )
  }

  const rowOpacity = !row.hasTrades ? "opacity-40" : ""

  return (
    <tr className={`border-t border-bg-300 hover:bg-bg-300/30 transition-colors ${rowOpacity}`}>
      <th scope="row" className="sticky left-0 bg-bg-200 px-3 py-2 text-left text-xs font-medium text-txt-100 min-w-[80px]">
        {row.monthName.slice(0, 3)}
      </th>
      <CellBRL value={row.resultadoBruto} />
      <CellBRL value={row.resultadoLiquido} highlight />
      <CellNum value={row.pontos} />
      <CellBRL value={row.taxas} />
      <CellBRL value={row.imposto} />
      <CellBRL value={row.aporteInicial} />
      <CellBRL value={row.mesAnterior} />
      <CellBRL value={row.novoAporte} />
      <CellBRL value={row.retirada} />
      <CellBRL value={row.capitalInvestido} />
      <CellBRL value={row.patrimonio} />
      <CellNum value={row.diasGain} />
      <CellNum value={row.diasLoss} />
    </tr>
  )
}

const AnnualRollupTable = ({ data, className }: AnnualRollupTableProps) => {
  const { rows, totals, taxEstimated } = data

  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-md border border-bg-300">
        <table className="w-full border-collapse text-left" aria-label={`Annual rollup ${data.year}`}>
          <caption className="sr-only">Annual P&L Rollup — {data.year}</caption>
          <colgroup>
            <col className="w-[80px]" />
            <col span={3} />
            <col span={2} />
            <col span={6} />
            <col span={2} />
          </colgroup>
          <thead>
            <tr className="bg-bg-300/50">
              <th scope="col" className="sticky left-0 bg-bg-300/50 px-3 py-2 text-left text-xs font-medium text-txt-300 uppercase tracking-wider">
                Mês
              </th>
              <th scope="colgroup" colSpan={3} className="px-3 py-1 text-center text-xs font-medium text-txt-300 uppercase tracking-wider border-b border-acc-100/20">
                Resultado
              </th>
              <th scope="colgroup" colSpan={2} className="px-3 py-1 text-center text-xs font-medium text-txt-300 uppercase tracking-wider border-b border-acc-100/20">
                Despesas
              </th>
              <th scope="colgroup" colSpan={6} className="px-3 py-1 text-center text-xs font-medium text-txt-300 uppercase tracking-wider border-b border-acc-100/20">
                Capital
              </th>
              <th scope="colgroup" colSpan={2} className="px-3 py-1 text-center text-xs font-medium text-txt-300 uppercase tracking-wider border-b border-acc-100/20">
                Dias
              </th>
            </tr>
            <tr className="bg-bg-300/30">
              <th scope="col" className="sticky left-0 bg-bg-300/30 px-3 py-2" />
              {["Bruto", "Líquido", "Pontos"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300">
                  {h}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300">Taxas</th>
              <th scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300">
                Imposto{taxEstimated ? "*" : ""}
              </th>
              {["Aporte Inicial", "Mês Anterior", "Novo Aporte", "Retirada", "Capital Invest.", "Patrimônio"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300 whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300">G</th>
              <th scope="col" className="px-3 py-2 text-right font-mono text-xs font-medium text-txt-300">L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowData key={row.month} row={row} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bg-300 border-t-2 border-bg-400 font-semibold">
              <th scope="row" className="sticky left-0 bg-bg-300 px-3 py-2 text-left text-xs text-txt-100">
                Total
              </th>
              <CellBRL value={totals.resultadoBruto} />
              <CellBRL value={totals.resultadoLiquido} highlight />
              <CellNum value={totals.pontos} />
              <CellBRL value={totals.taxas} />
              <CellBRL value={totals.imposto} />
              <td className="px-3 py-2 text-right font-mono text-xs text-txt-300">—</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-txt-300">—</td>
              <CellBRL value={totals.novoAporte} />
              <CellBRL value={totals.retirada} />
              <td className="px-3 py-2 text-right font-mono text-xs text-txt-300">—</td>
              <CellBRL value={totals.patrimonio} />
              <CellNum value={totals.diasGain} />
              <CellNum value={totals.diasLoss} />
            </tr>
          </tfoot>
        </table>
      </div>

      {taxEstimated && (
        <p className="mt-2 text-xs text-txt-300">
          * Imposto estimado com base na alíquota de IR configurada. Dados do Tax Engine (quando disponível) substituirão esta estimativa.
        </p>
      )}
    </div>
  )
}

export { AnnualRollupTable }
