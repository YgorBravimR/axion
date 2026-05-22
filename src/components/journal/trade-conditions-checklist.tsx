"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Shield, ShieldCheck, ShieldPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { getStrategyConditions } from "@/app/actions/strategy-conditions"
import { ConditionList } from "@/components/playbook/condition-list"
import type { ConditionTier } from "@/types/trading-condition"
import { cn } from "@/lib/utils"

interface TradeConditionsChecklistProps {
	strategyId: string
	value: { conditionId: string; met: boolean }[]
	onChange: (_next: { conditionId: string; met: boolean }[]) => void
}

const TIER_ICON: Record<ConditionTier, typeof Shield> = {
	mandatory: Shield,
	tier_2: ShieldCheck,
	tier_3: ShieldPlus,
}

const TIER_BADGE_CLASS: Record<ConditionTier, string> = {
	mandatory: "text-trade-buy border-trade-buy/40",
	tier_2: "text-acc-100 border-acc-100/40",
	tier_3: "border-warning/40 text-warning",
}

export const TradeConditionsChecklist = ({
	strategyId,
	value,
	onChange,
}: TradeConditionsChecklistProps) => {
	const t = useTranslations("journal.tradeConditions")
	const [tierByConditionId, setTierByConditionId] = useState<
		Map<string, ConditionTier>
	>(new Map())
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		const run = async () => {
			setIsLoading(true)
			const result = await getStrategyConditions(strategyId)
			if (cancelled) {
				return
			}
			if (result.status === "success" && result.data) {
				const m = new Map<string, ConditionTier>()
				for (const row of result.data) {
					m.set(row.conditionId, row.tier)
				}
				setTierByConditionId(m)
			}
			setIsLoading(false)
		}
		void run()
		return () => {
			cancelled = true
		}
	}, [strategyId])

	const filterIds = useMemo(
		() => Array.from(tierByConditionId.keys()),
		[tierByConditionId]
	)

	const metCount = useMemo(() => value.filter((v) => v.met).length, [value])
	const totalCount = filterIds.length

	const isMet = (conditionId: string): boolean => {
		const found = value.find((v) => v.conditionId === conditionId)
		return found?.met ?? false
	}

	const handleToggle = (conditionId: string, next: boolean) => {
		const existing = value.find((v) => v.conditionId === conditionId)
		if (existing) {
			onChange(
				value.map((v) =>
					v.conditionId === conditionId ? { ...v, met: next } : v
				)
			)
		} else {
			onChange([...value, { conditionId, met: next }])
		}
	}

	if (isLoading) {
		return (
			<div className="p-s-300 sm:p-m-400 lg:p-m-500 flex items-center justify-center">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin motion-reduce:animate-none" />
			</div>
		)
	}

	if (totalCount === 0) {
		return null
	}

	const header = (
		<div className="gap-s-300 flex items-center justify-between">
			<h3 className="text-small text-txt-100 font-medium">{t("title")}</h3>
			<Badge
				id="trade-conditions-met-badge"
				variant="outline"
				className="text-txt-200"
			>
				{t("metBadge", { met: metCount, total: totalCount })}
			</Badge>
		</div>
	)

	return (
		<ConditionList
			filterIds={filterIds}
			header={header}
			renderRowControl={(condition) => {
				const tier = tierByConditionId.get(condition.id)
				const Icon = tier ? TIER_ICON[tier] : null
				const checked = isMet(condition.id)
				return (
					<div className="gap-s-300 flex items-center">
						{tier && Icon && (
							<Badge
								id={`trade-condition-tier-${condition.id}`}
								variant="outline"
								className={cn("gap-s-100", TIER_BADGE_CLASS[tier])}
							>
								<Icon className="h-3 w-3" />
								{t(`tier.${tier}`)}
							</Badge>
						)}
						<Checkbox
							id={`trade-condition-${condition.id}`}
							checked={checked}
							onCheckedChange={(next) =>
								handleToggle(condition.id, next === true)
							}
							aria-label={condition.name}
						/>
					</div>
				)
			}}
		/>
	)
}
