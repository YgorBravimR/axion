"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import {
	fetchHawksScenario,
	upsertHawksScenario,
} from "@/app/actions/hawks-scenario"

const ELLIOTT_WAVES = ["1", "2", "3", "4", "5", "A", "B", "C"] as const
const PULLBACK_LEVELS = ["38.2", "50", "61.8", "76.4"] as const
const MMA_OPTIONS = ["yes", "no", "partial"] as const
const SCENARIO_RANGE = Array.from({ length: 24 }, (_, idx) => idx + 1)

interface HawksScenarioPickerProps {
	tradeId: string
}

const HawksScenarioPicker = ({ tradeId }: HawksScenarioPickerProps) => {
	const t = useTranslations("hawksScenario.picker")
	const { showToast } = useToast()
	const [isLoading, setIsLoading] = useState(true)
	const [isPending, startTransition] = useTransition()
	const [scenarioCode, setScenarioCode] = useState<string>("")
	const [elliottWave, setElliottWave] = useState<string>("")
	const [pullbackLevel, setPullbackLevel] = useState<string>("")
	const [mmaAligned, setMmaAligned] = useState<string>("")
	const [confluenciaInput, setConfluenciaInput] = useState<string>("")

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await fetchHawksScenario(tradeId)
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setScenarioCode(result.data.scenarioCode?.toString() ?? "")
				setElliottWave(result.data.elliottWave ?? "")
				setPullbackLevel(result.data.pullbackLevel ?? "")
				setMmaAligned(result.data.mmaAligned ?? "")
				setConfluenciaInput(result.data.confluencia.join(", "))
			}
			setIsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [tradeId])

	const confluencia = useMemo(
		() =>
			confluenciaInput
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		[confluenciaInput]
	)

	const handleSave = () => {
		startTransition(async () => {
			const result = await upsertHawksScenario({
				tradeId,
				scenarioCode: scenarioCode ? Number(scenarioCode) : null,
				elliottWave: elliottWave || null,
				pullbackLevel: pullbackLevel || null,
				mmaAligned: mmaAligned || null,
				confluencia,
			})
			if (result.status === "success") {
				showToast("success", result.message)
				return
			}
			showToast("error", result.message)
		})
	}

	return (
		<Card id="hawks-scenario-picker">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-m-400">
				<div className="grid gap-m-400 sm:grid-cols-2">
					<div className="space-y-s-200">
						<Label id="hawks-scenario-code-label" htmlFor="hawks-scenario-code">{t("scenarioLabel")}</Label>
						<Select
							value={scenarioCode}
							onValueChange={setScenarioCode}
							disabled={isLoading || isPending}
						>
							<SelectTrigger id="hawks-scenario-code">
								<SelectValue placeholder={t("scenarioPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{SCENARIO_RANGE.map((code) => (
									<SelectItem key={code} value={code.toString()}>
										#{code}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-scenario-wave-label" htmlFor="hawks-scenario-wave">{t("waveLabel")}</Label>
						<Select
							value={elliottWave}
							onValueChange={setElliottWave}
							disabled={isLoading || isPending}
						>
							<SelectTrigger id="hawks-scenario-wave">
								<SelectValue placeholder={t("wavePlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{ELLIOTT_WAVES.map((wave) => (
									<SelectItem key={wave} value={wave}>
										{wave}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-scenario-pullback-label" htmlFor="hawks-scenario-pullback">{t("pullbackLabel")}</Label>
						<Select
							value={pullbackLevel}
							onValueChange={setPullbackLevel}
							disabled={isLoading || isPending}
						>
							<SelectTrigger id="hawks-scenario-pullback">
								<SelectValue placeholder={t("pullbackPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{PULLBACK_LEVELS.map((level) => (
									<SelectItem key={level} value={level}>
										{level}%
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-s-200">
						<Label id="hawks-scenario-mma-label" htmlFor="hawks-scenario-mma">{t("mmaLabel")}</Label>
						<Select
							value={mmaAligned}
							onValueChange={setMmaAligned}
							disabled={isLoading || isPending}
						>
							<SelectTrigger id="hawks-scenario-mma">
								<SelectValue placeholder={t("mmaPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{MMA_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{t(`mma.${option}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-s-200">
					<Label id="hawks-scenario-confluencia-label" htmlFor="hawks-scenario-confluencia">{t("confluenciaLabel")}</Label>
					<Input
						id="hawks-scenario-confluencia"
						value={confluenciaInput}
						onChange={(event) => setConfluenciaInput(event.target.value)}
						placeholder={t("confluenciaPlaceholder")}
						disabled={isLoading || isPending}
					/>
					<p className="text-text-300 text-tiny">{t("confluenciaHint")}</p>
				</div>

				<div className="flex items-center justify-end gap-s-200">
					{(isLoading || isPending) && (
						<Loader2 className="text-text-200 h-4 w-4 animate-spin" aria-hidden="true" />
					)}
					<Button
						id="hawks-scenario-save"
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

export { HawksScenarioPicker }
export type { HawksScenarioPickerProps }
