"use client"

import { useState, useEffect } from "react"
import { Sun, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { MoodSelector } from "./mood-selector"
import { upsertDailyNotes } from "@/app/actions/command-center"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import type { DailyAccountNote } from "@/db/schema"
import type { MoodType } from "@/lib/validations/command-center"

interface PreMarketNotesProps {
	notes: DailyAccountNote | null
	onRefresh: () => void
	isReadOnly?: boolean
}

export const PreMarketNotes = ({ notes, onRefresh, isReadOnly = false }: PreMarketNotesProps) => {
	const t = useTranslations("commandCenter.notes")
	const effectiveDate = useEffectiveDate()
	const { showToast } = useToast()

	const [preMarketNotes, setPreMarketNotes] = useState("")
	const [mood, setMood] = useState<MoodType | null>(null)
	const [saving, setSaving] = useState(false)

	// Derive hasChanges inline — no state or effect needed
	const hasChanges =
		preMarketNotes !== (notes?.preMarketNotes ?? "") ||
		mood !== ((notes?.mood as MoodType | null) ?? null)

	// Initialize form values
	useEffect(() => {
		if (notes) {
			setPreMarketNotes(notes.preMarketNotes || "")
			setMood((notes.mood as MoodType) || null)
		}
	}, [notes])

	const handleSave = async () => {
		setSaving(true)
		try {
			const result = await upsertDailyNotes({
				date: effectiveDate.toISOString(),
				preMarketNotes: preMarketNotes || null,
				postMarketNotes: notes?.postMarketNotes || null,
				mood: mood || null,
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

	return (
		<div id="cc-pre-market-notes" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<Sun className="h-5 w-5 text-trade-buy" />
					<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("preMarket")}</h3>
				</div>
				{hasChanges && !isReadOnly && (
					<Button id="pre-market-save" size="sm" onClick={handleSave} disabled={saving}>
						{saving ? (
							<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
						) : (
							<Save className="mr-s-100 h-4 w-4" />
						)}
						{saving ? t("saving") : t("save")}
					</Button>
				)}
			</div>

			{/* Mood Selector */}
			<div className="mb-s-300 sm:mb-m-400">
				<Label id="pre-market-mood-label" htmlFor="pre-market-mood" className="mb-s-200 block text-small text-txt-200">{t("mood")}</Label>
				<MoodSelector value={mood} onChange={setMood} disabled={isReadOnly} />
			</div>

			{/* Notes */}
			<div>
				<Label id="pre-market-notes-label" htmlFor="pre-market-notes-textarea" className="mb-s-200 block text-small text-txt-200">{t("preMarketLabel")}</Label>
				<Textarea
					id="pre-market-notes-textarea"
					value={preMarketNotes}
					onChange={(e) => setPreMarketNotes(e.target.value)}
					placeholder={t("placeholder")}
					className="min-h-[120px] resize-none"
					disabled={isReadOnly}
				/>
			</div>
		</div>
	)
}
