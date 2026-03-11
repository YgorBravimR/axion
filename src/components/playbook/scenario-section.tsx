"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ScenarioForm } from "./scenario-form"
import {
	getScenariosByStrategy,
	deleteScenario,
	type ScenarioWithImages,
} from "@/app/actions/scenarios"
import {
	ChevronDown,
	ChevronUp,
	Plus,
	Pencil,
	Trash2,
	ImageIcon,
	Loader2,
	X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ScenarioSectionProps {
	strategyId: string
	readOnly?: boolean
}

export const ScenarioSection = ({
	strategyId,
	readOnly = false,
}: ScenarioSectionProps) => {
	const t = useTranslations("playbook.scenarios")
	const tCommon = useTranslations("common")
	const [scenarios, setScenarios] = useState<ScenarioWithImages[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const [formOpen, setFormOpen] = useState(false)
	const [editingScenario, setEditingScenario] =
		useState<ScenarioWithImages | null>(null)
	const [lightboxImage, setLightboxImage] = useState<string | null>(null)

	const loadScenarios = async () => {
		setIsLoading(true)
		const result = await getScenariosByStrategy(strategyId)
		if (result.status === "success" && result.data) {
			setScenarios(result.data)
		}
		setIsLoading(false)
	}

	useEffect(() => {
		loadScenarios()
	}, [strategyId])

	const handleToggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}

	const handleAddNew = () => {
		setEditingScenario(null)
		setFormOpen(true)
	}

	const handleEdit = (scenario: ScenarioWithImages) => {
		setEditingScenario(scenario)
		setFormOpen(true)
	}

	const handleDelete = async (id: string) => {
		await deleteScenario(id)
		loadScenarios()
	}

	const handleFormSuccess = () => {
		setFormOpen(false)
		setEditingScenario(null)
		loadScenarios()
	}

	if (isLoading) {
		return (
			<div className="p-s-300 sm:p-m-400 lg:p-m-500 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-s-300">
			{scenarios.length === 0 ? (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border text-center">
					<ImageIcon className="text-txt-300 mb-s-200 mx-auto h-8 w-8" />
					<p className="text-small text-txt-300">{t("noScenarios")}</p>
				</div>
			) : (
				scenarios.map((scenario) => {
					const isExpanded = expandedIds.has(scenario.id)
					return (
						<div
							key={scenario.id}
							className="border-bg-300 bg-bg-200 overflow-hidden rounded-lg border"
						>
							{/* Scenario header — click to expand */}
							<button
								type="button"
								className="hover:bg-bg-300/50 p-s-300 sm:p-m-400 flex w-full items-center justify-between text-left transition-colors"
								onClick={() => handleToggleExpand(scenario.id)}
								aria-expanded={isExpanded}
							>
								<div className="gap-s-200 flex items-center">
									<span className="text-small text-txt-100 font-medium">
										{scenario.name}
									</span>
									{scenario.images.length > 0 && (
										<span className="text-tiny text-txt-300">
											({scenario.images.length}{" "}
											{scenario.images.length === 1 ? "image" : "images"})
										</span>
									)}
								</div>
								{isExpanded ? (
									<ChevronUp className="text-txt-300 h-4 w-4" />
								) : (
									<ChevronDown className="text-txt-300 h-4 w-4" />
								)}
							</button>

							{/* Expanded content */}
							{isExpanded && (
								<div className="border-bg-300 p-s-300 sm:p-m-400 border-t">
									{scenario.description && (
										<p className="text-small text-txt-200 mb-m-400 whitespace-pre-wrap">
											{scenario.description}
										</p>
									)}

									{/* Image gallery */}
									{scenario.images.length > 0 && (
										<div className="gap-s-200 sm:gap-s-300 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
											{scenario.images.map((img) => (
												<button
													key={img.id}
													type="button"
													className="overflow-hidden rounded-lg transition-transform hover:scale-[1.02]"
													onClick={() => setLightboxImage(img.url)}
													aria-label={tCommon("viewImage")}
												>
													<img
														src={img.url}
														alt=""
														className="aspect-video w-full object-cover"
													/>
												</button>
											))}
										</div>
									)}

									{/* Edit/Delete actions */}
									{!readOnly && (
										<div className="mt-m-400 gap-s-200 flex items-center">
											<Button
												id={`scenario-edit-${scenario.id}`}
												type="button"
												variant="outline"
												size="sm"
												onClick={() => handleEdit(scenario)}
											>
												<Pencil className="mr-2 h-3 w-3" />
												{tCommon("edit")}
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														id={`scenario-delete-${scenario.id}`}
														type="button"
														variant="outline"
														size="sm"
														className="text-fb-error hover:text-fb-error"
													>
														<Trash2 className="mr-2 h-3 w-3" />
														{tCommon("delete")}
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															{t("deleteTitle")}
														</AlertDialogTitle>
														<AlertDialogDescription>
															{t("deleteDescription", { name: scenario.name })}
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel
															id={`scenario-delete-cancel-${scenario.id}`}
														>
															{tCommon("cancel")}
														</AlertDialogCancel>
														<AlertDialogAction
															id={`scenario-delete-confirm-${scenario.id}`}
															className="bg-fb-error hover:bg-fb-error/90"
															onClick={() => handleDelete(scenario.id)}
														>
															{tCommon("delete")}
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									)}
								</div>
							)}
						</div>
					)
				})
			)}

			{/* Add scenario button */}
			{!readOnly && (
				<Button
					id="scenario-add-new"
					type="button"
					variant="outline"
					size="sm"
					onClick={handleAddNew}
				>
					<Plus className="mr-2 h-4 w-4" />
					{t("addScenario")}
				</Button>
			)}

			{/* Scenario form dialog */}
			<ScenarioForm
				strategyId={strategyId}
				scenario={editingScenario}
				open={formOpen}
				onOpenChange={(open) => {
					setFormOpen(open)
					if (!open) setEditingScenario(null)
				}}
				onSuccess={handleFormSuccess}
			/>

			{/* Lightbox overlay */}
			{lightboxImage && (
				<div
					className="p-m-400 sm:p-m-500 lg:p-m-600 fixed inset-0 z-50 flex items-center justify-center bg-black/80"
					onClick={() => setLightboxImage(null)}
					role="dialog"
					aria-modal="true"
					aria-label={tCommon("imagePreview")}
				>
					<Button
						id="lightbox-close"
						variant="ghost"
						size="sm"
						className="absolute top-4 right-4 text-white hover:text-white/80"
						onClick={() => setLightboxImage(null)}
						aria-label={tCommon("closePreview")}
					>
						<X className="h-6 w-6" />
					</Button>
					<img
						src={lightboxImage}
						alt=""
						className="max-h-[85dvh] max-w-[90dvw] rounded-lg object-contain"
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			)}
		</div>
	)
}
