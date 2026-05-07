"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { updateTrade } from "@/app/actions/trades"
import type { TradeInfoPanelProps } from "./trade-info-panel"

interface NotesFormData {
	preTradeThoughts: string
	postTradeReflection: string
	lessonLearned: string
	disciplineNotes: string
	followedPlan: boolean | null
	rating: string | null
}

const RATING_GRADES = ["A", "B", "C", "D", "F"] as const

const GRADE_COLORS: Record<string, string> = {
	A: "border-trade-buy bg-trade-buy/10 text-trade-buy",
	B: "border-trade-buy/70 bg-trade-buy/5 text-trade-buy/70",
	C: "border-warning bg-warning/10 text-warning",
	D: "border-trade-sell/70 bg-trade-sell/5 text-trade-sell/70",
	F: "border-trade-sell bg-trade-sell/10 text-trade-sell",
}

interface TradeInfoNotesTabProps {
	tradeId: string
	fullTrade: TradeInfoPanelProps["fullTrade"]
	onDirtyChange: (dirty: boolean) => void
}

const TradeInfoNotesTab = ({
	tradeId,
	fullTrade,
	onDirtyChange,
}: TradeInfoNotesTabProps) => {
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()

	const [formData, setFormData] = useState<NotesFormData>({
		preTradeThoughts: fullTrade.preTradeThoughts ?? "",
		postTradeReflection: fullTrade.postTradeReflection ?? "",
		lessonLearned: fullTrade.lessonLearned ?? "",
		disciplineNotes: fullTrade.disciplineNotes ?? "",
		followedPlan: fullTrade.followedPlan ?? null,
		rating: fullTrade.rating ?? null,
	})
	const [isSaving, setIsSaving] = useState(false)
	const [isDirty, setIsDirty] = useState(false)
	// L1: Ref mirrors isDirty so beforeunload handler reads current value without being a dep
	const isDirtyRef = useRef(false)

	const handleFieldChange = (
		field: keyof NotesFormData,
		value: string | boolean | null
	) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
		isDirtyRef.current = true
		setIsDirty(true)
		onDirtyChange(true)
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const result = await updateTrade(tradeId, {
				preTradeThoughts: formData.preTradeThoughts || undefined,
				postTradeReflection: formData.postTradeReflection || undefined,
				lessonLearned: formData.lessonLearned || undefined,
				disciplineNotes: formData.disciplineNotes || undefined,
				followedPlan: formData.followedPlan ?? undefined,
				rating: formData.rating as "A" | "B" | "C" | "D" | "F" | undefined,
			})

			if (result.status === "success") {
				isDirtyRef.current = false
				setIsDirty(false)
				onDirtyChange(false)
				showToast("success", tTrade("notesSavedSuccess"))
			} else {
				showToast("error", tTrade("notesSaveError"))
			}
		} catch {
			showToast("error", tTrade("notesSaveError"))
		} finally {
			setIsSaving(false)
		}
	}

	// L1: Effect runs only on mount/unmount — handler reads isDirtyRef to avoid stale closure
	// without re-subscribing on every keystroke.
	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!isDirtyRef.current) {
				return
			}
			event.preventDefault()
		}

		window.addEventListener("beforeunload", handleBeforeUnload)
		return () => window.removeEventListener("beforeunload", handleBeforeUnload)
	}, [])

	return (
		<>
			<div className="space-y-m-400 pb-m-400 flex-1 overflow-y-auto">
				{/* Pre-Trade Thoughts */}
				<div className="space-y-s-200">
					<Label
						id="label-panel-pre-trade-thoughts"
						htmlFor="panel-pre-trade-thoughts"
						className="text-tiny text-txt-300 font-medium"
					>
						{tTrade("preTradeThoughts")}
					</Label>
					<Textarea
						id="panel-pre-trade-thoughts"
						placeholder={tTrade("preTradeHint")}
						rows={3}
						value={formData.preTradeThoughts}
						onChange={(event) =>
							handleFieldChange("preTradeThoughts", event.target.value)
						}
						className="bg-bg-300 border-bg-300 text-small text-txt-100 p-s-300 rounded-md"
					/>
				</div>

				{/* Post-Trade Reflection */}
				<div className="space-y-s-200">
					<Label
						id="label-panel-post-trade-reflection"
						htmlFor="panel-post-trade-reflection"
						className="text-tiny text-txt-300 font-medium"
					>
						{tTrade("postTradeReflection")}
					</Label>
					<Textarea
						id="panel-post-trade-reflection"
						placeholder={tTrade("postTradeHint")}
						rows={3}
						value={formData.postTradeReflection}
						onChange={(event) =>
							handleFieldChange("postTradeReflection", event.target.value)
						}
						className="bg-bg-300 border-bg-300 text-small text-txt-100 p-s-300 rounded-md"
					/>
				</div>

				{/* Lesson Learned */}
				<div className="space-y-s-200">
					<Label
						id="label-panel-lesson-learned"
						htmlFor="panel-lesson-learned"
						className="text-tiny text-txt-300 font-medium"
					>
						{tTrade("lessonLearned")}
					</Label>
					<Textarea
						id="panel-lesson-learned"
						placeholder={tTrade("lessonHint")}
						rows={3}
						value={formData.lessonLearned}
						onChange={(event) =>
							handleFieldChange("lessonLearned", event.target.value)
						}
						className="bg-bg-300 border-bg-300 text-small text-txt-100 p-s-300 rounded-md"
					/>
				</div>

				{/* Followed Plan Toggle */}
				<div className="space-y-s-200">
					<span
						id="label-panel-followed-plan"
						className="text-tiny text-txt-300 font-medium"
					>
						{tTrade("didYouFollowPlan")}
					</span>
					<div
						className="gap-m-400 flex"
						role="group"
						aria-labelledby="label-panel-followed-plan"
					>
						<button
							id="panel-followed-plan-yes"
							type="button"
							tabIndex={0}
							onClick={() =>
								handleFieldChange(
									"followedPlan",
									formData.followedPlan === true ? null : true
								)
							}
							aria-label={`${tTrade("followedPlan")}: ${tCommon("yes")}`}
							aria-pressed={formData.followedPlan === true}
							className={cn(
								"p-s-300 text-small focus-visible:ring-acc-100/30 flex-1 rounded-lg border-2 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
								formData.followedPlan === true
									? "border-trade-buy bg-trade-buy/10 text-trade-buy"
									: "border-bg-300 text-txt-200 hover:border-trade-buy/50"
							)}
						>
							{tCommon("yes")}
						</button>
						<button
							id="panel-followed-plan-no"
							type="button"
							tabIndex={0}
							onClick={() =>
								handleFieldChange(
									"followedPlan",
									formData.followedPlan === false ? null : false
								)
							}
							aria-label={`${tTrade("followedPlan")}: ${tCommon("no")}`}
							aria-pressed={formData.followedPlan === false}
							className={cn(
								"p-s-300 text-small focus-visible:ring-acc-100/30 flex-1 rounded-lg border-2 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
								formData.followedPlan === false
									? "border-trade-sell bg-trade-sell/10 text-trade-sell"
									: "border-bg-300 text-txt-200 hover:border-trade-sell/50"
							)}
						>
							{tCommon("no")}
						</button>
					</div>
				</div>

				{/* Discipline Notes — shown when followedPlan is false */}
				{formData.followedPlan === false && (
					<div className="space-y-s-200">
						<Label
							id="label-panel-discipline-notes"
							htmlFor="panel-discipline-notes"
							className="text-tiny text-txt-300 font-medium"
						>
							{tTrade("whatWentWrong")}
						</Label>
						<Textarea
							id="panel-discipline-notes"
							placeholder={tTrade("describeBreach")}
							rows={3}
							value={formData.disciplineNotes}
							onChange={(event) =>
								handleFieldChange("disciplineNotes", event.target.value)
							}
							className="bg-bg-300 border-bg-300 text-small text-txt-100 p-s-300 rounded-md"
						/>
					</div>
				)}

				{/* Execution Rating */}
				<div className="space-y-s-200">
					<span
						id="label-panel-rating"
						className="text-tiny text-txt-300 font-medium"
					>
						{tTrade("rating")}
					</span>
					<p className="text-tiny text-txt-300">{tTrade("ratingHint")}</p>
					<div
						className="gap-s-200 flex"
						role="radiogroup"
						tabIndex={0}
						aria-labelledby="label-panel-rating"
						onKeyDown={(e) => {
							const currentIndex = formData.rating
								? RATING_GRADES.indexOf(
										formData.rating as (typeof RATING_GRADES)[number]
									)
								: -1
							if (e.key === "ArrowRight" || e.key === "ArrowDown") {
								e.preventDefault()
								const nextIndex =
									currentIndex < RATING_GRADES.length - 1 ? currentIndex + 1 : 0
								handleFieldChange("rating", RATING_GRADES[nextIndex])
							} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
								e.preventDefault()
								const prevIndex =
									currentIndex > 0 ? currentIndex - 1 : RATING_GRADES.length - 1
								handleFieldChange("rating", RATING_GRADES[prevIndex])
							}
						}}
					>
						{RATING_GRADES.map((grade, gradeIndex) => {
							const isSelected = formData.rating === grade
							const focusedIndex = formData.rating
								? RATING_GRADES.indexOf(
										formData.rating as (typeof RATING_GRADES)[number]
									)
								: 0

							return (
								<button
									id={`panel-rating-${grade}`}
									key={grade}
									type="button"
									role="radio"
									aria-checked={isSelected}
									aria-label={`${tTrade("rating")}: ${grade}`}
									tabIndex={gradeIndex === focusedIndex ? 0 : -1}
									onClick={() =>
										handleFieldChange("rating", isSelected ? null : grade)
									}
									className={cn(
										"py-s-200 text-small focus-visible:ring-acc-100/30 flex-1 rounded-lg border-2 text-center font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
										isSelected
											? GRADE_COLORS[grade]
											: "border-bg-300 text-txt-300 hover:border-txt-300/50"
									)}
								>
									{grade}
								</button>
							)
						})}
					</div>
				</div>
			</div>

			{/* Save Button — sticky at bottom */}
			<div className="border-bg-300 pt-m-400 shrink-0 border-t">
				<Button
					id="save-trade-notes"
					onClick={handleSave}
					disabled={!isDirty || isSaving}
					className="w-full"
				>
					{isSaving && (
						<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
					)}
					{tTrade("saveNotes")}
				</Button>
			</div>
		</>
	)
}

export type { TradeInfoNotesTabProps }
export { TradeInfoNotesTab }
