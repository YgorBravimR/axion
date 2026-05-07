"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
	AlertTriangle,
	Loader2,
	Plus,
	RotateCcw,
	Save,
	Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
	createYearlyPlanV2,
	updateYearlyPlan,
} from "@/app/actions/fractal-plan/yearly"
import { RiskProfilePicker } from "@/components/fractal-plan/risk-profile-picker"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

interface LadderRowDraft {
	id: string
	minCents: number | null
	oneRCents: number | null
}

const TOP_TIER_MAX_CENTS = 999_999_999_99

const formatBRNoCents = (reais: number): string => reais.toLocaleString("pt-BR")

const ruleToDraft = (rule: LadderRuleR, idx: number): LadderRowDraft => ({
	id: `row-${idx}-${Math.random().toString(36).slice(2, 8)}`,
	minCents: rule.minCapitalCents,
	oneRCents: rule.oneRCents,
})

const newRowDraft = (prev: LadderRowDraft | undefined): LadderRowDraft => {
	const prevMinCents = prev?.minCents ?? 0
	const nextMinCents = prev
		? Math.max(prevMinCents * 5, prevMinCents + 1_000_000_00)
		: 0
	return {
		id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		minCents: nextMinCents,
		oneRCents: prev?.oneRCents ?? 100_00,
	}
}

interface YearlyPlanEditorProps {
	year: number
	riskProfiles: RiskManagementProfile[]
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
		defaultRiskProfileId: string | null
		notes: string | null
	} | null
	defaultInitialCapitalCents?: number | null
}

interface FormState {
	tradingDaysPerWeek: string
	defaultDailyLossR: string
	defaultDailyWinR: string
	defaultWeeklyLossR: string
	defaultWeeklyWinR: string
	defaultMonthlyLossR: string
	defaultMonthlyWinR: string
	ladderRows: LadderRowDraft[]
	notes: string
}

const DEFAULT_LADDER: LadderRuleR[] = [
	{ minCapitalCents: 3_000_00, maxCapitalCents: 7_499_99, oneRCents: 100_00 },
	{ minCapitalCents: 7_500_00, maxCapitalCents: 14_999_99, oneRCents: 200_00 },
	{ minCapitalCents: 15_000_00, maxCapitalCents: 29_999_99, oneRCents: 300_00 },
	{ minCapitalCents: 30_000_00, maxCapitalCents: 99_999_99, oneRCents: 500_00 },
	{
		minCapitalCents: 100_000_00,
		maxCapitalCents: 999_999_999_99,
		oneRCents: 1000_00,
	},
]

const seedForm = (existing: YearlyPlanEditorProps["existing"]): FormState => {
	if (!existing) {
		return {
			tradingDaysPerWeek: "5",
			defaultDailyLossR: "3.00",
			defaultDailyWinR: "2.00",
			defaultWeeklyLossR: "6.00",
			defaultWeeklyWinR: "4.00",
			defaultMonthlyLossR: "10.00",
			defaultMonthlyWinR: "8.00",
			ladderRows: DEFAULT_LADDER.map(ruleToDraft),
			notes: "",
		}
	}
	return {
		tradingDaysPerWeek: String(existing.tradingDaysPerWeek),
		defaultDailyLossR: existing.defaultDailyLossR ?? "",
		defaultDailyWinR: existing.defaultDailyWinR ?? "",
		defaultWeeklyLossR: existing.defaultWeeklyLossR ?? "",
		defaultWeeklyWinR: existing.defaultWeeklyWinR ?? "",
		defaultMonthlyLossR: existing.defaultMonthlyLossR ?? "",
		defaultMonthlyWinR: existing.defaultMonthlyWinR ?? "",
		ladderRows: (existing.ladderRules.length > 0
			? existing.ladderRules
			: DEFAULT_LADDER
		).map(ruleToDraft),
		notes: existing.notes ?? "",
	}
}

const YearlyPlanEditor = ({
	year,
	riskProfiles,
	existing,
	defaultInitialCapitalCents = null,
}: YearlyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [form, setForm] = useState<FormState>(() => seedForm(existing))
	const accountCapitalAvailable = defaultInitialCapitalCents !== null
	const accountCapitalLabel =
		defaultInitialCapitalCents !== null
			? (defaultInitialCapitalCents / 100).toLocaleString("pt-BR", {
					style: "currency",
					currency: "BRL",
					minimumFractionDigits: 0,
					maximumFractionDigits: 0,
				})
			: null
	const [riskProfileId, setRiskProfileId] = useState<string | null>(
		existing?.defaultRiskProfileId ?? null
	)

	const sortedLadder = [...form.ladderRows].sort(
		(a, b) => (a.minCents ?? 0) - (b.minCents ?? 0)
	)
	const tier1MinCents = sortedLadder[0]?.minCents ?? 0
	const tier1MinReais = Math.floor(tier1MinCents / 100)
	const accountCapitalCents = defaultInitialCapitalCents ?? 0
	const capitalBelowMin =
		accountCapitalAvailable &&
		tier1MinCents > 0 &&
		accountCapitalCents < tier1MinCents

	const handleField = <K extends keyof FormState>(
		key: K,
		value: FormState[K]
	) => {
		setForm((prev) => ({ ...prev, [key]: value }))
	}

	const updateLadderRow = (
		id: string,
		patch: Partial<Omit<LadderRowDraft, "id">>
	) => {
		setForm((prev) => ({
			...prev,
			ladderRows: prev.ladderRows.map((row) =>
				row.id === id ? { ...row, ...patch } : row
			),
		}))
	}

	const addLadderRow = () => {
		setForm((prev) => {
			const sortedPrev = [...prev.ladderRows].sort(
				(a, b) => (a.minCents ?? 0) - (b.minCents ?? 0)
			)
			const last = sortedPrev[sortedPrev.length - 1]
			return { ...prev, ladderRows: [...prev.ladderRows, newRowDraft(last)] }
		})
	}

	const removeLadderRow = (id: string) => {
		setForm((prev) => ({
			...prev,
			ladderRows: prev.ladderRows.filter((row) => row.id !== id),
		}))
	}

	const restoreLadderDefaults = () => {
		setForm((prev) => ({
			...prev,
			ladderRows: DEFAULT_LADDER.map(ruleToDraft),
		}))
	}

	const parseLadder = ():
		| { ok: true; rules: LadderRuleR[] }
		| { ok: false; reason: string } => {
		if (form.ladderRows.length === 0) {
			return { ok: false, reason: "Add at least one ladder tier." }
		}
		const parsed: { minCents: number; oneRCents: number; idx: number }[] = []
		for (let i = 0; i < form.ladderRows.length; i++) {
			const row = form.ladderRows[i]
			const minCents = row.minCents ?? 0
			const oneRCents = row.oneRCents ?? 0
			if (
				!Number.isFinite(minCents) ||
				!Number.isFinite(oneRCents) ||
				minCents < 0 ||
				oneRCents <= 0
			) {
				return { ok: false, reason: `Tier ${i + 1}: From ≥ 0, 1R > 0.` }
			}
			parsed.push({ minCents, oneRCents, idx: i })
		}
		const sorted = [...parsed].sort((a, b) => a.minCents - b.minCents)
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].minCents <= sorted[i - 1].minCents) {
				return {
					ok: false,
					reason: `Tier ${sorted[i].idx + 1} must start above tier ${sorted[i - 1].idx + 1}.`,
				}
			}
		}
		const rules: LadderRuleR[] = sorted.map((r, i, arr) => {
			const next = arr[i + 1]
			const maxCents = next ? next.minCents - 1 : TOP_TIER_MAX_CENTS
			return {
				minCapitalCents: r.minCents,
				maxCapitalCents: maxCents,
				oneRCents: r.oneRCents,
			}
		})
		return { ok: true, rules }
	}

	const handleSubmit = () => {
		const ladderResult = parseLadder()
		if (!ladderResult.ok) {
			showToast("error", ladderResult.reason)
			return
		}
		const ladder = ladderResult.rules

		if (!existing && !accountCapitalAvailable) {
			showToast(
				"error",
				"Set the account starting balance in Settings → Annual Reporting first."
			)
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
		if (
			!Number.isInteger(tradingDaysPerWeek) ||
			tradingDaysPerWeek < 1 ||
			tradingDaysPerWeek > 7
		) {
			showToast("error", "Trading days per week must be 1–7.")
			return
		}

		startTransition(async () => {
			const result = existing
				? await updateYearlyPlan({
						year,
						ladderRules: ladder,
						tradingDaysPerWeek,
						...numericFields,
						defaultRiskProfileId: riskProfileId,
						notes: form.notes || undefined,
					})
				: await createYearlyPlanV2({
						year,
						ladderRules: ladder,
						tradingDaysPerWeek,
						...numericFields,
						drawdownTriggerThresholdR: 2,
					})
			if (result.status === "success") {
				showToast(
					"success",
					existing
						? "Yearly plan updated"
						: "Yearly plan seeded — quarter/month/week tree created"
				)
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
			<section
				id="plan-year-drawer-capital"
				aria-labelledby="sec-capital-anchor"
				className="border-bg-300 bg-bg-100 p-m-400 rounded-lg border"
			>
				<div className="gap-s-300 flex flex-col sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h3 id="sec-capital-anchor" className="text-h3 text-txt-100">
							Capital inicial
						</h3>
						<p className="mt-s-100 text-small text-txt-300">
							{accountCapitalAvailable ? (
								<>
									Configurado em{" "}
									<Link
										href="/settings"
										className="text-acc-100 underline-offset-2 hover:underline"
									>
										Settings → Relatório Anual
									</Link>
									. Capital por mês é editável na grade.
								</>
							) : (
								<>
									Defina o saldo inicial em{" "}
									<Link
										href="/settings"
										className="text-acc-100 underline-offset-2 hover:underline"
									>
										Settings → Relatório Anual
									</Link>{" "}
									antes de criar o plano.
								</>
							)}
						</p>
					</div>
					<p className="text-h2 text-acc-100 shrink-0 font-mono tabular-nums">
						{accountCapitalLabel ?? "—"}
					</p>
				</div>
				{capitalBelowMin && (
					<div
						role="alert"
						className="mt-m-400 gap-s-300 border-fb-error/40 bg-fb-error/10 p-s-300 flex items-start rounded-md border"
					>
						<AlertTriangle
							className="mt-s-100 text-fb-error h-4 w-4 shrink-0"
							aria-hidden="true"
						/>
						<div className="min-w-0">
							<p className="text-small text-fb-error font-medium">
								Não opere — capital mínimo R$ {formatBRNoCents(tier1MinReais)}
							</p>
							<p className="mt-s-100 text-tiny text-txt-300">
								Capital atual abaixo do primeiro tier da ladder. Aumente o
								capital ou ajuste a ladder.
							</p>
						</div>
					</div>
				)}
			</section>

			<fieldset
				id="plan-year-drawer-defaults"
				aria-labelledby="sec-defaults"
				className="border-bg-300 bg-bg-100 p-m-400 space-y-s-300 rounded-lg border"
			>
				<header>
					<h3 id="sec-defaults" className="text-h3 text-txt-100">
						Defaults
					</h3>
					<p className="mt-s-100 text-small text-txt-300">
						Cascade fallback aplicado quando o mês não tem override.
					</p>
				</header>
				<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
					<div>
						<Label id="lbl-trading-days" htmlFor="trading-days">
							Dias / semana
						</Label>
						<Input
							id="trading-days"
							type="number"
							min="1"
							max="7"
							value={form.tradingDaysPerWeek}
							onChange={(e) =>
								handleField("tradingDaysPerWeek", e.target.value)
							}
							required
						/>
					</div>
					<div>
						<Label id="lbl-daily-loss" htmlFor="daily-loss">
							Daily loss R
						</Label>
						<Input
							id="daily-loss"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultDailyLossR}
							onChange={(e) => handleField("defaultDailyLossR", e.target.value)}
							required
						/>
					</div>
					<div>
						<Label id="lbl-daily-win" htmlFor="daily-win">
							Daily win R
						</Label>
						<Input
							id="daily-win"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultDailyWinR}
							onChange={(e) => handleField("defaultDailyWinR", e.target.value)}
							required
						/>
					</div>
					<div>
						<Label id="lbl-weekly-loss" htmlFor="weekly-loss">
							Weekly loss R
						</Label>
						<Input
							id="weekly-loss"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultWeeklyLossR}
							onChange={(e) =>
								handleField("defaultWeeklyLossR", e.target.value)
							}
							required
						/>
					</div>
					<div>
						<Label id="lbl-weekly-win" htmlFor="weekly-win">
							Weekly win R
						</Label>
						<Input
							id="weekly-win"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultWeeklyWinR}
							onChange={(e) => handleField("defaultWeeklyWinR", e.target.value)}
							required
						/>
					</div>
					<div>
						<Label id="lbl-monthly-loss" htmlFor="monthly-loss">
							Monthly loss R
						</Label>
						<Input
							id="monthly-loss"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultMonthlyLossR}
							onChange={(e) =>
								handleField("defaultMonthlyLossR", e.target.value)
							}
							required
						/>
					</div>
					<div>
						<Label id="lbl-monthly-win" htmlFor="monthly-win">
							Monthly win R
						</Label>
						<Input
							id="monthly-win"
							type="number"
							step="0.01"
							min="0.01"
							value={form.defaultMonthlyWinR}
							onChange={(e) =>
								handleField("defaultMonthlyWinR", e.target.value)
							}
							required
						/>
					</div>
				</div>
			</fieldset>

			<fieldset
				id="plan-year-drawer-ladder"
				aria-labelledby="sec-ladder"
				className="border-bg-300 bg-bg-100 p-m-400 space-y-s-300 rounded-lg border"
			>
				<header>
					<h3 id="sec-ladder" className="text-h3 text-txt-100">
						Capital ladder
					</h3>
					<p className="mt-s-100 text-small text-txt-300">
						Define quanto vale 1R conforme o capital cresce. Cada tier começa em{" "}
						<strong>From</strong> e termina onde o próximo começa. O último tier
						é ilimitado.
					</p>
				</header>

				<div className="border-bg-300 overflow-x-auto rounded-md border">
					<Table>
						<TableHeader className="bg-bg-200">
							<TableRow>
								<TableHead className="w-12">Tier</TableHead>
								<TableHead>From (R$)</TableHead>
								<TableHead>1R (R$)</TableHead>
								<TableHead className="text-right" aria-label="Actions" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedLadder.map((row, idx) => (
								<TableRow key={row.id}>
									<TableCell className="text-txt-200 font-mono tabular-nums">
										{idx + 1}
									</TableCell>
									<TableCell>
										<CurrencyInput
											id={`ladder-min-${row.id}`}
											value={row.minCents}
											onValueChange={(next) =>
												updateLadderRow(row.id, { minCents: next })
											}
											decimals={0}
											unit="cents"
											aria-label={`Tier ${idx + 1} from BRL`}
											className="h-9"
										/>
									</TableCell>
									<TableCell>
										<CurrencyInput
											id={`ladder-oner-${row.id}`}
											value={row.oneRCents}
											onValueChange={(next) =>
												updateLadderRow(row.id, { oneRCents: next })
											}
											decimals={0}
											unit="cents"
											aria-label={`Tier ${idx + 1} one-R BRL`}
											className="h-9"
										/>
									</TableCell>
									<TableCell className="text-right">
										<Button
											id={`ladder-remove-${row.id}`}
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => removeLadderRow(row.id)}
											disabled={form.ladderRows.length === 1}
											aria-label={`Remove tier ${idx + 1}`}
											className="text-txt-300 hover:text-fb-error size-8 p-0"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<div className="gap-s-200 flex flex-wrap items-center">
					<Button
						id="btn-ladder-add-row"
						type="button"
						variant="outline"
						size="sm"
						onClick={addLadderRow}
					>
						<Plus className="mr-s-200 h-3.5 w-3.5" />
						Add tier
					</Button>
					<Button
						id="btn-ladder-restore-defaults"
						type="button"
						variant="ghost"
						size="sm"
						onClick={restoreLadderDefaults}
					>
						<RotateCcw className="mr-s-200 h-3.5 w-3.5" />
						Restore defaults
					</Button>
				</div>
			</fieldset>

			<fieldset
				aria-labelledby="sec-risk-profile"
				className="border-bg-300 bg-bg-100 p-m-400 space-y-s-300 rounded-lg border"
			>
				<header>
					<h3 id="sec-risk-profile" className="text-h3 text-txt-100">
						Risk profile
					</h3>
					<p className="mt-s-100 text-small text-txt-300">
						Picked when no monthly override is set. Drives adaptive sizing rules
						(consecutive losses, post-loss reduction, etc.).
					</p>
				</header>
				<div className="max-w-sm">
					<RiskProfilePicker
						id="yearly-risk-profile"
						profiles={riskProfiles}
						value={riskProfileId}
						onChange={setRiskProfileId}
						disabled={!existing}
					/>
				</div>
				{!existing && (
					<p className="text-tiny text-txt-300">
						Seed the yearly plan first, then set the default profile.
					</p>
				)}
			</fieldset>

			<fieldset
				aria-labelledby="sec-notes"
				className="border-bg-300 bg-bg-100 p-m-400 space-y-s-300 rounded-lg border"
			>
				<header>
					<h3 id="sec-notes" className="text-h3 text-txt-100">
						Notes
					</h3>
					<p className="mt-s-100 text-small text-txt-300">
						Annual intent, themes, key adjustments.
					</p>
				</header>
				<Textarea
					id="yearly-notes"
					rows={3}
					value={form.notes}
					onChange={(e) => handleField("notes", e.target.value)}
					placeholder="Annual intent, themes, key adjustments..."
				/>
			</fieldset>

			<div className="gap-s-200 pt-s-200 flex justify-end">
				<Button id="btn-yearly-save" type="submit" disabled={isPending}>
					{isPending ? (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					) : (
						<Save className="mr-s-200 h-4 w-4" />
					)}
					{existing ? "Save changes" : "Seed yearly plan"}
				</Button>
			</div>
		</form>
	)
}

export type { YearlyPlanEditorProps }
export { YearlyPlanEditor }
