"use client"

import { useState, useTransition, useEffect } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowLeft, Filter, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getStrategy, updateStrategy } from "@/app/actions/strategies"
import { getStrategyConditions } from "@/app/actions/strategy-conditions"
import type { StrategyWithStats } from "@/app/actions/strategies"
import { ConditionPicker } from "@/components/playbook/condition-picker"
import { ScenarioSection } from "@/components/playbook/scenario-section"
import { ImageUpload } from "@/components/shared/image-upload"
import { uploadFiles } from "@/lib/upload-files"
import type { PersistedImage, PendingImage } from "@/lib/validations/upload"
import type { StrategyConditionInput } from "@/types/trading-condition"
import { useFeatureAccess } from "@/hooks/use-feature-access"

interface EditStrategyPageProps {
	params: Promise<{ id: string }>
}

const EditStrategyPage = ({ params }: EditStrategyPageProps) => {
	const router = useRouter()
	const t = useTranslations("playbook.form")
	const tScenarios = useTranslations("playbook.scenarios")
	const { isAdmin } = useFeatureAccess()
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [strategy, setStrategy] = useState<StrategyWithStats | null>(null)
	const [strategyId, setStrategyId] = useState<string | null>(null)
	const [conditions, setConditions] = useState<StrategyConditionInput[]>([])
	const [persistedScreenshot, setPersistedScreenshot] =
		useState<PersistedImage | null>(null)
	const [pendingScreenshot, setPendingScreenshot] =
		useState<PendingImage | null>(null)

	useEffect(() => {
		const loadStrategy = async () => {
			const { id } = await params
			setStrategyId(id)

			const [stratResult, condResult] = await Promise.all([
				getStrategy(id),
				getStrategyConditions(id),
			])

			if (stratResult.status === "success" && stratResult.data) {
				setStrategy(stratResult.data)
				// Initialize persisted screenshot from existing data
				if (
					stratResult.data.screenshotUrl &&
					stratResult.data.screenshotS3Key
				) {
					setPersistedScreenshot({
						url: stratResult.data.screenshotUrl,
						s3Key: stratResult.data.screenshotS3Key,
					})
				}
			} else {
				setError(t("strategyNotFound"))
			}

			if (condResult.status === "success" && condResult.data) {
				setConditions(
					condResult.data.map((sc) => ({
						conditionId: sc.conditionId,
						tier: sc.tier,
						sortOrder: sc.sortOrder,
					}))
				)
			}

			setIsLoading(false)
		}
		loadStrategy()
	}, [params, t])

	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!strategyId) return
		setError(null)

		const formData = new FormData(e.currentTarget)

		startTransition(async () => {
			let screenshotUrl: string | undefined
			let screenshotS3Key: string | undefined

			if (pendingScreenshot) {
				// New image selected — upload it
				const { uploaded, errors } = await uploadFiles({
					pendingImages: [pendingScreenshot],
					path: "playbooks",
					entityId: strategyId,
				})

				if (errors.length > 0) {
					setError(errors[0])
					return
				}

				if (uploaded.length > 0) {
					screenshotUrl = uploaded[0].url
					screenshotS3Key = uploaded[0].s3Key
				}
			} else if (persistedScreenshot) {
				// Keep existing screenshot
				screenshotUrl = persistedScreenshot.url
				screenshotS3Key = persistedScreenshot.s3Key
			}
			// If persistedScreenshot is null and no pending → both stay undefined → clears screenshot

			const data = {
				code: (formData.get("code") as string).toUpperCase(),
				name: formData.get("name") as string,
				description: (formData.get("description") as string) || undefined,
				entryCriteria: (formData.get("entryCriteria") as string) || undefined,
				exitCriteria: (formData.get("exitCriteria") as string) || undefined,
				riskRules: (formData.get("riskRules") as string) || undefined,
				targetRMultiple: formData.get("targetRMultiple")
					? Number(formData.get("targetRMultiple"))
					: undefined,
				maxRiskPercent: formData.get("maxRiskPercent")
					? Number(formData.get("maxRiskPercent"))
					: undefined,
				screenshotUrl: screenshotUrl ?? "",
				screenshotS3Key: screenshotS3Key ?? "",
				notes: (formData.get("notes") as string) || undefined,
				isActive: true,
				conditions,
			}

			const result = await updateStrategy(strategyId, data)

			if (result.status === "success") {
				router.push("/playbook")
			} else {
				setError(result.message)
			}
		})
	}

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-txt-300">{t("loadingStrategy")}</p>
			</div>
		)
	}

	if (!strategy) {
		return (
			<div className="gap-m-400 flex h-full flex-col items-center justify-center">
				<p className="text-txt-300">{t("strategyNotFound")}</p>
				<Link href="/playbook">
					<Button id="playbook-edit-back-to-playbook" variant="outline">
						<ArrowLeft className="mr-2 h-4 w-4" />
						{t("backToPlaybook")}
					</Button>
				</Link>
			</div>
		)
	}

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-3xl">
					<form
						onSubmit={handleSubmit}
						className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
					>
						{error && (
							<div className="bg-fb-error/10 text-fb-error p-s-300 text-small rounded-lg">
								{error}
							</div>
						)}

						{/* Basic Info Section */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 mb-s-300 sm:mb-m-400 font-semibold">
								{t("basicInfo")}
							</h2>

							<div className="space-y-m-400">
								<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
									<div>
										<Label id="label-code" htmlFor="code">
											{t("codeLabel")}
										</Label>
										<Input
											id="code"
											name="code"
											defaultValue={strategy.code}
											placeholder={t("codePlaceholder")}
											required
											maxLength={10}
											minLength={3}
											className="mt-s-200 uppercase"
										/>
										<p className="text-tiny text-txt-300 mt-s-100">
											{t("codeHint")}
										</p>
									</div>
									<div className="sm:col-span-2">
										<Label id="label-strategy-name" htmlFor="name">
											{t("strategyNameLabel")}
										</Label>
										<Input
											id="name"
											name="name"
											defaultValue={strategy.name}
											placeholder={t("strategyNamePlaceholder")}
											required
											className="mt-s-200"
										/>
									</div>
								</div>

								<div>
									<Label id="label-description" htmlFor="description">
										{t("descriptionLabel")}
									</Label>
									<Textarea
										id="description"
										name="description"
										defaultValue={strategy.description || ""}
										placeholder={t("descriptionPlaceholder")}
										rows={3}
										className="mt-s-200"
									/>
								</div>

								<div>
									<Label id="label-screenshot">{t("referenceImage")}</Label>
									<p className="text-tiny text-txt-300 mt-s-100 mb-s-200">
										{t("referenceImageHint")}
									</p>
									<ImageUpload
										persistedImages={
											persistedScreenshot ? [persistedScreenshot] : []
										}
										pendingImages={pendingScreenshot ? [pendingScreenshot] : []}
										onFileAdd={(img) => setPendingScreenshot(img)}
										onPendingRemove={() => setPendingScreenshot(null)}
										onPersistedRemove={() => setPersistedScreenshot(null)}
										maxImages={1}
									/>
								</div>
							</div>
						</div>

						{/* Rules & Criteria Section */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 mb-s-300 sm:mb-m-400 font-semibold">
								{t("rulesCriteria")}
							</h2>

							<div className="space-y-m-400">
								<div>
									<Label id="label-entry-criteria" htmlFor="entryCriteria">
										{t("entryCriteriaLabel")}
									</Label>
									<Textarea
										id="entryCriteria"
										name="entryCriteria"
										defaultValue={strategy.entryCriteria || ""}
										placeholder={t("entryCriteriaPlaceholder")}
										rows={5}
										className="mt-s-200"
									/>
									<p className="text-tiny text-txt-300 mt-s-100">
										{t("entryCriteriaHint")}
									</p>
								</div>

								<div>
									<Label id="label-exit-criteria" htmlFor="exitCriteria">
										{t("exitCriteriaLabel")}
									</Label>
									<Textarea
										id="exitCriteria"
										name="exitCriteria"
										defaultValue={strategy.exitCriteria || ""}
										placeholder={t("exitCriteriaPlaceholder")}
										rows={5}
										className="mt-s-200"
									/>
									<p className="text-tiny text-txt-300 mt-s-100">
										{t("exitCriteriaHint")}
									</p>
								</div>

								<div>
									<Label id="label-notes" htmlFor="notes">
										{t("additionalNotes")}
									</Label>
									<Textarea
										id="notes"
										name="notes"
										defaultValue={strategy.notes || ""}
										placeholder={t("notesPlaceholder")}
										rows={3}
										className="mt-s-200"
									/>
								</div>
							</div>
						</div>

						{/* Risk Settings Section */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 mb-s-300 sm:mb-m-400 font-semibold">
								{t("riskSettings")}
							</h2>

							<div className="space-y-m-400">
								<div>
									<Label id="label-risk-rules" htmlFor="riskRules">
										{t("riskManagementRules")}
									</Label>
									<Textarea
										id="riskRules"
										name="riskRules"
										defaultValue={strategy.riskRules || ""}
										placeholder={t("riskRulesPlaceholder")}
										rows={5}
										className="mt-s-200"
									/>
								</div>

								<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
									<div>
										<Label
											id="label-target-r-multiple"
											htmlFor="targetRMultiple"
										>
											{t("targetRMultiple")}
										</Label>
										<Input
											id="targetRMultiple"
											name="targetRMultiple"
											type="number"
											step="0.1"
											min="0.1"
											defaultValue={strategy.targetRMultiple || ""}
											placeholder={t("targetRPlaceholder")}
											className="mt-s-200"
										/>
										<p className="text-tiny text-txt-300 mt-s-100">
											{t("targetRHint")}
										</p>
									</div>

									<div>
										<Label id="label-max-risk-percent" htmlFor="maxRiskPercent">
											{t("maxRiskPerTrade")}
										</Label>
										<Input
											id="maxRiskPercent"
											name="maxRiskPercent"
											type="number"
											step="0.1"
											min="0.1"
											max="100"
											defaultValue={strategy.maxRiskPercent || ""}
											placeholder={t("maxRiskPlaceholder")}
											className="mt-s-200"
										/>
										<p className="text-tiny text-txt-300 mt-s-100">
											{t("maxRiskHint")}
										</p>
									</div>
								</div>
							</div>
						</div>

						{/* Conditions Section */}
						{isAdmin && (
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Filter className="text-acc-100 h-5 w-5" />
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									{t("tradingConditions")}
								</h2>
							</div>
							<p className="text-tiny text-txt-300 mt-s-200 mb-m-400">
								{t("tradingConditionsEditHint")}
							</p>
							<ConditionPicker value={conditions} onChange={setConditions} />
						</div>
						)}

						{/* Scenarios Section */}
						{strategyId && (
							<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
								<div className="gap-s-200 flex items-center">
									<ImageIcon className="text-acc-100 h-5 w-5" />
									<h2 className="text-small sm:text-body text-txt-100 font-semibold">
										{tScenarios("title")}
									</h2>
								</div>
								<p className="text-tiny text-txt-300 mt-s-200 mb-m-400">
									{t("scenariosHint")}
								</p>
								<ScenarioSection strategyId={strategyId} />
							</div>
						)}

						{/* Actions */}
						<div className="gap-s-300 flex justify-end">
							<Link href="/playbook">
								<Button
									id="playbook-edit-cancel"
									type="button"
									variant="outline"
									disabled={isPending}
								>
									{tCommon("cancel")}
								</Button>
							</Link>
							<Button
								id="playbook-edit-save"
								type="submit"
								disabled={isPending}
							>
								{isPending ? tCommon("saving") : tCommon("saveChanges")}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}

// Next.js requires default export for page components
export { EditStrategyPage as default }
