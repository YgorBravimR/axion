"use client"

import { useState, useTransition, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TagForm } from "./tag-form"
import { getTags, deleteTag } from "@/app/actions/tags"
import { useUrlParams } from "@/hooks/use-url-params"
import type { Tag } from "@/db/schema"
import type { TagType } from "@/types"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
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

export const TagList = () => {
	const t = useTranslations("settings.tags")
	const tCommon = useTranslations("common")
	const urlParams = useUrlParams()
	const filterType = (urlParams.get("tagType") ?? "all") as "all" | TagType
	const setFilterType = (value: "all" | TagType) => {
		urlParams.set({ tagType: value === "all" ? null : value })
	}

	const [tags, setTags] = useState<Tag[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [formOpen, setFormOpen] = useState(false)
	const [editingTag, setEditingTag] = useState<Tag | null>(null)
	const [isPending, startTransition] = useTransition()
	const [deletingId, setDeletingId] = useState<string | null>(null)

	const loadTags = useCallback(async () => {
		setIsLoading(true)
		const result = await getTags()
		if (result.status === "success" && result.data) {
			setTags(result.data)
		}
		setIsLoading(false)
	}, [])

	useEffect(() => {
		let mounted = true
		loadTags()
		return () => { mounted = false }
	}, [loadTags])

	const { tagCounts, filteredTags } = useMemo(() => {
		const counts = { all: 0, setup: 0, mistake: 0, general: 0 }
		const filtered: Tag[] = []

		for (const tag of tags) {
			counts.all++
			if (tag.type === "setup") counts.setup++
			else if (tag.type === "mistake") counts.mistake++
			else counts.general++

			if (filterType === "all" || tag.type === filterType) {
				filtered.push(tag)
			}
		}

		return { tagCounts: counts, filteredTags: filtered }
	}, [tags, filterType])

	const handleEdit = (tag: Tag) => {
		setEditingTag(tag)
		setFormOpen(true)
	}

	const handleDelete = (tagId: string) => {
		setDeletingId(tagId)
		startTransition(async () => {
			await deleteTag(tagId)
			await loadTags()
			setDeletingId(null)
		})
	}

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingTag(null)
	}

	const handleFormSuccess = () => {
		handleFormClose()
		loadTags()
	}

	const handleAddNew = () => {
		setEditingTag(null)
		setFormOpen(true)
	}

	const getTypeColor = (type: string): string => {
		switch (type) {
			case "setup":
				return "text-action-buy"
			case "mistake":
				return "text-fb-error"
			default:
				return "text-txt-200"
		}
	}

	const getTypeLabel = (type: string): string => {
		switch (type) {
			case "setup":
				return t("typeSetup")
			case "mistake":
				return t("typeMistake")
			default:
				return t("typeGeneral")
		}
	}

	if (isLoading) {
		return (
			<div className="p-l-700 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-6 w-6 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	return (
		<div id="settings-tags" className="space-y-m-400">
			{/* Header */}
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<div className="gap-s-300 flex items-center">
					<Badge
						id="badge-tag-filter-all"
						variant={filterType === "all" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "all"}
						onClick={() => setFilterType("all")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("all")
						}}
					>
						{tCommon("all")} ({tagCounts.all})
					</Badge>
					<Badge
						id="badge-tag-filter-setup"
						variant={filterType === "setup" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "setup"}
						onClick={() => setFilterType("setup")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("setup")
						}}
					>
						{t("typeSetup")} ({tagCounts.setup})
					</Badge>
					<Badge
						id="badge-tag-filter-mistake"
						variant={filterType === "mistake" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "mistake"}
						onClick={() => setFilterType("mistake")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("mistake")
						}}
					>
						{t("typeMistake")} ({tagCounts.mistake})
					</Badge>
					<Badge
						id="badge-tag-filter-general"
						variant={filterType === "general" ? "default" : "outline"}
						className="cursor-pointer"
						tabIndex={0}
						role="button"
						aria-pressed={filterType === "general"}
						onClick={() => setFilterType("general")}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") setFilterType("general")
						}}
					>
						{t("typeGeneral")} ({tagCounts.general})
					</Badge>
				</div>
				<Button id="tag-add-new" onClick={handleAddNew}>
					<Plus className="mr-2 h-4 w-4" />
					{t("addTag")}
				</Button>
			</div>

			{/* Tags Grid */}
			<div className="gap-s-300 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
				{filteredTags.length === 0 ? (
					<div className="border-bg-300 bg-bg-200 p-l-700 text-txt-300 col-span-full rounded-lg border text-center">
						{tags.length === 0 ? t("noTags") : t("noTagsInFilter")}
					</div>
				) : (
					filteredTags.map((tag) => (
						<div
							key={tag.id}
							className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border transition-colors"
						>
							<div className="flex items-start justify-between">
								<div className="gap-s-300 flex items-center">
									<div
										className="h-3 w-3 shrink-0 rounded-full"
										style={{ backgroundColor: tag.color ?? "#6B7280" }}
										aria-hidden="true"
									/>
									<div>
										<p className="text-body text-txt-100 font-medium">
											{tag.name}
										</p>
										<span
											className={cn("text-caption", getTypeColor(tag.type))}
										>
											{getTypeLabel(tag.type)}
										</span>
									</div>
								</div>
								<div className="gap-s-100 flex items-center">
									{isPending && deletingId === tag.id ? (
										<Loader2 className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none" />
									) : (
										<>
											<Button
												id={`tag-edit-${tag.id}`}
												variant="ghost"
												size="sm"
												onClick={() => handleEdit(tag)}
												className="h-8 w-8 p-0"
												aria-label={`${tCommon("edit")} ${tag.name}`}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														id={`tag-delete-${tag.id}`}
														variant="ghost"
														size="sm"
														className="text-fb-error hover:text-fb-error h-8 w-8 p-0"
														aria-label={`${tCommon("delete")} ${tag.name}`}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															{t("deleteTitle")}
														</AlertDialogTitle>
														<AlertDialogDescription>
															{t("deleteDescription", { name: tag.name })}
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel
															id={`tag-delete-cancel-${tag.id}`}
														>
															{tCommon("cancel")}
														</AlertDialogCancel>
														<AlertDialogAction
															id={`tag-delete-confirm-${tag.id}`}
															className="bg-fb-error hover:bg-fb-error/90"
															onClick={() => handleDelete(tag.id)}
														>
															{tCommon("delete")}
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</>
									)}
								</div>
							</div>
							{tag.description && (
								<p className="mt-s-200 text-small text-txt-300">
									{tag.description}
								</p>
							)}
						</div>
					))
				)}
			</div>

			{/* Tag Form Dialog */}
			<TagForm
				tag={editingTag}
				open={formOpen}
				onOpenChange={handleFormClose}
				onSuccess={handleFormSuccess}
			/>
		</div>
	)
}
