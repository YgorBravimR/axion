"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { upsertHawksCalibration } from "@/app/actions/hawks-calibration"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"

const TIMEFRAME_ROWS = [
	{ minutes: 1440, key: "tfDay" as const },
	{ minutes: 60, key: "tf60" as const },
	{ minutes: 15, key: "tf15" as const },
	{ minutes: 5, key: "tf5" as const },
	{ minutes: 1, key: "tf1" as const },
]

const HawksCalibrationAdminForm = () => {
	const t = useTranslations("hawksCalibration.admin")
	const tTable = useTranslations("hawksCalibration.table")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()

	const [asset, setAsset] = useState("WIN")
	const [rValues, setRValues] = useState<Record<number, string>>({
		1440: "",
		60: "",
		15: "",
		5: "",
		1: "",
	})
	const [atrReading, setAtrReading] = useState("")
	const [notes, setNotes] = useState("")

	const handleRChange = (minutes: number, value: string) => {
		setRValues((prev) => ({ ...prev, [minutes]: value }))
	}

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const trimmedAsset = asset.trim().toUpperCase()
		if (!trimmedAsset) return

		const entries = TIMEFRAME_ROWS.map((row) => ({
			minutes: row.minutes,
			value: Number(rValues[row.minutes]),
		})).filter((entry) => Number.isFinite(entry.value) && entry.value > 0)

		if (entries.length === 0) {
			showToast("error", t("errors.invalidRValue"))
			return
		}

		const atrParsed = atrReading.trim() ? Number(atrReading) : null
		const atrPayload =
			atrParsed !== null && Number.isFinite(atrParsed) && atrParsed > 0
				? Math.round(atrParsed)
				: null

		startTransition(async () => {
			let firstError: string | null = null
			for (const entry of entries) {
				const result = await upsertHawksCalibration({
					assetSymbol: trimmedAsset,
					timeframeMinutes: entry.minutes,
					rValue: Math.round(entry.value),
					atrReading: atrPayload,
					notes: notes.trim() || null,
				})
				if (result.status !== "success" && !firstError) {
					firstError = result.message
				}
			}
			if (firstError) {
				showToast("error", firstError)
				return
			}
			showToast("success", t("save"))
			setRValues({ 1440: "", 60: "", 15: "", 5: "", 1: "" })
			setAtrReading("")
			setNotes("")
			router.refresh()
		})
	}

	return (
		<Card id="hawks-calibration-admin-card">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-m-400">
					<div className="space-y-s-200">
						<label htmlFor="hawks-calib-asset" className="text-text-200 text-small">
							{t("assetLabel")}
						</label>
						<Input
							id="hawks-calib-asset"
							value={asset}
							onChange={(event) => setAsset(event.target.value)}
							placeholder="WIN"
							maxLength={20}
							required
						/>
					</div>

					<div className="grid grid-cols-1 gap-s-300 sm:grid-cols-5">
						{TIMEFRAME_ROWS.map((row) => (
							<div key={row.minutes} className="space-y-s-200">
								<label
									htmlFor={`hawks-calib-r-${row.minutes}`}
									className="text-text-200 text-small font-mono"
								>
									{tTable(`headers.${row.key}`)} ({t("rValueLabel")})
								</label>
								<Input
									id={`hawks-calib-r-${row.minutes}`}
									type="number"
									inputMode="numeric"
									min={1}
									step={1}
									value={rValues[row.minutes]}
									onChange={(event) => handleRChange(row.minutes, event.target.value)}
								/>
							</div>
						))}
					</div>

					<div className="space-y-s-200">
						<label htmlFor="hawks-calib-atr" className="text-text-200 text-small">
							{t("atrLabel")}
						</label>
						<Input
							id="hawks-calib-atr"
							type="number"
							inputMode="numeric"
							min={1}
							step={1}
							value={atrReading}
							onChange={(event) => setAtrReading(event.target.value)}
						/>
					</div>

					<div className="space-y-s-200">
						<label htmlFor="hawks-calib-notes" className="text-text-200 text-small">
							{t("notesLabel")}
						</label>
						<Textarea
							id="hawks-calib-notes"
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
							rows={3}
						/>
					</div>

					<div className="flex justify-end">
						<Button id="hawks-calib-submit" type="submit" disabled={isPending}>
							{isPending && (
								<Loader2 className="mr-s-200 h-4 w-4 animate-spin" aria-hidden="true" />
							)}
							{isPending ? t("saving") : t("save")}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	)
}

export { HawksCalibrationAdminForm }
