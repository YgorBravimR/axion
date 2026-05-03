"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
	listHawksCalibrations,
	upsertHawksCalibration,
	type CalibrationRecord,
} from "@/app/actions/hawks-calibration"
import {
	HAWKS_RENKO_LADDER,
	suggestLadderRung,
} from "@/lib/hawks/atr-calc"

const ASSETS = ["WIN", "WDO", "IND", "DOL"] as const
const TIMEFRAMES = [5, 15, 60] as const

const formatWeek = (iso: string) => {
	const date = new Date(iso)
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
	})
}

const HawksCalibrationCard = () => {
	const t = useTranslations("hawksCalibration.card")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [history, setHistory] = useState<CalibrationRecord[]>([])
	const [historyLoading, setHistoryLoading] = useState(true)
	const [assetSymbol, setAssetSymbol] = useState<string>("WIN")
	const [timeframeMinutes, setTimeframeMinutes] = useState<string>("5")
	const [atrInput, setAtrInput] = useState<string>("")
	const [rValueInput, setRValueInput] = useState<string>("")
	const [notes, setNotes] = useState<string>("")

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await listHawksCalibrations(8)
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setHistory(result.data)
			}
			setHistoryLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	const atrNumber = Number(atrInput)
	const suggestion = useMemo(() => {
		if (!atrInput || Number.isNaN(atrNumber) || atrNumber <= 0) return null
		return suggestLadderRung(atrNumber)
	}, [atrInput, atrNumber])

	const handleApplySuggestion = () => {
		if (suggestion) setRValueInput(String(suggestion))
	}

	const handleSave = () => {
		const rValue = Number(rValueInput)
		if (!rValueInput || Number.isNaN(rValue) || rValue <= 0) {
			showToast("error", t("errors.invalidRValue"))
			return
		}
		startTransition(async () => {
			const result = await upsertHawksCalibration({
				assetSymbol,
				timeframeMinutes: Number(timeframeMinutes),
				rValue,
				source: atrInput ? "atr_calc" : "user_calc",
				notes: notes || null,
			})
			if (result.status === "success" && result.data) {
				showToast("success", result.message)
				setHistory((prev) => {
					const next = prev.filter((row) => row.id !== result.data!.id)
					return [result.data!, ...next].slice(0, 8)
				})
				return
			}
			showToast("error", result.message)
		})
	}

	return (
		<Card id="hawks-calibration-card">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-m-400">
				<div className="grid gap-m-300 sm:grid-cols-2">
					<div className="space-y-s-200">
						<Label id="hawks-calibration-asset-label" htmlFor="hawks-calibration-asset">
							{t("assetLabel")}
						</Label>
						<Select
							value={assetSymbol}
							onValueChange={setAssetSymbol}
							disabled={isPending}
						>
							<SelectTrigger id="hawks-calibration-asset">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ASSETS.map((symbol) => (
									<SelectItem key={symbol} value={symbol}>
										{symbol}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-calibration-timeframe-label" htmlFor="hawks-calibration-timeframe">
							{t("timeframeLabel")}
						</Label>
						<Select
							value={timeframeMinutes}
							onValueChange={setTimeframeMinutes}
							disabled={isPending}
						>
							<SelectTrigger id="hawks-calibration-timeframe">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TIMEFRAMES.map((value) => (
									<SelectItem key={value} value={String(value)}>
										{t("timeframeOption", { minutes: value })}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="grid gap-m-300 sm:grid-cols-2">
					<div className="space-y-s-200">
						<Label id="hawks-calibration-atr-label" htmlFor="hawks-calibration-atr">
							{t("atrLabel")}
						</Label>
						<Input
							id="hawks-calibration-atr"
							type="number"
							inputMode="decimal"
							value={atrInput}
							onChange={(event) => setAtrInput(event.target.value)}
							placeholder={t("atrPlaceholder")}
							disabled={isPending}
						/>
						<p className="text-text-300 text-fs-100">{t("atrHint")}</p>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-calibration-rvalue-label" htmlFor="hawks-calibration-rvalue">
							{t("rValueLabel")}
						</Label>
						<Input
							id="hawks-calibration-rvalue"
							type="number"
							inputMode="numeric"
							value={rValueInput}
							onChange={(event) => setRValueInput(event.target.value)}
							placeholder={t("rValuePlaceholder")}
							disabled={isPending}
						/>
						<p className="text-text-300 text-fs-100">
							{t("ladderHint", { rungs: HAWKS_RENKO_LADDER.join(", ") })}
						</p>
					</div>
				</div>

				{suggestion !== null && (
					<div className="flex items-start gap-s-300 rounded-md border border-acc-100/40 bg-acc-100/5 p-m-300 text-fs-200 text-acc-100">
						<Sparkles className="mt-s-050 h-4 w-4 shrink-0" aria-hidden="true" />
						<div className="flex-1 space-y-s-100">
							<p className="font-medium">
								{t("suggestionTitle", { rung: suggestion })}
							</p>
							<p className="text-fs-100 opacity-80">{t("suggestionBody")}</p>
						</div>
						<Button
							id="hawks-calibration-apply"
							type="button"
							size="sm"
							variant="outline"
							onClick={handleApplySuggestion}
							disabled={isPending}
						>
							{t("apply")}
						</Button>
					</div>
				)}

				<div className="space-y-s-200">
					<Label id="hawks-calibration-notes-label" htmlFor="hawks-calibration-notes">
						{t("notesLabel")}
					</Label>
					<Textarea
						id="hawks-calibration-notes"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder={t("notesPlaceholder")}
						rows={2}
						disabled={isPending}
					/>
				</div>

				<div className="flex items-center justify-end gap-s-200">
					{isPending && (
						<Loader2 className="text-text-200 h-4 w-4 animate-spin" aria-hidden="true" />
					)}
					<Button
						id="hawks-calibration-save"
						type="button"
						onClick={handleSave}
						disabled={isPending}
					>
						{t("save")}
					</Button>
				</div>

				<div className="space-y-s-200 pt-m-300 border-t border-bg-300">
					<h3 className="text-fs-200 font-medium">{t("historyTitle")}</h3>
					{historyLoading ? (
						<p className="text-text-300 text-fs-100">{t("historyLoading")}</p>
					) : history.length === 0 ? (
						<p className="text-text-300 text-fs-100">{t("historyEmpty")}</p>
					) : (
						<ul className="divide-y divide-bg-300 text-fs-200">
							{history.map((row) => (
								<li
									key={row.id}
									className="flex items-center justify-between py-s-200"
								>
									<div className="space-y-s-050">
										<p className="font-medium">
											{row.assetSymbol} · {row.timeframeMinutes}m
										</p>
										<p className="text-text-300 text-fs-100">
											{formatWeek(row.weekStart)} · {row.source}
										</p>
									</div>
									<span className="font-mono text-acc-100">{row.rValue}R</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

export { HawksCalibrationCard }
