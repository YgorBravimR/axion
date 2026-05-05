"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { createYearlyPlanV2, updateYearlyPlan } from "@/app/actions/fractal-plan/yearly"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

interface YearlyPlanEditorProps {
	year: number
	existing: {
		initialCapitalCents: number
		ladderRules: LadderRuleR[]
		tradingDaysPerWeek: number
		defaultDailyLossR: string | null
		defaultDailyWinR: string | null
		defaultWeeklyLossR: string | null
		defaultWeeklyWinR: string | null
		defaultMonthlyLossR: string | null
		defaultMonthlyWinR: string | null
		notes: string | null
	} | null
}

interface FormState {
	initialCapitalBRL: string
	tradingDaysPerWeek: string
	defaultDailyLossR: string
	defaultDailyWinR: string
	defaultWeeklyLossR: string
	defaultWeeklyWinR: string
	defaultMonthlyLossR: string
	defaultMonthlyWinR: string
	ladderRulesJson: string
	notes: string
}

const DEFAULT_LADDER: LadderRuleR[] = [
	{ minCapitalCents: 0, maxCapitalCents: 999_999_99, oneRCents: 100_00 },
	{ minCapitalCents: 1_000_000_00, maxCapitalCents: 4_999_999_99, oneRCents: 200_00 },
	{ minCapitalCents: 5_000_000_00, maxCapitalCents: 999_999_999_99, oneRCents: 500_00 },
]

const seedForm = (existing: YearlyPlanEditorProps["existing"]): FormState => {
	if (!existing) {
		return {
			initialCapitalBRL: "",
			tradingDaysPerWeek: "5",
			defaultDailyLossR: "3.00",
			defaultDailyWinR: "2.00",
			defaultWeeklyLossR: "6.00",
			defaultWeeklyWinR: "4.00",
			defaultMonthlyLossR: "10.00",
			defaultMonthlyWinR: "8.00",
			ladderRulesJson: JSON.stringify(DEFAULT_LADDER, null, 2),
			notes: "",
		}
	}
	return {
		initialCapitalBRL: (existing.initialCapitalCents / 100).toFixed(2),
		tradingDaysPerWeek: String(existing.tradingDaysPerWeek),
		defaultDailyLossR: existing.defaultDailyLossR ?? "",
		defaultDailyWinR: existing.defaultDailyWinR ?? "",
		defaultWeeklyLossR: existing.defaultWeeklyLossR ?? "",
		defaultWeeklyWinR: existing.defaultWeeklyWinR ?? "",
		defaultMonthlyLossR: existing.defaultMonthlyLossR ?? "",
		defaultMonthlyWinR: existing.defaultMonthlyWinR ?? "",
		ladderRulesJson: JSON.stringify(existing.ladderRules, null, 2),
		notes: existing.notes ?? "",
	}
}

const YearlyPlanEditor = ({ year, existing }: YearlyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [form, setForm] = useState<FormState>(() => seedForm(existing))

	const handleField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
		setForm((prev) => ({ ...prev, [key]: value }))
	}

	const parseLadder = (): LadderRuleR[] | null => {
		try {
			const parsed = JSON.parse(form.ladderRulesJson) as unknown
			if (!Array.isArray(parsed) || parsed.length === 0) return null
			return parsed.map((r) => {
				const rule = r as { minCapitalCents: number; maxCapitalCents: number; oneRCents: number }
				return {
					minCapitalCents: Number(rule.minCapitalCents),
					maxCapitalCents: Number(rule.maxCapitalCents),
					oneRCents: Number(rule.oneRCents),
				}
			})
		} catch {
			return null
		}
	}

	const handleSubmit = () => {
		const ladder = parseLadder()
		if (!ladder) {
			showToast("error", "Invalid ladder JSON. Must be array with minCapitalCents/maxCapitalCents/oneRCents.")
			return
		}
		const initialCapitalCents = Math.round(parseFloat(form.initialCapitalBRL.replace(",", ".")) * 100)
		if (!Number.isFinite(initialCapitalCents) || initialCapitalCents <= 0) {
			showToast("error", "Initial capital must be positive number.")
			return
		}

		const numericFields = {
			defaultDailyLossR: parseFloat(form.defaultDailyLossR),
			defaultDailyWinR: parseFloat(form.defaultDailyWinR),
			defaultWeeklyLossR: parseFloat(form.defaultWeeklyLossR),
			defaultWeeklyWinR: parseFloat(form.defaultWeeklyWinR),
			defaultMonthlyLossR: parseFloat(form.defaultMonthlyLossR),
			defaultMonthlyWinR: parseFloat(form.defaultMonthlyWinR),
		}
		for (const [key, val] of Object.entries(numericFields)) {
			if (!Number.isFinite(val) || val <= 0) {
				showToast("error", `${key} must be positive number.`)
				return
			}
		}

		const tradingDaysPerWeek = parseInt(form.tradingDaysPerWeek, 10)
		if (!Number.isInteger(tradingDaysPerWeek) || tradingDaysPerWeek < 1 || tradingDaysPerWeek > 7) {
			showToast("error", "Trading days per week must be 1–7.")
			return
		}

		startTransition(async () => {
			const result = existing
				? await updateYearlyPlan({
					year,
					initialCapitalCents,
					ladderRules: ladder,
					tradingDaysPerWeek,
					...numericFields,
					notes: form.notes || undefined,
				})
				: await createYearlyPlanV2({
					year,
					initialCapitalCents,
					ladderRules: ladder,
					tradingDaysPerWeek,
					...numericFields,
					drawdownTriggerThresholdR: 2,
				})
			if (result.status === "success") {
				showToast("success", existing ? "Yearly plan updated" : "Yearly plan seeded — quarter/month/week tree created")
				router.refresh()
			} else {
				showToast("error", result.message || "Save failed")
			}
		})
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				handleSubmit()
			}}
			className="space-y-m-400"
		>
			<fieldset className="space-y-s-300">
				<legend className="text-xs font-medium uppercase tracking-wider text-txt-300">
					Capital
				</legend>
				<div className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
					<div>
						<Label htmlFor="initial-capital">Initial capital (BRL)</Label>
						<Input
							id="initial-capital"
							type="number"
							step="0.01"
							min="0"
							value={form.initialCapitalBRL}
							onChange={(e) => handleField("initialCapitalBRL", e.target.value)}
							required
						/>
					</div>
					<div>
						<Label htmlFor="trading-days">Trading days per week</Label>
						<Input
							id="trading-days"
							type="number"
							min="1"
							max="7"
							value={form.tradingDaysPerWeek}
							onChange={(e) => handleField("tradingDaysPerWeek", e.target.value)}
							required
						/>
					</div>
				</div>
			</fieldset>

			<fieldset className="space-y-s-300">
				<legend className="text-xs font-medium uppercase tracking-wider text-txt-300">
					Default R-multiples (cascade fallback)
				</legend>
				<div className="grid grid-cols-2 gap-s-300 sm:grid-cols-3">
					<div>
						<Label htmlFor="daily-loss">Daily loss R</Label>
						<Input id="daily-loss" type="number" step="0.01" min="0.01" value={form.defaultDailyLossR}
							onChange={(e) => handleField("defaultDailyLossR", e.target.value)} required />
					</div>
					<div>
						<Label htmlFor="daily-win">Daily win R</Label>
						<Input id="daily-win" type="number" step="0.01" min="0.01" value={form.defaultDailyWinR}
							onChange={(e) => handleField("defaultDailyWinR", e.target.value)} required />
					</div>
					<div>
						<Label htmlFor="weekly-loss">Weekly loss R</Label>
						<Input id="weekly-loss" type="number" step="0.01" min="0.01" value={form.defaultWeeklyLossR}
							onChange={(e) => handleField("defaultWeeklyLossR", e.target.value)} required />
					</div>
					<div>
						<Label htmlFor="weekly-win">Weekly win R</Label>
						<Input id="weekly-win" type="number" step="0.01" min="0.01" value={form.defaultWeeklyWinR}
							onChange={(e) => handleField("defaultWeeklyWinR", e.target.value)} required />
					</div>
					<div>
						<Label htmlFor="monthly-loss">Monthly loss R</Label>
						<Input id="monthly-loss" type="number" step="0.01" min="0.01" value={form.defaultMonthlyLossR}
							onChange={(e) => handleField("defaultMonthlyLossR", e.target.value)} required />
					</div>
					<div>
						<Label htmlFor="monthly-win">Monthly win R</Label>
						<Input id="monthly-win" type="number" step="0.01" min="0.01" value={form.defaultMonthlyWinR}
							onChange={(e) => handleField("defaultMonthlyWinR", e.target.value)} required />
					</div>
				</div>
			</fieldset>

			<fieldset className="space-y-s-300">
				<legend className="text-xs font-medium uppercase tracking-wider text-txt-300">
					Capital ladder rules (JSON)
				</legend>
				<p className="text-tiny text-txt-300">
					Each rule: {"{ minCapitalCents, maxCapitalCents, oneRCents }"}. Defines tier 1R as
					capital grows.
				</p>
				<Textarea
					id="ladder-rules"
					rows={8}
					value={form.ladderRulesJson}
					onChange={(e) => handleField("ladderRulesJson", e.target.value)}
					className="font-mono text-xs"
					required
				/>
			</fieldset>

			<fieldset className="space-y-s-300">
				<legend className="text-xs font-medium uppercase tracking-wider text-txt-300">Notes</legend>
				<Textarea
					id="yearly-notes"
					rows={3}
					value={form.notes}
					onChange={(e) => handleField("notes", e.target.value)}
					placeholder="Annual intent, themes, key adjustments..."
				/>
			</fieldset>

			<div className="flex justify-end gap-s-200">
				<Button type="submit" disabled={isPending}>
					{isPending ? <Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="mr-s-200 h-4 w-4" />}
					{existing ? "Save changes" : "Seed yearly plan"}
				</Button>
			</div>
		</form>
	)
}

export type { YearlyPlanEditorProps }
export { YearlyPlanEditor }
