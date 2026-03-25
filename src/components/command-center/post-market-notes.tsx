"use client"

import { useState, useEffect } from "react"
import { Moon, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { upsertDailyNotes } from "@/app/actions/command-center"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import type { DailyAccountNote } from "@/db/schema"
import type { MoodType } from "@/lib/validations/command-center"

interface PostMarketNotesProps {
	notes: DailyAccountNote | null
	onRefresh: () => void
	isReadOnly?: boolean
}

export const PostMarketNotes = ({ notes, onRefresh, isReadOnly = false }: PostMarketNotesProps) => {
	const t = useTranslations("commandCenter.notes")
	const effectiveDate = useEffectiveDate()

	const [postMarketNotes, setPostMarketNotes] = useState("")
	const [saving, setSaving] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)

	// Initialize form values
	useEffect(() => {
		if (notes) {
			setPostMarketNotes(notes.postMarketNotes || "")
		}
	}, [notes])

	// Track changes
	useEffect(() => {
		const currentNotes = notes?.postMarketNotes || ""
		setHasChanges(postMarketNotes !== currentNotes)
	}, [postMarketNotes, notes])

	const handleSave = async () => {
		setSaving(true)
		try {
			await upsertDailyNotes({
				date: effectiveDate.toISOString(),
				preMarketNotes: notes?.preMarketNotes || null,
				postMarketNotes: postMarketNotes || null,
				mood: (notes?.mood as MoodType | null) || null,
			})
			onRefresh()
		} catch (error) {
			console.error("Failed to save notes:", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<div id="cc-post-market-notes" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<Moon className="h-5 w-5 text-acc-100" />
					<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("postMarket")}</h3>
				</div>
				{hasChanges && !isReadOnly && (
					<Button id="post-market-save" size="sm" onClick={handleSave} disabled={saving}>
						{saving ? (
							<Loader2 className="mr-s-100 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-s-100 h-4 w-4" />
						)}
						{saving ? t("saving") : t("save")}
					</Button>
				)}
			</div>

			{/* Notes */}
			<div>
				<label className="mb-s-200 block text-small text-txt-200">{t("postMarketLabel")}</label>
				<Textarea
					id="post-market-notes-textarea"
					value={postMarketNotes}
					onChange={(e) => setPostMarketNotes(e.target.value)}
					placeholder={t("postMarketPlaceholder")}
					className="min-h-[120px] resize-none"
					disabled={isReadOnly}
				/>
			</div>
		</div>
	)
}
