"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { upsertDailyPlan } from "@/app/actions/fractal-plan/daily"

type Mood = "focused" | "neutral" | "distracted" | "risk_off"

interface DailyPlanEditorProps {
	dailyPlanId: string
	mode: "pre" | "post"
	existing: {
		targetR: string | null
		maxTradesToday: number | null
		mood: Mood | null
		preMarketNotes: string | null
		postMarketNotes: string | null
	}
}

const MOODS: readonly Mood[] = ["focused", "neutral", "distracted", "risk_off"]
const MOOD_LABEL: Record<Mood, string> = {
	focused: "Focused",
	neutral: "Neutral",
	distracted: "Distracted",
	risk_off: "Risk-off",
}

const DailyPlanEditor = ({ dailyPlanId, mode, existing }: DailyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()

	const [targetR, setTargetR] = useState(existing.targetR ?? "")
	const [maxTrades, setMaxTrades] = useState(existing.maxTradesToday != null ? String(existing.maxTradesToday) : "")
	const [mood, setMood] = useState<Mood | "">(existing.mood ?? "")
	const [preNotes, setPreNotes] = useState(existing.preMarketNotes ?? "")
	const [postNotes, setPostNotes] = useState(existing.postMarketNotes ?? "")

	const handleSubmit = () => {
		const targetParsed = targetR.trim() ? parseFloat(targetR.replace(",", ".")) : undefined
		if (targetParsed !== undefined && !Number.isFinite(targetParsed)) {
			showToast("error", "Target R must be a number.")
			return
		}
		const maxParsed = maxTrades.trim() ? parseInt(maxTrades, 10) : undefined
		if (maxParsed !== undefined && (!Number.isInteger(maxParsed) || maxParsed <= 0)) {
			showToast("error", "Max trades must be a positive integer.")
			return
		}

		startTransition(async () => {
			const result = await upsertDailyPlan({
				dailyPlanId,
				targetR: targetParsed,
				maxTradesToday: maxParsed,
				mood: mood === "" ? undefined : mood,
				preMarketNotes: mode === "pre" ? preNotes || undefined : undefined,
				postMarketNotes: mode === "post" ? postNotes || undefined : undefined,
			})
			if (result.status === "success") {
				showToast("success", `${mode === "pre" ? "Pre-market" : "Post-market"} updated`)
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
			<div className="flex items-center gap-s-200 text-tiny font-medium uppercase tracking-wider text-txt-300">
				{mode === "pre" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
				<span>{mode === "pre" ? "Pre-market intent" : "Post-market reflection"}</span>
			</div>

			{mode === "pre" && (
				<>
					<div className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						<div>
							<Label id="lbl-day-target" htmlFor="day-target">Target R for today</Label>
							<Input
								id="day-target"
								type="number"
								step="0.01"
								value={targetR}
								onChange={(e) => setTargetR(e.target.value)}
								placeholder="e.g., 2.00"
							/>
						</div>
						<div>
							<Label id="lbl-day-max-trades" htmlFor="day-max-trades">Max trades today</Label>
							<Input
								id="day-max-trades"
								type="number"
								min="1"
								step="1"
								value={maxTrades}
								onChange={(e) => setMaxTrades(e.target.value)}
								placeholder="e.g., 3"
							/>
						</div>
					</div>

					<fieldset className="space-y-s-200">
						<legend className="text-tiny font-medium uppercase tracking-wider text-txt-300">Mood</legend>
						<div className="flex flex-wrap gap-s-200">
							{MOODS.map((m) => {
								const selected = mood === m
								return (
									<button
										key={m}
										type="button"
										onClick={() => setMood(selected ? "" : m)}
										aria-pressed={selected}
										className={`rounded-md border px-s-300 py-s-200 text-tiny ${
											selected
												? "border-acc-100 bg-acc-100/10 text-acc-100"
												: "border-bg-300 text-txt-200 hover:border-acc-100/40"
										}`}
									>
										{MOOD_LABEL[m]}
									</button>
								)
							})}
						</div>
					</fieldset>

					<div>
						<Label id="lbl-day-pre-notes" htmlFor="day-pre-notes">Pre-market notes</Label>
						<Textarea
							id="day-pre-notes"
							rows={4}
							value={preNotes}
							onChange={(e) => setPreNotes(e.target.value)}
							placeholder="Setup, levels, what would invalidate the plan..."
						/>
					</div>
				</>
			)}

			{mode === "post" && (
				<>
					<div>
						<Label id="lbl-day-post-notes" htmlFor="day-post-notes">Post-market notes</Label>
						<Textarea
							id="day-post-notes"
							rows={5}
							value={postNotes}
							onChange={(e) => setPostNotes(e.target.value)}
							placeholder="What happened, what worked, what to adjust tomorrow..."
						/>
					</div>
				</>
			)}

			<div className="flex justify-end">
				<Button id="btn-day-save" type="submit" disabled={isPending}>
					{isPending ? (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					) : (
						<Save className="mr-s-200 h-4 w-4" />
					)}
					Save
				</Button>
			</div>
		</form>
	)
}

export type { DailyPlanEditorProps, Mood }
export { DailyPlanEditor }
