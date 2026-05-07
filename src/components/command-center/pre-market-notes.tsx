"use client"

import { useState, useEffect } from "react"
import { Sun, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { MoodSelector } from "./mood-selector"
import { upsertDailyPlan } from "@/app/actions/fractal-plan/daily"
import type { DailyPlan } from "@/db/schema"
import type { MoodType } from "@/lib/validations/command-center"

interface PreMarketNotesProps {
	dailyPlan: DailyPlan | null
	onRefresh: () => void
	isReadOnly?: boolean
}

const NO_PLAN_HINT_KEY = "noPlanPrompt"

export const PreMarketNotes = ({
	dailyPlan,
	onRefresh,
	isReadOnly = false,
}: PreMarketNotesProps) => {
	const t = useTranslations("commandCenter.notes")
	const tPlan = useTranslations("commandCenter.plan")
	const { showToast } = useToast()

	const [preMarketNotes, setPreMarketNotes] = useState("")
	const [mood, setMood] = useState<MoodType | null>(null)
	const [targetR, setTargetR] = useState("")
	const [maxTrades, setMaxTrades] = useState("")
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (dailyPlan) {
			setPreMarketNotes(dailyPlan.preMarketNotes ?? "")
			setMood((dailyPlan.mood as MoodType | null) ?? null)
			setTargetR(dailyPlan.targetR ?? "")
			setMaxTrades(
				dailyPlan.maxTradesToday !== null
					? String(dailyPlan.maxTradesToday)
					: ""
			)
		}
	}, [dailyPlan])

	const hasChanges =
		!!dailyPlan &&
		(preMarketNotes !== (dailyPlan.preMarketNotes ?? "") ||
			mood !== ((dailyPlan.mood as MoodType | null) ?? null) ||
			targetR !== (dailyPlan.targetR ?? "") ||
			maxTrades !==
				(dailyPlan.maxTradesToday !== null
					? String(dailyPlan.maxTradesToday)
					: ""))

	const handleSave = async () => {
		if (!dailyPlan) {
			return
		}
		const targetParsed = targetR.trim()
			? parseFloat(targetR.replace(",", "."))
			: null
		if (targetParsed !== null && !Number.isFinite(targetParsed)) {
			showToast("error", t("saveError"))
			return
		}
		const maxParsed = maxTrades.trim() ? parseInt(maxTrades, 10) : null
		if (
			maxParsed !== null &&
			(!Number.isInteger(maxParsed) || maxParsed <= 0)
		) {
			showToast("error", t("saveError"))
			return
		}

		setSaving(true)
		try {
			const result = await upsertDailyPlan({
				dailyPlanId: dailyPlan.id,
				preMarketNotes: preMarketNotes || null,
				mood: mood ?? null,
				targetR: targetParsed,
				maxTradesToday: maxParsed,
			})
			if (result.status === "error") {
				showToast("error", result.message)
				return
			}
			onRefresh()
		} catch {
			showToast("error", t("saveError"))
		} finally {
			setSaving(false)
		}
	}

	if (!dailyPlan) {
		return (
			<div
				id="cc-pre-market-notes"
				className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border border-dashed"
			>
				<div className="gap-s-200 flex items-center">
					<Sun className="text-trade-buy h-5 w-5" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("preMarket")}
					</h3>
				</div>
				<p className="mt-s-200 text-tiny text-txt-300">
					{tPlan(NO_PLAN_HINT_KEY)}
				</p>
			</div>
		)
	}

	return (
		<div
			id="cc-pre-market-notes"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Sun className="text-trade-buy h-5 w-5" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("preMarket")}
					</h3>
				</div>
				{hasChanges && !isReadOnly && (
					<Button
						id="pre-market-save"
						size="sm"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? (
							<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
						) : (
							<Save className="mr-s-100 h-4 w-4" />
						)}
						{saving ? t("saving") : t("save")}
					</Button>
				)}
			</div>

			<div className="mb-s-300 sm:mb-m-400 gap-s-300 grid grid-cols-1 sm:grid-cols-2">
				<div>
					<Label
						id="pre-market-target-r-label"
						htmlFor="pre-market-target-r"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("targetR")}
					</Label>
					<Input
						id="pre-market-target-r"
						type="number"
						step="0.01"
						value={targetR}
						onChange={(e) => setTargetR(e.target.value)}
						placeholder="2.00"
						disabled={isReadOnly}
					/>
				</div>
				<div>
					<Label
						id="pre-market-max-trades-label"
						htmlFor="pre-market-max-trades"
						className="mb-s-200 text-small text-txt-200 block"
					>
						{t("maxTrades")}
					</Label>
					<Input
						id="pre-market-max-trades"
						type="number"
						min="1"
						step="1"
						value={maxTrades}
						onChange={(e) => setMaxTrades(e.target.value)}
						placeholder="3"
						disabled={isReadOnly}
					/>
				</div>
			</div>

			<div className="mb-s-300 sm:mb-m-400">
				<Label
					id="pre-market-mood-label"
					htmlFor="pre-market-mood"
					className="mb-s-200 text-small text-txt-200 block"
				>
					{t("mood")}
				</Label>
				<MoodSelector value={mood} onChange={setMood} disabled={isReadOnly} />
			</div>

			<div>
				<Label
					id="pre-market-notes-label"
					htmlFor="pre-market-notes-textarea"
					className="mb-s-200 text-small text-txt-200 block"
				>
					{t("preMarketLabel")}
				</Label>
				<Textarea
					id="pre-market-notes-textarea"
					value={preMarketNotes}
					onChange={(e) => setPreMarketNotes(e.target.value)}
					placeholder={t("placeholder")}
					className="min-h-[120px] resize-none sm:resize-y"
					disabled={isReadOnly}
				/>
			</div>
		</div>
	)
}
