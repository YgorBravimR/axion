"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/toast"
import {
	fetchHawksDailyBias,
	upsertHawksDailyBias,
} from "@/app/actions/hawks-bias"
import type { BiasValue } from "@/lib/hawks/action-types"

const BIAS_OPTIONS: BiasValue[] = ["comprador", "vendedor", "lateral"]
const CHECKLIST_KEYS = [
	"renko60min",
	"macd60min",
	"emaStack",
	"vwapPosition",
	"ajusteRespect",
] as const

const ASSET_GROUPS = [
	{ symbol: "WIN", labelKey: "assetGroups.indice" },
	{ symbol: "WDO", labelKey: "assetGroups.dolar" },
] as const

interface HawksBiasRitualProps {
	id?: string
	defaultAsset?: string
	date?: string
}

const HawksBiasRitual = ({
	id = "hawks-bias-ritual",
	defaultAsset = "WIN",
	date,
}: HawksBiasRitualProps) => {
	const t = useTranslations("hawksBias.ritual")
	const { showToast } = useToast()
	const [isLoading, setIsLoading] = useState(true)
	const [isPending, startTransition] = useTransition()
	const [assetSymbol, setAssetSymbol] = useState(defaultAsset)
	const [bias, setBias] = useState<BiasValue>("lateral")
	const [checklist, setChecklist] = useState<Record<string, boolean>>({})
	const [notes, setNotes] = useState("")

	const dateIso = useMemo(() => date ?? new Date().toISOString(), [date])

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksDailyBias({ date: dateIso, assetSymbol })
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setBias(result.data.bias)
				setChecklist(result.data.checklist)
				setNotes(result.data.notes ?? "")
			} else if (result.status === "success") {
				setChecklist({})
				setNotes("")
			}
			setIsLoading(false)
		}
		setIsLoading(true)
		load()
		return () => {
			mounted = false
		}
	}, [dateIso, assetSymbol])

	const handleSave = () => {
		startTransition(async () => {
			const result = await upsertHawksDailyBias({
				date: dateIso,
				assetSymbol,
				bias,
				checklist,
				notes: notes || null,
			})
			if (result.status === "success") {
				showToast("success", result.message)
				return
			}
			showToast("error", result.message)
		})
	}

	const handleToggleChecklist = (key: string) => (next: boolean | "indeterminate") => {
		setChecklist((prev) => ({ ...prev, [key]: next === true }))
	}

	return (
		<Card id={id}>
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-m-400">
				<div className="grid grid-cols-2 gap-m-400">
					{ASSET_GROUPS.map((group) => (
						<Button
							id={`hawks-bias-asset-${group.symbol}`}
							key={group.symbol}
							type="button"
							variant={assetSymbol === group.symbol ? "default" : "outline"}
							onClick={() => setAssetSymbol(group.symbol)}
							disabled={isLoading || isPending}
						>
							{t(group.labelKey)}
						</Button>
					))}
				</div>

				<div className="space-y-s-300">
					<Label id="hawks-bias-bias-label">{t("biasLabel")}</Label>
					<div className="flex flex-wrap gap-s-200">
						{BIAS_OPTIONS.map((option) => (
							<Button
								id={`hawks-bias-option-${option}`}
								key={option}
								type="button"
								variant={bias === option ? "default" : "outline"}
								onClick={() => setBias(option)}
								disabled={isLoading || isPending}
							>
								{t(`bias.${option}`)}
							</Button>
						))}
					</div>
				</div>

				<div className="space-y-s-300">
					<Label id="hawks-bias-checklist-label">{t("checklistLabel")}</Label>
					<div className="space-y-s-200">
						{CHECKLIST_KEYS.map((key) => (
							<label
								key={key}
								htmlFor={`hawks-bias-check-${key}`}
								className="flex items-start gap-s-300 cursor-pointer"
							>
								<Checkbox
									id={`hawks-bias-check-${key}`}
									checked={Boolean(checklist[key])}
									onCheckedChange={handleToggleChecklist(key)}
									disabled={isLoading || isPending}
								/>
								<span className="text-small leading-snug">{t(`checklist.${key}`)}</span>
							</label>
						))}
					</div>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-bias-notes-label" htmlFor="hawks-bias-notes">{t("notesLabel")}</Label>
					<Textarea
						id="hawks-bias-notes"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder={t("notesPlaceholder")}
						rows={3}
						disabled={isLoading || isPending}
					/>
				</div>

				<div className="flex items-center justify-end gap-s-200">
					{(isLoading || isPending) && (
						<Loader2 className="text-text-200 h-4 w-4 animate-spin" aria-hidden="true" />
					)}
					<Button
						id="hawks-bias-save"
						type="button"
						onClick={handleSave}
						disabled={isLoading || isPending}
					>
						{t("save")}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

export { HawksBiasRitual }
export type { HawksBiasRitualProps }
