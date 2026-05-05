"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { upsertWeeklyPlan } from "@/app/actions/fractal-plan/weekly"

interface WeeklyPlanEditorProps {
	weeklyPlanId: string
	existing: {
		targetR: string | null
		intentNotes: string | null
		postMortemNotes: string | null
	}
}

const WeeklyPlanEditor = ({ weeklyPlanId, existing }: WeeklyPlanEditorProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()

	const [targetR, setTargetR] = useState(existing.targetR ?? "")
	const [intentNotes, setIntentNotes] = useState(existing.intentNotes ?? "")
	const [postMortemNotes, setPostMortemNotes] = useState(existing.postMortemNotes ?? "")

	const handleSubmit = () => {
		const parsed = targetR.trim() ? parseFloat(targetR.replace(",", ".")) : undefined
		if (parsed !== undefined && !Number.isFinite(parsed)) {
			showToast("error", "Target R must be a number.")
			return
		}

		startTransition(async () => {
			const result = await upsertWeeklyPlan({
				weeklyPlanId,
				targetR: parsed,
				intentNotes: intentNotes || undefined,
				postMortemNotes: postMortemNotes || undefined,
			})
			if (result.status === "success") {
				showToast("success", "Weekly plan updated")
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
			<div>
				<Label id="lbl-week-target" htmlFor="week-target">Target R for the week</Label>
				<Input
					id="week-target"
					type="number"
					step="0.01"
					value={targetR}
					onChange={(e) => setTargetR(e.target.value)}
					placeholder="e.g., 4.00"
				/>
			</div>
			<div>
				<Label id="lbl-week-intent" htmlFor="week-intent">Intent / focus</Label>
				<Textarea
					id="week-intent"
					rows={3}
					value={intentNotes}
					onChange={(e) => setIntentNotes(e.target.value)}
					placeholder="What does success look like this week?"
				/>
			</div>
			<div>
				<Label id="lbl-week-postmortem" htmlFor="week-postmortem">Post-mortem</Label>
				<Textarea
					id="week-postmortem"
					rows={3}
					value={postMortemNotes}
					onChange={(e) => setPostMortemNotes(e.target.value)}
					placeholder="End-of-week reflection..."
				/>
			</div>
			<div className="flex justify-end">
				<Button id="btn-week-save" type="submit" disabled={isPending}>
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

export type { WeeklyPlanEditorProps }
export { WeeklyPlanEditor }
