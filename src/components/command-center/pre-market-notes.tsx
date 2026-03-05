"use client"

import { useState, useEffect } from "react"
import { Sun, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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

	const [preMarketNotes, setPreMarketNotes] = useState("")
	const [mood, setMood] = useState<MoodType | null>(null)
	const [saving, setSaving] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)

	// Initialize form values
	useEffect(() => {
		if (notes) {
			setPreMarketNotes(notes.preMarketNotes || "")
			setMood((notes.mood as MoodType) || null)
		}
	}, [notes])

	// Track changes
	useEffect(() => {
		const currentNotes = notes?.preMarketNotes || ""
		const currentMood = notes?.mood || null

		const changed = preMarketNotes !== currentNotes || mood !== currentMood
		setHasChanges(changed)
	}, [preMarketNotes, mood, notes])

	const handleSave = async () => {
		setSaving(true)
		try {
			await upsertDailyNotes({
				date: effectiveDate.toISOString(),
				preMarketNotes: preMarketNotes || null,
				postMarketNotes: notes?.postMarketNotes || null,
				mood: mood || null,
			})
			onRefresh()
		} catch (error) {
			console.error("Failed to save notes:", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<Sun className="h-5 w-5 text-trade-buy" />
					<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("preMarket")}</h3>
				</div>
				{hasChanges && !isReadOnly && (
					<Button id="pre-market-save" size="sm" onClick={handleSave} disabled={saving}>
						{saving ? (
							<Loader2 className="mr-s-100 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-s-100 h-4 w-4" />
						)}
						{saving ? t("saving") : t("save")}
					</Button>
				)}
			</div>

			{/* Mood Selector */}
			<div className="mb-s-300 sm:mb-m-400">
				<label className="mb-s-200 block text-small text-txt-200">{t("mood")}</label>
				<MoodSelector value={mood} onChange={setMood} disabled={isReadOnly} />
			</div>

			{/* Notes */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">{t("preMarketLabel")}</label>
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
