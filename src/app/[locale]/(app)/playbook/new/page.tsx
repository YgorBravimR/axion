"use client"

import { useState, useTransition, useRef } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { createStrategy } from "@/app/actions/strategies"
import { ConditionPicker } from "@/components/playbook/condition-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { uploadFiles } from "@/lib/upload-files"
import type { PendingImage } from "@/lib/validations/upload"
import type { StrategyConditionInput } from "@/types/trading-condition"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { newStrategyGuide } from "@/components/ui/page-guide/guide-configs/new-strategy"
import { Filter, ImageIcon } from "lucide-react"

const NewStrategyPage = () => {
	const router = useRouter()
	const t = useTranslations("playbook.form")
	const tScenarios = useTranslations("playbook.scenarios")
	const tCommon = useTranslations("common")
	const { isPremium } = useFeatureAccess()
	useRegisterPageGuide(newStrategyGuide)
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})
	const [conditions, setConditions] = useState<StrategyConditionInput[]>([])
	const [pendingScreenshot, setPendingScreenshot] =
		useState<PendingImage | null>(null)
	const [code, setCode] = useState("")
	const [name, setName] = useState("")
	const codeInputRef = useRef<HTMLInputElement>(null)

	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setFieldErrors({})

		const formData = new FormData(e.currentTarget)

		startTransition(async () => {
			// Upload pending screenshot if present
			let screenshotUrl: string | undefined
			let screenshotS3Key: string | undefined

			if (pendingScreenshot) {
				// We need an entityId for the S3 path — generate one that will be the strategy ID
				const tempEntityId = crypto.randomUUID()
				const { uploaded, errors } = await uploadFiles({
					pendingImages: [pendingScreenshot],
					path: "playbooks",
					entityId: tempEntityId,
				})

				if (errors.length > 0) {
					showToast("error", errors[0]!)
					return
				}

				if (uploaded.length > 0) {
					screenshotUrl = uploaded[0]!.url
					screenshotS3Key = uploaded[0]!.s3Key
				}
			}

			const data = {
				code: (formData.get("code") as string).toUpperCase(),
				name: formData.get("name") as string,
				description: (formData.get("description") as string) || undefined,
				entryCriteria: (formData.get("entryCriteria") as string) || undefined,
				exitCriteria: (formData.get("exitCriteria") as string) || undefined,
				riskRules: (formData.get("riskRules") as string) || undefined,
				finalR: formData.get("finalR")
					? Number(formData.get("finalR"))
					: undefined,
				maxRiskPercent: formData.get("maxRiskPercent")
					? Number(formData.get("maxRiskPercent"))
					: undefined,
				screenshotUrl,
				screenshotS3Key,
				notes: (formData.get("notes") as string) || undefined,
				isActive: true,
				conditions: conditions.length > 0 ? conditions : undefined,
			}

			const result = await createStrategy(data)

			if (result.status === "success") {
				setCode("")
				setName("")
				setConditions([])
				setPendingScreenshot(null)
				router.push("/playbook")
			} else {
				showToast("error", result.message)

				// Highlight affected fields from error response
				const errors: Record<string, boolean> = {}
				for (const err of result.errors ?? []) {
					if (err.code === "DUPLICATE_STRATEGY") {
						errors.code = true
					}
					if (
						err.code === "VALIDATION_ERROR" &&
						err.detail.startsWith("code:")
					) {
						errors.code = true
					}
				}
				if (Object.keys(errors).length > 0) {
					setFieldErrors(errors)
					if (errors.code) {
						codeInputRef.current?.focus()
					}
				}
			}
		})
	}

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-3xl">
					<form
						onSubmit={handleSubmit}
						className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
					>
						{/* Basic Info Section */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<h2 className="text-small sm:text-body text-txt-100 mb-s-300 sm:mb-m-400 font-semibold">
								{t("basicInfo")}
							</h2>

							<div className="space-y-m-400">
								<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
									<div>
										<Label
											id="label-code"
											htmlFor="code"
											required
											filled={!!code.trim()}
										>
											{t("codeLabel")}
										</Label>
										<Input
											ref={codeInputRef}
											id="code"
											name="code"
											placeholder={t("codePlaceholder")}
											required
											maxLength={10}
											minLength={3}
											className="mt-s-200 uppercase"
											aria-invalid={fieldErrors.code ? "true" : undefined}
											value={code}
											onChange={(e) => {
												setCode(e.target.value)
												if (fieldErrors.code) {
													setFieldErrors({})
												}
											}}
										/>
										<p className="text-tiny text-txt-300 mt-s-100">
											{t("codeHint")}
										</p>
									</div>
									<div className="sm:col-span-2">
										<Label
											id="label-strategy-name"
											htmlFor="name"
											required
											filled={!!name.trim()}
										>
											{t("strategyNameLabel")}
										</Label>
										<Input
											id="name"
											name="name"
											placeholder={t("strategyNamePlaceholder")}
											required
											className="mt-s-200"
											value={name}
											onChange={(e) => setName(e.target.value)}
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
										placeholder={t("descriptionPlaceholder")}
										rows={3}
										className="mt-s-200"
									/>
								</div>

								<div role="group" aria-labelledby="label-screenshot">
									<Label id="label-screenshot">{t("referenceImage")}</Label>
									<p className="text-tiny text-txt-300 mt-s-100 mb-s-200">
										{t("referenceImageHint")}
									</p>
									<ImageUpload
										pendingImages={pendingScreenshot ? [pendingScreenshot] : []}
										onFileAdd={setPendingScreenshot}
										onPendingRemove={() => setPendingScreenshot(null)}
										maxImages={1}
									/>
								</div>
							</div>
						</div>

						{/* Rules & Criteria Section */}
						<div
							id="strategy-rules-criteria"
							className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
						>
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
										placeholder={t("notesPlaceholder")}
										rows={3}
										className="mt-s-200"
									/>
								</div>
							</div>
						</div>

						{/* Risk Settings Section */}
						<div
							id="strategy-risk-settings"
							className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
						>
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
										placeholder={t("riskRulesPlaceholder")}
										rows={5}
										className="mt-s-200"
									/>
								</div>

								<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
									<div>
										<Label id="label-target-r-multiple" htmlFor="finalR">
											{t("finalR")}
										</Label>
										<Input
											id="finalR"
											name="finalR"
											type="number"
											step="0.1"
											min="0.1"
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
						{isPremium && (
							<div
								id="strategy-conditions"
								className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
							>
								<div className="gap-s-200 flex items-center">
									<Filter className="text-txt-200 h-5 w-5" aria-hidden="true" />
									<h2 className="text-small sm:text-body text-txt-100 font-semibold">
										{t("tradingConditions")}
									</h2>
								</div>
								<p className="text-tiny text-txt-300 mt-s-200 mb-m-400">
									{t("tradingConditionsHint")}
								</p>
								<ConditionPicker value={conditions} onChange={setConditions} />
							</div>
						)}

						{/* Scenarios hint */}
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<ImageIcon
									className="text-txt-200 h-5 w-5"
									aria-hidden="true"
								/>
								<h2 className="text-small sm:text-body text-txt-100 font-semibold">
									{tScenarios("title")}
								</h2>
							</div>
							<p className="text-small text-txt-300 mt-m-400">
								{t("scenariosSaveFirst")}
							</p>
						</div>

						{/* Actions */}
						<div className="gap-s-300 flex justify-end">
							<Link href="/playbook">
								<Button
									id="playbook-new-cancel"
									type="button"
									variant="outline"
									disabled={isPending}
								>
									{tCommon("cancel")}
								</Button>
							</Link>
							<Button
								id="playbook-new-create"
								type="submit"
								disabled={isPending}
							>
								{isPending ? t("creating") : t("createStrategy")}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}

// Next.js requires default export for page components
export { NewStrategyPage as default }
