"use client"

import { useState, useEffect } from "react"
import { Moon, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
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
	const { showToast } = useToast()

	const [postMarketNotes, setPostMarketNotes] = useState("")
	const [saving, setSaving] = useState(false)

	// Derive hasChanges inline — no state or effect needed
	const hasChanges = postMarketNotes !== (notes?.postMarketNotes ?? "")

	// Initialize form values
	useEffect(() => {
		if (notes) {
			setPostMarketNotes(notes.postMarketNotes || "")
		}
	}, [notes])

	const handleSave = async () => {
		setSaving(true)
		try {
			const result = await upsertDailyNotes({
				date: effectiveDate.toISOString(),
				preMarketNotes: notes?.preMarketNotes || null,
				postMarketNotes: postMarketNotes || null,
				mood: (notes?.mood as MoodType | null) || null,
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
							<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
						) : (
							<Save className="mr-s-100 h-4 w-4" />
						)}
						{saving ? t("saving") : t("save")}
					</Button>
				)}
			</div>

			{/* Notes */}
			<div>
				<Label id="post-market-notes-label" htmlFor="post-market-notes-textarea" className="mb-s-200 block text-small text-txt-200">{t("postMarketLabel")}</Label>
				<Textarea
					id="post-market-notes-textarea"
					value={postMarketNotes}
					onChange={(e) => setPostMarketNotes(e.target.value)}
					placeholder={t("postMarketPlaceholder")}
					className="min-h-[120px] resize-none sm:resize-y"
					disabled={isReadOnly}
				/>
			</div>
		</div>
	)
}
