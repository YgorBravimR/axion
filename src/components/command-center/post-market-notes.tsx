"use client"

import { useState, useEffect } from "react"
import { Moon, Save, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { upsertDailyPlan } from "@/app/actions/fractal-plan/daily"
import type { DailyPlan } from "@/db/schema"

interface PostMarketNotesProps {
	dailyPlan: DailyPlan | null
	onRefresh: () => void
	isReadOnly?: boolean
}

export const PostMarketNotes = ({
	dailyPlan,
	onRefresh,
	isReadOnly = false,
}: PostMarketNotesProps) => {
	const t = useTranslations("commandCenter.notes")
	const tPlan = useTranslations("commandCenter.plan")
	const { showToast } = useToast()

	const [postMarketNotes, setPostMarketNotes] = useState("")
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (dailyPlan) {
			setPostMarketNotes(dailyPlan.postMarketNotes ?? "")
		}
	}, [dailyPlan])

	const hasChanges =
		!!dailyPlan && postMarketNotes !== (dailyPlan.postMarketNotes ?? "")

	const handleSave = async () => {
		if (!dailyPlan) {
			return
		}
		setSaving(true)
		try {
			const result = await upsertDailyPlan({
				dailyPlanId: dailyPlan.id,
				postMarketNotes: postMarketNotes || null,
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
			<Panel id="cc-post-market-notes" tone="muted">
				<div className="gap-s-200 flex items-center">
					<Moon className="text-txt-300 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("postMarket")}
					</h3>
				</div>
				<p className="mt-s-200 text-tiny text-txt-300">
					{tPlan("noPlanPrompt")}
				</p>
			</Panel>
		)
	}

	return (
		<Panel id="cc-post-market-notes">
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Moon className="text-txt-300 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("postMarket")}
					</h3>
				</div>
				{hasChanges && !isReadOnly && (
					<Button
						id="post-market-save"
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

			<div>
				<Label
					id="post-market-notes-label"
					htmlFor="post-market-notes-textarea"
					className="mb-s-200 text-small text-txt-200 block"
				>
					{t("postMarketLabel")}
				</Label>
				<Textarea
					id="post-market-notes-textarea"
					value={postMarketNotes}
					onChange={(e) => setPostMarketNotes(e.target.value)}
					placeholder={t("postMarketPlaceholder")}
					className="min-h-[120px] resize-none sm:resize-y"
					disabled={isReadOnly}
				/>
			</div>
		</Panel>
	)
}
