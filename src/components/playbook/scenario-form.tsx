"use client"

import { useState, useTransition, useEffect } from "react"
import type { FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import { ImageUpload } from "@/components/shared/image-upload"
import { uploadFiles } from "@/lib/upload-files"
import type { PersistedImage, PendingImage } from "@/lib/validations/upload"
import {
	createScenario,
	updateScenario,
	addScenarioImage,
	removeScenarioImage,
} from "@/app/actions/scenarios"
import type { ScenarioWithImages } from "@/app/actions/scenarios"
import { Loader2 } from "lucide-react"

interface ScenarioFormProps {
	strategyId: string
	scenario?: ScenarioWithImages | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

const ScenarioForm = ({
	strategyId,
	scenario,
	open,
	onOpenChange,
	onSuccess,
}: ScenarioFormProps) => {
	const t = useTranslations("playbook.scenarios")
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const isEdit = !!scenario

	const [formData, setFormData] = useState({
		name: scenario?.name ?? "",
		description: scenario?.description ?? "",
	})

	const [persistedImages, setPersistedImages] = useState<PersistedImage[]>(
		scenario?.images?.map((img) => ({ url: img.url, s3Key: img.s3Key })) ?? []
	)
	const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
	const [removedPersistedKeys, setRemovedPersistedKeys] = useState<string[]>([])

	useEffect(() => {
		if (scenario) {
			setFormData({
				name: scenario.name,
				description: scenario.description ?? "",
			})
			setPersistedImages(
				scenario.images?.map((img) => ({ url: img.url, s3Key: img.s3Key })) ??
					[]
			)
		} else {
			setFormData({ name: "", description: "" })
			setPersistedImages([])
		}
		// Reset pending state when dialog re-opens or scenario changes
		setPendingImages([])
		setRemovedPersistedKeys([])
	}, [scenario])

	const handleFileAdd = (pending: PendingImage) => {
		setPendingImages((prev) => [...prev, pending])
	}

	const handlePendingRemove = (previewUrl: string) => {
		setPendingImages((prev) =>
			prev.filter((img) => img.previewUrl !== previewUrl)
		)
	}

	const handlePersistedRemove = (s3Key: string) => {
		setPersistedImages((prev) => prev.filter((img) => img.s3Key !== s3Key))
		setRemovedPersistedKeys((prev) => [...prev, s3Key])
	}

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			if (isEdit) {
				// Update scenario text fields
				const result = await updateScenario(scenario.id, {
					name: formData.name.trim(),
					description: formData.description.trim() || undefined,
				})

				if (result.status !== "success") {
					setError(result.message)
					return
				}

				// Batch-remove persisted images that were deleted
				const imagesToRemove = removedPersistedKeys
					.map((s3Key) => scenario.images?.find((img) => img.s3Key === s3Key))
					.filter((img): img is NonNullable<typeof img> => img !== undefined)

				await Promise.all(
					imagesToRemove.map((img) => removeScenarioImage(img.id))
				)

				// Upload new pending images
				if (pendingImages.length > 0) {
					const { uploaded, errors } = await uploadFiles({
						pendingImages,
						path: "scenarios",
						entityId: scenario.id,
					})

					if (errors.length > 0) {
						setError(errors.join(", "))
						return
					}

					// Link uploaded images to scenario in parallel
					const existingCount = persistedImages.length
					await Promise.all(
						uploaded.map((img, index) =>
							addScenarioImage(
								scenario.id,
								img.url,
								img.s3Key,
								existingCount + index
							)
						)
					)
				}
			} else {
				// Create new scenario
				const result = await createScenario({
					strategyId,
					name: formData.name.trim(),
					description: formData.description.trim() || undefined,
					sortOrder: 0,
				})

				if (result.status !== "success" || !result.data) {
					setError(result.message)
					return
				}

				const newScenarioId = result.data.id

				// Upload pending images for the new scenario
				if (pendingImages.length > 0) {
					const { uploaded, errors } = await uploadFiles({
						pendingImages,
						path: "scenarios",
						entityId: newScenarioId,
					})

					if (errors.length > 0) {
						setError(errors.join(", "))
						return
					}

					// Link uploaded images to the new scenario in parallel
					await Promise.all(
						uploaded.map((img, index) =>
							addScenarioImage(newScenarioId, img.url, img.s3Key, index)
						)
					)
				}
			}

			onOpenChange(false)
			onSuccess?.()
		})
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="scenario-form-dialog" className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? t("editScenario") : t("addScenario")}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? t("editScenarioDescription")
							: t("addScenarioDescription")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="text-small text-fb-error bg-fb-error/10 p-s-300 rounded-md">
							{error}
						</div>
					)}

					{/* Name */}
					<div className="space-y-s-200">
						<Label id="label-scenario-name" htmlFor="scenarioName" required filled={!!formData.name.trim()}>
							{t("name")}
						</Label>
						<Input
							id="scenarioName"
							placeholder={t("namePlaceholder")}
							value={formData.name}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, name: e.target.value }))
							}
							maxLength={200}
							required
						/>
					</div>

					{/* Description */}
					<div className="space-y-s-200">
						<Label
							id="label-scenario-description"
							htmlFor="scenarioDescription"
						>
							{t("description")}
						</Label>
						<Textarea
							id="scenarioDescription"
							placeholder={t("descriptionPlaceholder")}
							value={formData.description}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									description: e.target.value,
								}))
							}
							maxLength={2000}
							rows={3}
						/>
					</div>

					{/* Images */}
					<div className="space-y-s-200">
						<Label id="label-scenario-images">{t("images")}</Label>
						<p className="text-tiny text-txt-300">{t("imagesHint")}</p>
						<ImageUpload
							persistedImages={persistedImages}
							pendingImages={pendingImages}
							onFileAdd={handleFileAdd}
							onPendingRemove={handlePendingRemove}
							onPersistedRemove={handlePersistedRemove}
							maxImages={3}
						/>
					</div>

					<DialogFooter>
						<Button
							id="scenario-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="scenario-form-submit"
							type="submit"
							disabled={isPending}
						>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
							{isEdit ? tCommon("saveChanges") : t("createScenario")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

export { ScenarioForm }
