"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { upsertHawksMentorInsight } from "@/app/actions/hawks-mentor"

const BIAS_OPTIONS = ["comprador", "vendedor", "lateral"] as const
const OUTCOME_OPTIONS = ["win", "loss", "breakeven", "skipped"] as const
const ASSET_OPTIONS = ["WIN", "WDO", "IND", "DOL"] as const

const todayIso = () => new Date().toISOString().slice(0, 10)

const HawksMentorComposer = () => {
	const t = useTranslations("hawksMentor.composer")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [date, setDate] = useState(todayIso())
	const [assetSymbol, setAssetSymbol] = useState<string>("")
	const [biasCalled, setBiasCalled] = useState<string>("")
	const [setupCalled, setSetupCalled] = useState<string>("")
	const [outcome, setOutcome] = useState<string>("")
	const [bodyMarkdown, setBodyMarkdown] = useState("")

	const handleSave = () => {
		if (!bodyMarkdown.trim()) {
			showToast("error", t("errors.emptyBody"))
			return
		}
		startTransition(async () => {
			const result = await upsertHawksMentorInsight({
				date: new Date(date).toISOString(),
				assetSymbol: assetSymbol || null,
				biasCalled: biasCalled || null,
				setupCalled: setupCalled || null,
				outcome: outcome || null,
				bodyMarkdown,
			})
			if (result.status === "success") {
				showToast("success", result.message)
				setBodyMarkdown("")
				setSetupCalled("")
				setOutcome("")
				return
			}
			showToast("error", result.message)
		})
	}

	return (
		<Card id="hawks-mentor-composer">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-m-400">
				<div className="grid gap-m-400 sm:grid-cols-2">
					<div className="space-y-s-200">
						<Label id="hawks-mentor-date-label" htmlFor="hawks-mentor-date">{t("dateLabel")}</Label>
						<Input
							id="hawks-mentor-date"
							type="date"
							value={date}
							onChange={(event) => setDate(event.target.value)}
							disabled={isPending}
						/>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-mentor-asset-label" htmlFor="hawks-mentor-asset">{t("assetLabel")}</Label>
						<Select value={assetSymbol} onValueChange={setAssetSymbol} disabled={isPending}>
							<SelectTrigger id="hawks-mentor-asset">
								<SelectValue placeholder={t("assetPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{ASSET_OPTIONS.map((symbol) => (
									<SelectItem key={symbol} value={symbol}>
										{symbol}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-mentor-bias-label" htmlFor="hawks-mentor-bias">{t("biasLabel")}</Label>
						<Select value={biasCalled} onValueChange={setBiasCalled} disabled={isPending}>
							<SelectTrigger id="hawks-mentor-bias">
								<SelectValue placeholder={t("biasPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{BIAS_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-mentor-outcome-label" htmlFor="hawks-mentor-outcome">{t("outcomeLabel")}</Label>
						<Select value={outcome} onValueChange={setOutcome} disabled={isPending}>
							<SelectTrigger id="hawks-mentor-outcome">
								<SelectValue placeholder={t("outcomePlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{OUTCOME_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-mentor-setup-label" htmlFor="hawks-mentor-setup">{t("setupLabel")}</Label>
					<Input
						id="hawks-mentor-setup"
						value={setupCalled}
						onChange={(event) => setSetupCalled(event.target.value)}
						placeholder={t("setupPlaceholder")}
						disabled={isPending}
					/>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-mentor-body-label" htmlFor="hawks-mentor-body">{t("bodyLabel")}</Label>
					<Textarea
						id="hawks-mentor-body"
						value={bodyMarkdown}
						onChange={(event) => setBodyMarkdown(event.target.value)}
						rows={8}
						placeholder={t("bodyPlaceholder")}
						disabled={isPending}
					/>
				</div>

				<div className="flex items-center justify-end gap-s-200">
					{isPending && (
						<Loader2 className="text-text-200 h-4 w-4 animate-spin" aria-hidden="true" />
					)}
					<Button
						id="hawks-mentor-save"
						type="button"
						onClick={handleSave}
						disabled={isPending}
					>
						{t("save")}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

export { HawksMentorComposer }
