"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { getConditions } from "@/app/actions/trading-conditions"
import { ConditionForm } from "@/components/settings/condition-form"
import type { TradingCondition } from "@/db/schema"
import type {
	ConditionTier,
	StrategyConditionInput,
} from "@/types/trading-condition"
import { Plus, Loader2, Shield, ShieldCheck, ShieldPlus } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConditionPickerProps {
	value: StrategyConditionInput[]
	onChange: (conditions: StrategyConditionInput[]) => void
}

const CATEGORY_ORDER = [
	"indicator",
	"price_action",
	"market_context",
	"custom",
] as const

const getCategoryColor = (category: string): string => {
	switch (category) {
		case "indicator":
			return "text-acc-100"
		case "price_action":
			return "text-trade-buy"
		case "market_context":
			return "text-warning"
		case "custom":
			return "text-txt-200"
		default:
			return "text-txt-300"
	}
}

const TIER_OPTIONS: {
	value: ConditionTier | "none"
	label: string
	icon: typeof Shield
}[] = [
	{ value: "none", label: "Not included", icon: Shield },
	{ value: "mandatory", label: "Mandatory (A)", icon: Shield },
	{ value: "tier_2", label: "Tier 2 (AA)", icon: ShieldCheck },
	{ value: "tier_3", label: "Tier 3 (AAA)", icon: ShieldPlus },
]

export const ConditionPicker = ({ value, onChange }: ConditionPickerProps) => {
	const t = useTranslations("playbook.conditions")
	const tSettings = useTranslations("settings.conditions")
	const [conditions, setConditions] = useState<TradingCondition[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [showCreateForm, setShowCreateForm] = useState(false)

	const loadConditions = async () => {
		setIsLoading(true)
		const result = await getConditions()
		if (result.status === "success" && result.data) {
			setConditions(result.data)
		}
		setIsLoading(false)
	}

	useEffect(() => {
		loadConditions()
	}, [])

	const getConditionTier = (conditionId: string): ConditionTier | "none" => {
		const found = value.find((c) => c.conditionId === conditionId)
		return found?.tier ?? "none"
	}

	const handleTierChange = (conditionId: string, tier: string) => {
		if (tier === "none") {
			onChange(value.filter((c) => c.conditionId !== conditionId))
			return
		}

		const existing = value.find((c) => c.conditionId === conditionId)
		if (existing) {
			onChange(
				value.map((c) =>
					c.conditionId === conditionId
						? { ...c, tier: tier as ConditionTier }
						: c
				)
			)
		} else {
			onChange([
				...value,
				{
					conditionId,
					tier: tier as ConditionTier,
					sortOrder: value.length,
				},
			])
		}
	}

	const handleCreateSuccess = () => {
		setShowCreateForm(false)
		loadConditions()
	}

	// Group conditions by category
	const grouped = CATEGORY_ORDER.map((category) => ({
		category,
		items: conditions.filter((c) => c.category === category),
	})).filter((group) => group.items.length > 0)

	// Rank preview counts
	const mandatoryCount = value.filter((c) => c.tier === "mandatory").length
	const tier2Count = value.filter((c) => c.tier === "tier_2").length
	const tier3Count = value.filter((c) => c.tier === "tier_3").length

	if (isLoading) {
		return (
			<div className="p-s-300 sm:p-m-400 lg:p-m-500 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-m-400">
			{/* Rank preview */}
			{value.length > 0 && (
				<div className="gap-s-300 flex items-center">
					<span className="text-small text-txt-200">{t("rankPreview")}:</span>
					{mandatoryCount > 0 && (
						<Badge
							id="rank-a-badge"
							variant="outline"
							className="text-trade-buy border-trade-buy/40"
						>
							A ({mandatoryCount})
						</Badge>
					)}
					{tier2Count > 0 && (
						<Badge
							id="rank-aa-badge"
							variant="outline"
							className="text-acc-100 border-acc-100/40"
						>
							AA ({tier2Count})
						</Badge>
					)}
					{tier3Count > 0 && (
						<Badge
							id="rank-aaa-badge"
							variant="outline"
							className="border-warning/40 text-warning"
						>
							AAA ({tier3Count})
						</Badge>
					)}
				</div>
			)}

			{/* Conditions by category */}
			{conditions.length === 0 ? (
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border text-center">
					<p className="text-small text-txt-300">{t("noConditionsYet")}</p>
					<Button
						id="condition-picker-create-first"
						type="button"
						variant="outline"
						size="sm"
						className="mt-s-300"
						onClick={() => setShowCreateForm(true)}
					>
						<Plus className="mr-2 h-4 w-4" />
						{t("createFirst")}
					</Button>
				</div>
			) : (
				<>
					{grouped.map((group) => (
						<div key={group.category}>
							<h4
								className={cn(
									"text-small mb-s-200 font-medium",
									getCategoryColor(group.category)
								)}
							>
								{tSettings(
									`category${group.category.charAt(0).toUpperCase()}${group.category.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`
								)}
							</h4>
							<div className="space-y-s-200">
								{group.items.map((condition) => {
									const currentTier = getConditionTier(condition.id)
									return (
										<div
											key={condition.id}
											className={cn(
												"border-bg-300 bg-bg-200 gap-m-400 p-s-300 flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border transition-colors",
												currentTier !== "none" &&
													"border-acc-100/30 bg-acc-100/5"
											)}
										>
											<div className="min-w-0 flex-1">
												<p className="text-small text-txt-100 font-medium">
													{condition.name}
												</p>
												{condition.description && (
													<p className="text-tiny text-txt-300 line-clamp-1">
														{condition.description}
													</p>
												)}
											</div>
											<Select
												value={currentTier}
												onValueChange={(v) => handleTierChange(condition.id, v)}
											>
												<SelectTrigger
													id={`condition-tier-${condition.id}`}
													className="w-full sm:w-[160px]"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{TIER_OPTIONS.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)
								})}
							</div>
						</div>
					))}

					<Button
						id="condition-picker-create-new"
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setShowCreateForm(true)}
					>
						<Plus className="mr-2 h-4 w-4" />
						{t("createNew")}
					</Button>
				</>
			)}

			<ConditionForm
				open={showCreateForm}
				onOpenChange={setShowCreateForm}
				onSuccess={handleCreateSuccess}
			/>
		</div>
	)
}
