"use client"

import { useState, useTransition } from "react"
import { Receipt } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { markDarfPaid } from "@/app/actions/tax-engine"
import { cn } from "@/lib/utils"

type DarfStatus = "pending" | "paid" | "exempt" | "overdue"
type UiDarfStatus = DarfStatus | "in_progress"

interface MonthDarfRowProps {
	accountId: string
	year: number
	month: number
	darfStatus: DarfStatus
	darfDueCents: number
	darfDueDate: Date | null
	darfPaidAmountCents: number | null
	darfPaidAt: Date | null
	isFinal: boolean
}

const STATUS_LABEL: Record<UiDarfStatus, string> = {
	paid: "Pago",
	pending: "Pendente",
	overdue: "Vencido",
	exempt: "Isento",
	in_progress: "Em curso",
}

const STATUS_DOT: Record<UiDarfStatus, string> = {
	paid: "bg-fb-success",
	pending: "bg-warning",
	overdue: "bg-fb-error",
	exempt: "bg-txt-300",
	in_progress: "bg-action-buy",
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const MonthDarfRow = ({
	accountId,
	year,
	month,
	darfStatus,
	darfDueCents,
	darfDueDate,
	darfPaidAmountCents,
	darfPaidAt,
	isFinal,
}: MonthDarfRowProps) => {
	const uiStatus: UiDarfStatus = isFinal ? darfStatus : "in_progress"
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [isPrompting, setPrompting] = useState(false)
	const [paidInputCents, setPaidInputCents] = useState<number | null>(
		darfDueCents
	)

	const handleConfirm = () => {
		if (paidInputCents === null || paidInputCents < 0) {
			showToast("error", "Informe um valor válido em R$.")
			return
		}
		startTransition(async () => {
			const result = await markDarfPaid({
				accountId,
				year,
				month,
				paidAmountCents: paidInputCents,
			})
			if (result.status === "success") {
				showToast("success", "DARF marcado como pago.")
				setPrompting(false)
				router.refresh()
			} else {
				showToast("error", result.message ?? "Erro ao marcar como pago.")
			}
		})
	}

	const dueDateLabel = darfDueDate
		? new Date(darfDueDate).toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
			})
		: null
	const paidAtLabel = darfPaidAt
		? new Date(darfPaidAt).toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "2-digit",
			})
		: null

	return (
		<section
			id="month-darf-row"
			className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border"
			aria-label="DARF do mês"
		>
			<div className="gap-x-m-400 gap-y-s-200 flex flex-wrap items-center">
				<div className="gap-s-200 flex items-center">
					<Receipt className="text-acc-100 size-4" />
					<span className="text-small text-txt-100 font-medium">DARF</span>
					<span
						className={cn("size-2 rounded-full", STATUS_DOT[uiStatus])}
						aria-hidden="true"
					/>
					<span className="text-small text-txt-200">
						{STATUS_LABEL[uiStatus]}
					</span>
				</div>

				{uiStatus === "in_progress" && (
					<div className="gap-s-200 flex items-baseline">
						<span className="text-tiny text-txt-300">Prévia</span>
						<span className="text-small text-txt-200 font-mono tabular-nums">
							{formatBRL(darfDueCents)}
						</span>
						<span className="text-tiny text-txt-300">mês ainda em curso</span>
					</div>
				)}

				{uiStatus !== "in_progress" && uiStatus !== "exempt" && (
					<div className="gap-s-200 flex items-baseline">
						<span className="text-tiny text-txt-300">
							{uiStatus === "paid" ? "Calculado" : "Devido"}
						</span>
						<span className="text-small text-txt-100 font-mono tabular-nums">
							{formatBRL(darfDueCents)}
						</span>
						{dueDateLabel && uiStatus !== "paid" && (
							<span className="text-tiny text-txt-300">
								venc. {dueDateLabel}
							</span>
						)}
					</div>
				)}

				{uiStatus === "paid" && darfPaidAmountCents !== null && (
					<div className="gap-s-200 flex items-baseline">
						<span className="text-tiny text-txt-300">Pago</span>
						<span className="text-small text-trade-buy font-mono tabular-nums">
							{formatBRL(darfPaidAmountCents)}
						</span>
						{paidAtLabel && (
							<span className="text-tiny text-txt-300">em {paidAtLabel}</span>
						)}
					</div>
				)}

				{uiStatus === "pending" && darfDueCents > 0 && !isPrompting && (
					<Button
						id={`monthly-darf-prompt-${year}-${month}`}
						variant="outline"
						size="sm"
						className="ml-auto"
						onClick={() => setPrompting(true)}
					>
						Marcar como pago
					</Button>
				)}
			</div>

			{isPrompting && (
				<div className="mt-m-400 gap-s-200 border-bg-300 pt-m-400 grid border-t sm:grid-cols-[1fr_auto_auto]">
					<div className="gap-s-100 flex flex-col">
						<Label
							id={`monthly-darf-paid-label-${year}-${month}`}
							htmlFor={`monthly-darf-paid-input-${year}-${month}`}
						>
							Valor pago
						</Label>
						<CurrencyInput
							id={`monthly-darf-paid-input-${year}-${month}`}
							value={paidInputCents}
							onValueChange={setPaidInputCents}
							unit="cents"
							placeholder={formatBRL(darfDueCents)}
						/>
						<p className="text-micro text-txt-300">
							Calculado: {formatBRL(darfDueCents)}. Edite caso a guia paga tenha
							valor diferente — ambos serão registrados.
						</p>
					</div>
					<Button
						id={`monthly-darf-confirm-${year}-${month}`}
						variant="default"
						size="sm"
						onClick={handleConfirm}
						disabled={isPending}
					>
						Confirmar
					</Button>
					<Button
						id={`monthly-darf-cancel-${year}-${month}`}
						variant="ghost"
						size="sm"
						onClick={() => {
							setPrompting(false)
							setPaidInputCents(darfDueCents)
						}}
						disabled={isPending}
					>
						Cancelar
					</Button>
				</div>
			)}
		</section>
	)
}

export { MonthDarfRow }
export type { MonthDarfRowProps }
