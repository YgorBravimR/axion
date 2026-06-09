"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, RefreshCcw, Save } from "lucide-react"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/toast"
import { useFormatting } from "@/hooks/use-formatting"
import { setMonthlyCapital } from "@/app/actions/fractal-plan/monthly"

interface MonthCapitalPopoverProps {
	monthlyPlanId: string
	monthLabel: string
	currentCapitalCents: number
	prevMonthEndCents: number | null
}

const MonthCapitalPopover = ({
	monthlyPlanId,
	monthLabel,
	currentCapitalCents,
	prevMonthEndCents,
}: MonthCapitalPopoverProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const { formatCurrency } = useFormatting()
	const formatBRL = (cents: number): string => formatCurrency(cents / 100)
	const [open, setOpen] = useState(false)
	const [isPending, startTransition] = useTransition()
	const [valueCents, setValueCents] = useState<number | null>(
		currentCapitalCents
	)
	const [propagate, setPropagate] = useState(true)

	const handleUsePrevMonth = () => {
		if (prevMonthEndCents === null) {
			return
		}
		setValueCents(prevMonthEndCents)
	}

	const handleSubmit = () => {
		const cents = valueCents !== null ? Math.round(valueCents) : 0
		if (!Number.isFinite(cents) || cents <= 0) {
			showToast("error", "Capital deve ser número positivo.")
			return
		}
		startTransition(async () => {
			const res = await setMonthlyCapital({
				monthlyPlanId,
				capitalCents: cents,
				propagateForward: propagate,
			})
			if (res.status === "success") {
				showToast(
					"success",
					propagate && res.data?.forwardUpdated
						? `Capital atualizado · ${res.data.forwardUpdated} meses adiante recalibrados`
						: "Capital atualizado"
				)
				setOpen(false)
				router.refresh()
			} else {
				showToast("error", res.message || "Falha ao atualizar capital")
			}
		})
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Editar capital de ${monthLabel}`}
					className="right-s-200 top-s-200 text-txt-300 hover:bg-bg-300 hover:text-acc-100 focus-visible:ring-acc-100 absolute z-10 inline-flex size-7 items-center justify-center rounded-sm p-1 opacity-40 transition-opacity group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
					}}
				>
					<Pencil className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="space-y-s-300 p-m-400 w-72"
				onClick={(e) => e.stopPropagation()}
			>
				<div>
					<h4 className="text-small text-txt-100 font-medium">
						Capital · {monthLabel}
					</h4>
					<p className="text-tiny text-txt-300">
						Atual:{" "}
						<span className="font-mono">{formatBRL(currentCapitalCents)}</span>
					</p>
				</div>
				<div>
					<Label
						id={`capital-input-${monthlyPlanId}-lbl`}
						htmlFor={`capital-input-${monthlyPlanId}`}
					>
						Novo capital (R$)
					</Label>
					<CurrencyInput
						id={`capital-input-${monthlyPlanId}`}
						className="mt-s-100"
						value={valueCents}
						onValueChange={setValueCents}
						decimals={0}
						unit="cents"
					/>
				</div>
				<Button
					id={`capital-prev-${monthlyPlanId}`}
					type="button"
					variant="outline"
					size="sm"
					className="w-full"
					onClick={handleUsePrevMonth}
					disabled={prevMonthEndCents === null}
				>
					<RefreshCcw className="mr-s-200 size-3.5" />
					Usar saldo final do mês anterior
					{prevMonthEndCents !== null && (
						<span className="text-tiny text-txt-300 ml-auto font-mono">
							{formatBRL(prevMonthEndCents)}
						</span>
					)}
				</Button>
				<label
					htmlFor={`capital-propagate-${monthlyPlanId}`}
					className="gap-s-200 text-small text-txt-200 flex items-center"
				>
					<Checkbox
						id={`capital-propagate-${monthlyPlanId}`}
						checked={propagate}
						onCheckedChange={(v) => setPropagate(v === true)}
					/>
					<span>Aplicar a meses seguintes (sem override manual)</span>
				</label>
				<div className="gap-s-200 pt-s-200 flex justify-end">
					<Button
						id={`capital-cancel-${monthlyPlanId}`}
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setOpen(false)}
					>
						Cancelar
					</Button>
					<Button
						id={`capital-save-${monthlyPlanId}`}
						type="button"
						size="sm"
						onClick={handleSubmit}
						disabled={isPending}
					>
						<Save className="mr-s-200 size-3.5" />
						Salvar
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}

export { MonthCapitalPopover }
export type { MonthCapitalPopoverProps }
