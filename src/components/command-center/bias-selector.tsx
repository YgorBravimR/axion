"use client"

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { BiasType } from "@/lib/validations/command-center"
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"

interface BiasSelectorProps {
	value: BiasType | null
	onChange: (value: BiasType | null) => void
	disabled?: boolean
	compact?: boolean
	isHawks?: boolean
}

const biasConfig = {
	long: {
		icon: TrendingUp,
		color: "text-action-buy",
		bgColor: "bg-action-buy/10",
	},
	short: {
		icon: TrendingDown,
		color: "text-action-sell",
		bgColor: "bg-action-sell/10",
	},
	neutral: {
		icon: ArrowRight,
		color: "text-txt-300",
		bgColor: "bg-bg-300/30",
	},
} as const

export const BiasSelector = ({
	value,
	onChange,
	disabled,
	compact = false,
	isHawks = false,
}: BiasSelectorProps) => {
	const t = useTranslations("commandCenter.assetRules")
	const tHawks = useTranslations("hawksMode")

	const handleValueChange = (newValue: string) => {
		if (newValue === "none") {
			onChange(null)
		} else {
			onChange(newValue as BiasType)
		}
	}

	return (
		<Select
			value={value || "none"}
			onValueChange={handleValueChange}
			disabled={disabled}
		>
			<SelectTrigger
				id="bias-selector"
				aria-label={isHawks ? tHawks("bias.hawksAriaLabel") : undefined}
				className={cn(
					"w-full",
					compact && "h-8 w-28",
					isHawks && "border-acc-100/40 ring-1 ring-acc-100/20"
				)}
			>
				<SelectValue placeholder={t("selectBias")}>
					{value ? (
						<BiasDisplay bias={value} compact={compact} />
					) : (
						<span className="text-txt-300">-</span>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">
					<span className="text-txt-300">-</span>
				</SelectItem>
				<SelectItem value="long">
					<BiasDisplay bias="long" />
				</SelectItem>
				<SelectItem value="short">
					<BiasDisplay bias="short" />
				</SelectItem>
				<SelectItem value="neutral">
					<BiasDisplay bias="neutral" />
				</SelectItem>
			</SelectContent>
		</Select>
	)
}

interface BiasDisplayProps {
	bias: BiasType
	compact?: boolean
}

export const BiasDisplay = ({ bias, compact = false }: BiasDisplayProps) => {
	const t = useTranslations("commandCenter.assetRules")
	const config = biasConfig[bias]
	const Icon = config.icon

	if (compact) {
		return (
			<div className={cn("gap-s-100 flex items-center", config.color)}>
				<Icon className={cn("h-3.5 w-3.5", config.color)} />
			</div>
		)
	}

	return (
		<div className={cn("gap-s-100 flex items-center", config.color)}>
			<Icon className={cn("h-4 w-4", config.color)} />
			<span>
				{t(
					bias === "long"
						? "biasLong"
						: bias === "short"
							? "biasShort"
							: "biasNeutral"
				)}
			</span>
		</div>
	)
}

interface BiasBadgeProps {
	bias: BiasType | null
}

export const BiasBadge = ({ bias }: BiasBadgeProps) => {
	if (!bias) {
		return <span className="text-txt-300">-</span>
	}

	const config = biasConfig[bias]
	const Icon = config.icon

	return (
		<div
			className={cn(
				"p-s-100 inline-flex items-center justify-center rounded",
				config.bgColor,
				config.color
			)}
		>
			<Icon className="h-4 w-4" />
		</div>
	)
}
