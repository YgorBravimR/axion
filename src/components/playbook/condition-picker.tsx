"use client"

import { useState, useMemo } from "react"
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
import { ConditionForm } from "@/components/settings/condition-form"
import { ConditionList } from "@/components/playbook/condition-list"
import type {
	ConditionTier,
	StrategyConditionInput,
} from "@/types/trading-condition"
import { Plus, Shield, ShieldCheck, ShieldPlus } from "lucide-react"

interface ConditionPickerProps {
	value: StrategyConditionInput[]
	onChange: (_conditions: StrategyConditionInput[]) => void
}

export const ConditionPicker = ({ value, onChange }: ConditionPickerProps) => {
	const t = useTranslations("playbook.conditions")
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [reloadKey, setReloadKey] = useState(0)

	const TIER_OPTIONS: {
		value: ConditionTier | "none"
		label: string
		icon: typeof Shield
	}[] = [
		{ value: "none", label: t("tierNone"), icon: Shield },
		{ value: "mandatory", label: t("tierMandatory"), icon: Shield },
		{ value: "tier_2", label: t("tierTier2"), icon: ShieldCheck },
		{ value: "tier_3", label: t("tierTier3"), icon: ShieldPlus },
	]

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

	const { mandatoryCount, tier2Count, tier3Count } = useMemo(() => {
		let mandatory = 0
		let t2 = 0
		let t3 = 0
		for (const c of value) {
			if (c.tier === "mandatory") {
				mandatory++
			} else if (c.tier === "tier_2") {
				t2++
			} else if (c.tier === "tier_3") {
				t3++
			}
		}
		return { mandatoryCount: mandatory, tier2Count: t2, tier3Count: t3 }
	}, [value])

	const handleCreateSuccess = () => {
		setShowCreateForm(false)
		setReloadKey((k) => k + 1)
	}

	const rankPreview =
		value.length > 0 ? (
			<div className="gap-s-300 flex items-center">
				<span className="text-small text-txt-200">{t("rankPreview")}:</span>
				{mandatoryCount > 0 && (
					<Badge
						id="rank-a-badge"
						variant="outline"
						className="text-txt-200 border-bg-300"
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
		) : null

	const createNewButton = (
		<Button
			id="condition-picker-create-new"
			type="button"
			variant="outline"
			size="sm"
			onClick={() => setShowCreateForm(true)}
		>
			<Plus className="mr-s-200 h-4 w-4" />
			{t("createNew")}
		</Button>
	)

	const emptyState = (
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
				<Plus className="mr-s-200 h-4 w-4" />
				{t("createFirst")}
			</Button>
		</div>
	)

	return (
		<>
			<ConditionList
				key={reloadKey}
				header={rankPreview}
				emptyState={emptyState}
				footer={createNewButton}
				renderRowControl={(condition) => {
					const currentTier = getConditionTier(condition.id)
					return (
						<Select
							value={currentTier}
							onValueChange={(v) => handleTierChange(condition.id, v)}
						>
							<SelectTrigger
								id={`condition-tier-${condition.id}`}
								className="w-full min-w-0 sm:w-[160px]"
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
					)
				}}
			/>

			<ConditionForm
				open={showCreateForm}
				onOpenChange={setShowCreateForm}
				onSuccess={handleCreateSuccess}
			/>
		</>
	)
}
