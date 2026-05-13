"use client"

import { useCallback, useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Compass } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import { useToast } from "@/components/ui/toast"
import { confirmDailyBias } from "@/app/actions/hawks-bias"
import type { DailyHawksBias } from "@/db/schema"

type Bias = "long" | "short" | "neutral"

interface Screens {
	renko60: boolean
	macd: boolean
	emaStack: boolean
	vwap: boolean
	ajuste: boolean
}

interface DailyBiasFormProps {
	tradingDay: string
	initialBias: DailyHawksBias | null
}

const biasFromRow = (row: DailyHawksBias | null): Bias =>
	(row?.bias as Bias | undefined) ?? "neutral"

const screensFromRow = (row: DailyHawksBias | null): Screens => ({
	renko60: row?.renkoCloseAbove60min ?? false,
	macd: row?.macdSlopeUp ?? false,
	emaStack: row?.emaStackBullish ?? false,
	vwap: row?.vwapAbove ?? false,
	ajuste: row?.ajusteRespected ?? false,
})

const DailyBiasForm = ({ tradingDay, initialBias }: DailyBiasFormProps) => {
	const t = useTranslations("hawks.bias")
	const tActions = useTranslations("hawks.actions")
	const tCommon = useTranslations("common")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [bias, setBias] = useState<Bias>(biasFromRow(initialBias))
	const [screens, setScreens] = useState<Screens>(screensFromRow(initialBias))
	const [notes, setNotes] = useState<string>(initialBias?.notesPt ?? "")

	const handleScreenToggle = useCallback(
		(key: keyof Screens) => (checked: boolean | "indeterminate") => {
			setScreens((prev) => ({ ...prev, [key]: checked === true }))
		},
		[]
	)

	const handleNotesChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			setNotes(event.target.value)
		},
		[]
	)

	const handleSave = useCallback(() => {
		startTransition(async () => {
			const result = await confirmDailyBias({
				tradingDay,
				bias,
				screens,
				notesPt: notes.trim().length > 0 ? notes.trim() : undefined,
			})
			if (result.status === "success") {
				showToast("success", result.message || tActions("biasConfirmed"))
				router.refresh()
				return
			}
			showToast("error", result.message || tActions("biasConfirmFailed"))
		})
	}, [bias, notes, router, screens, showToast, tActions, tradingDay])

	const biasOptions = [
		{ value: "long" as const, label: t("biasLong") },
		{ value: "neutral" as const, label: t("biasNeutral") },
		{ value: "short" as const, label: t("biasShort") },
	]

	const screenRows: ReadonlyArray<{
		key: keyof Screens
		label: string
		hint: string
	}> = [
		{ key: "renko60", label: t("screenRenko60"), hint: t("screenRenko60Hint") },
		{ key: "macd", label: t("screenMacd"), hint: t("screenMacdHint") },
		{
			key: "emaStack",
			label: t("screenEmaStack"),
			hint: t("screenEmaStackHint"),
		},
		{ key: "vwap", label: t("screenVwap"), hint: t("screenVwapHint") },
		{ key: "ajuste", label: t("screenAjuste"), hint: t("screenAjusteHint") },
	]

	return (
		<section
			id="hawks-daily-bias"
			aria-labelledby="hawks-daily-bias-title"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<header className="gap-s-200 flex flex-col sm:flex-row sm:items-start sm:justify-between">
				<div className="gap-s-300 flex items-start">
					<div className="bg-bg-300 text-acc-100 p-s-200 rounded-md">
						<Compass className="h-5 w-5" aria-hidden="true" />
					</div>
					<div>
						<h2
							id="hawks-daily-bias-title"
							className="text-body text-txt-100 font-semibold"
						>
							{t("title")}
						</h2>
						<p className="mt-s-100 text-tiny text-txt-300 max-w-prose">
							{t("description", { day: tradingDay })}
						</p>
					</div>
				</div>
			</header>

			<div className="mt-m-400 space-y-m-400">
				<div className="space-y-s-200">
					<Label id="hawks-bias-direction-label" htmlFor="hawks-bias-direction">
						{t("directionLabel")}
					</Label>
					<SegmentedToggle
						value={bias}
						options={biasOptions}
						onChange={setBias}
						disabled={isPending}
						aria-label={t("directionLabel")}
					/>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-bias-screens-label" htmlFor="hawks-bias-screens">
						{t("screensLabel")}
					</Label>
					<ul id="hawks-bias-screens" className="gap-s-200 flex flex-col">
						{screenRows.map((row) => {
							const inputId = `hawks-screen-${row.key}`
							return (
								<li key={row.key} className="gap-s-300 flex items-start">
									<Checkbox
										id={inputId}
										checked={screens[row.key]}
										onCheckedChange={handleScreenToggle(row.key)}
										disabled={isPending}
										className="mt-s-100"
									/>
									<div className="flex-1">
										<label
											htmlFor={inputId}
											className="text-small text-txt-100 cursor-pointer font-medium"
										>
											{row.label}
										</label>
										<p className="text-tiny text-txt-300">{row.hint}</p>
									</div>
								</li>
							)
						})}
					</ul>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-bias-notes-label" htmlFor="hawks-bias-notes">
						{t("notesLabel")}
					</Label>
					<Textarea
						id="hawks-bias-notes"
						value={notes}
						onChange={handleNotesChange}
						placeholder={t("notesPlaceholder")}
						maxLength={1000}
						disabled={isPending}
					/>
				</div>

				<div className="gap-s-300 flex items-center justify-end">
					<Button
						id="hawks-bias-save"
						size="sm"
						onClick={handleSave}
						disabled={isPending}
					>
						{isPending ? (
							<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
						) : null}
						{initialBias ? tCommon("save") : t("confirmAction")}
					</Button>
				</div>
			</div>
		</section>
	)
}

export { DailyBiasForm }
