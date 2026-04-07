"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Search, X, Plus, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { QuickFilters } from "./quick-filters"

// ============================================================================
// TYPES
// ============================================================================

type FilterField = "asset" | "direction" | "outcome" | "rating" | "followedPlan" | "timeOfDay" | "pnl"
type FilterOperator = "is" | "isNot" | "isAtLeast" | "greaterThan" | "lessThan" | "between"

interface FilterCondition {
	id: string
	field: FilterField
	operator: FilterOperator
	value: string
}

interface SmartSearchProps {
	availableAssets: string[]
	onFiltersChange: (filters: Record<string, string | string[]>) => void
	onClear: () => void
	activeFilterCount: number
	activeQuickFilterKey?: string
	onQuickFilterChange?: (key: string | null) => void
}

// ============================================================================
// FIELD CONFIGS
// ============================================================================

interface FieldConfig {
	key: FilterField
	operators: FilterOperator[]
	values?: Array<{ value: string; labelKey: string }>
	inputType?: "text" | "number" | "select"
}

const FIELD_CONFIGS: FieldConfig[] = [
	{
		key: "outcome",
		operators: ["is"],
		values: [
			{ value: "win", labelKey: "win" },
			{ value: "loss", labelKey: "loss" },
			{ value: "breakeven", labelKey: "breakeven" },
		],
		inputType: "select",
	},
	{
		key: "direction",
		operators: ["is"],
		values: [
			{ value: "long", labelKey: "long" },
			{ value: "short", labelKey: "short" },
		],
		inputType: "select",
	},
	{
		key: "rating",
		operators: ["is", "isAtLeast"],
		values: [
			{ value: "A", labelKey: "A" },
			{ value: "B", labelKey: "B" },
			{ value: "C", labelKey: "C" },
			{ value: "D", labelKey: "D" },
			{ value: "F", labelKey: "F" },
		],
		inputType: "select",
	},
	{
		key: "followedPlan",
		operators: ["is"],
		values: [
			{ value: "true", labelKey: "yes" },
			{ value: "false", labelKey: "no" },
		],
		inputType: "select",
	},
	{
		key: "pnl",
		operators: ["greaterThan", "lessThan"],
		inputType: "number",
	},
	{
		key: "timeOfDay",
		operators: ["between"],
		inputType: "number",
	},
]

// ============================================================================
// HELPERS
// ============================================================================

const RATING_ORDER = ["A", "B", "C", "D", "F"]

/** Convert conditions to the filter params format expected by the journal */
const conditionsToParams = (conditions: FilterCondition[]): Record<string, string | string[]> => {
	const params: Record<string, string | string[]> = {}

	for (const condition of conditions) {
		switch (condition.field) {
			case "outcome":
				params.outcomes = [...(params.outcomes as string[] ?? []), condition.value]
				break
			case "direction":
				params.directions = [...(params.directions as string[] ?? []), condition.value]
				break
			case "rating":
				if (condition.operator === "isAtLeast") {
					const idx = RATING_ORDER.indexOf(condition.value)
					params.rating = RATING_ORDER.slice(0, idx + 1)
				} else {
					params.rating = [...(params.rating as string[] ?? []), condition.value]
				}
				break
			case "followedPlan":
				params.followedPlan = condition.value
				break
			case "pnl":
				if (condition.operator === "greaterThan") {
					params.pnlMin = condition.value
				} else {
					params.pnlMax = condition.value
				}
				break
			case "timeOfDay": {
				const [from, to] = condition.value.split("-")
				if (from) params.hourFrom = from
				if (to) params.hourTo = to
				break
			}
			case "asset":
				params.assets = [...(params.assets as string[] ?? []), condition.value]
				break
		}
	}

	return params
}

// ============================================================================
// COMPONENT
// ============================================================================

const SmartSearch = ({
	availableAssets,
	onFiltersChange,
	onClear,
	activeFilterCount,
	activeQuickFilterKey,
	onQuickFilterChange,
}: SmartSearchProps) => {
	const t = useTranslations("journal.smartSearch")
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")

	/** Translate select option labels based on field type */
	const translateLabel = (field: FilterField, labelKey: string): string => {
		if (field === "outcome") return tTrade(`outcome.${labelKey}`)
		if (field === "direction") return tTrade(`direction.${labelKey}`)
		if (field === "followedPlan") return labelKey === "yes" ? tCommon("yes") : tCommon("no")
		return labelKey
	}

	const [isOpen, setIsOpen] = useState(false)
	const [conditions, setConditions] = useState<FilterCondition[]>([])

	// New condition form state
	const [newField, setNewField] = useState<FilterField | "">("")
	const [newOperator, setNewOperator] = useState<FilterOperator | "">("")
	const [newValue, setNewValue] = useState("")

	const handleQuickFilterApply = (params: Record<string, string | string[]>, key: string) => {
		setConditions([])
		onFiltersChange(params)
		onQuickFilterChange?.(key)
	}

	const handleQuickFilterClear = () => {
		onQuickFilterChange?.(null)
		onClear()
	}

	const handleAddCondition = () => {
		if (!newField || !newOperator || !newValue) return

		const condition: FilterCondition = {
			id: `${newField}-${Date.now()}`,
			field: newField,
			operator: newOperator,
			value: newValue,
		}

		const updated = [...conditions, condition]
		setConditions(updated)
		onQuickFilterChange?.(null)

		// Apply all conditions
		onFiltersChange(conditionsToParams(updated))

		// Reset form
		setNewField("")
		setNewOperator("")
		setNewValue("")
	}

	const handleRemoveCondition = (id: string) => {
		const updated = conditions.filter((c) => c.id !== id)
		setConditions(updated)

		if (updated.length === 0) {
			onClear()
		} else {
			onFiltersChange(conditionsToParams(updated))
		}
	}

	const handleClearAll = () => {
		setConditions([])
		onQuickFilterChange?.(null)
		onClear()
	}

	const selectedFieldConfig = FIELD_CONFIGS.find((f) => f.key === newField)

	return (
		<div className="space-y-s-200">
			{/* Toggle button */}
			<button
				type="button"
				tabIndex={0}
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-s-200 rounded-md border px-s-300 py-s-100 text-tiny font-medium transition-colors",
					isOpen || activeFilterCount > 0
						? "border-acc-100/30 bg-acc-100/5 text-acc-100"
						: "border-bg-300 text-txt-300 hover:border-txt-300 hover:text-txt-200"
				)}
				aria-expanded={isOpen}
				aria-label={t("toggle")}
			>
				<Search className="h-3.5 w-3.5" />
				{t("toggle")}
				{activeFilterCount > 0 && (
					<span className="bg-acc-100 text-micro text-bg-100 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold">
						{activeFilterCount}
					</span>
				)}
			</button>

			{/* Expanded panel */}
			{isOpen && (
				<div className="space-y-s-300 rounded-lg border border-bg-300 bg-bg-200 p-s-300">
					{/* Quick Filters */}
					<div>
						<p className="mb-s-200 text-tiny font-medium text-txt-300">
							{t("quickFilters")}
						</p>
						<QuickFilters
							activeFilterKey={activeQuickFilterKey ?? null}
							onApply={handleQuickFilterApply}
							onClear={handleQuickFilterClear}
						/>
					</div>

					{/* Active conditions as chips */}
					{conditions.length > 0 && (
						<div className="flex flex-wrap gap-s-200">
							{conditions.map((condition) => (
								<span
									key={condition.id}
									className="flex items-center gap-s-100 rounded-full border border-acc-100/30 bg-acc-100/10 px-s-200 py-s-100 text-tiny text-acc-100"
								>
									{t(`fields.${condition.field}`)} {t(`operators.${condition.operator}`)} {condition.value}
									<button
										type="button"
										tabIndex={0}
										onClick={() => handleRemoveCondition(condition.id)}
										className="rounded-full p-0.5 hover:bg-acc-100/20"
										aria-label={`${t("clearAll")} ${t(`fields.${condition.field}`)}`}
									>
										<X className="h-2.5 w-2.5" />
									</button>
								</span>
							))}
							<button
								type="button"
								tabIndex={0}
								onClick={handleClearAll}
								className="text-tiny text-txt-300 hover:text-txt-100 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-acc-100"
							>
								{t("clearAll")}
							</button>
						</div>
					)}

					{/* Filter Builder */}
					<div>
						<div className="mb-s-200 flex items-center gap-s-200">
							<p className="text-tiny font-medium text-txt-300">
								{t("builder")}
							</p>
							<div className="group relative">
								<Info
									className="h-3.5 w-3.5 cursor-help text-txt-300 hover:text-txt-200"
									aria-label={t("builderHint")}
								/>
								<div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-bg-300 bg-bg-100 p-s-300 text-tiny text-txt-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
									{t("builderHint")}
								</div>
							</div>
						</div>
						<div className="flex flex-col gap-s-200 sm:flex-row sm:flex-wrap sm:items-end">
							{/* Field selector */}
							<Select
								value={newField}
								onValueChange={(val) => {
									setNewField(val as FilterField)
									setNewOperator("")
									setNewValue("")
								}}
							>
								<SelectTrigger id="smart-search-field" className="h-8 w-32 text-tiny">
									<SelectValue placeholder={t("field")} />
								</SelectTrigger>
								<SelectContent>
									{FIELD_CONFIGS.map((field) => (
										<SelectItem key={field.key} value={field.key}>
											{t(`fields.${field.key}`)}
										</SelectItem>
									))}
									{availableAssets.length > 0 && (
										<SelectItem value="asset">
											{t("fields.asset")}
										</SelectItem>
									)}
								</SelectContent>
							</Select>

							{/* Operator selector */}
							{selectedFieldConfig && (
								<Select
									value={newOperator}
									onValueChange={(val) => setNewOperator(val as FilterOperator)}
								>
									<SelectTrigger id="smart-search-operator" className="h-8 w-28 text-tiny">
										<SelectValue placeholder={t("operator")} />
									</SelectTrigger>
									<SelectContent>
										{selectedFieldConfig.operators.map((op) => (
											<SelectItem key={op} value={op}>
												{t(`operators.${op}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}

							{/* Value input */}
							{newOperator && selectedFieldConfig && (
								<>
									{selectedFieldConfig.inputType === "select" && selectedFieldConfig.values ? (
										<Select value={newValue} onValueChange={setNewValue}>
											<SelectTrigger id="smart-search-value" className="h-8 w-28 text-tiny">
												<SelectValue placeholder={t("value")} />
											</SelectTrigger>
											<SelectContent>
												{selectedFieldConfig.values.map((v) => (
													<SelectItem key={v.value} value={v.value}>
														{newField ? translateLabel(newField, v.labelKey) : v.labelKey}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : newField === "asset" ? (
										<Select value={newValue} onValueChange={setNewValue}>
											<SelectTrigger id="smart-search-asset-value" className="h-8 w-28 text-tiny">
												<SelectValue placeholder={t("value")} />
											</SelectTrigger>
											<SelectContent>
												{availableAssets.map((asset) => (
													<SelectItem key={asset} value={asset}>
														{asset}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : newField === "timeOfDay" ? (
										<div className="flex items-center gap-s-100">
											<Input
												id="smart-search-hour-from"
												aria-label={t("hourFrom")}
												type="number"
												min={0}
												max={23}
												placeholder="9"
												className="h-8 w-16 text-tiny"
												value={newValue.split("-")[0] || ""}
												onChange={(e) => {
													const to = newValue.split("-")[1] || ""
													setNewValue(`${e.target.value}-${to}`)
												}}
											/>
											<span className="text-tiny text-txt-300">—</span>
											<Input
												id="smart-search-hour-to"
												aria-label={t("hourTo")}
												type="number"
												min={0}
												max={23}
												placeholder="12"
												className="h-8 w-16 text-tiny"
												value={newValue.split("-")[1] || ""}
												onChange={(e) => {
													const from = newValue.split("-")[0] || ""
													setNewValue(`${from}-${e.target.value}`)
												}}
											/>
										</div>
									) : (
										<Input
											id="smart-search-number-value"
											type="number"
											placeholder={t("value")}
											className="h-8 w-28 text-tiny"
											value={newValue}
											onChange={(e) => setNewValue(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") handleAddCondition()
											}}
										/>
									)}
								</>
							)}

							{/* Add button */}
							{newField && newOperator && newValue && (
								<Button
									id="smart-search-add-btn"
									variant="ghost"
									size="sm"
									className="h-8 px-s-200"
									onClick={handleAddCondition}
								>
									<Plus className="mr-1 h-3 w-3" />
									{t("addCondition")}
								</Button>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export { SmartSearch, conditionsToParams, RATING_ORDER, type FilterCondition, type FilterField, type FilterOperator }
