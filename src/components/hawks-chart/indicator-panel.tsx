"use client"

import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"

interface IndicatorToggles {
	readonly ema15m: boolean
	readonly ema60m: boolean
	readonly vwapD: boolean
	readonly vwapW: boolean
	readonly vwapM: boolean
	readonly ajuste: boolean
	readonly keltner: boolean
	readonly macd: boolean
	readonly swingTape: boolean
	readonly tradeMarkers: boolean
}

interface IndicatorPanelProps {
	readonly toggles: IndicatorToggles
	readonly onToggle: (_key: keyof IndicatorToggles, _value: boolean) => void
}

const TOGGLE_KEYS: ReadonlyArray<keyof IndicatorToggles> = [
	"tradeMarkers",
	"ema15m",
	"ema60m",
	"vwapD",
	"vwapW",
	"vwapM",
	"ajuste",
	"keltner",
	"macd",
	"swingTape",
]

const HawksChartIndicatorPanel = ({
	toggles,
	onToggle,
}: IndicatorPanelProps) => {
	const t = useTranslations("hawksChart")
	return (
		<div className="border-bg-300 bg-bg-200 gap-s-300 flex flex-wrap items-center rounded-md border p-2">
			<span className="text-tiny text-txt-300 mr-s-200 font-mono">
				{t("indicators")}:
			</span>
			{TOGGLE_KEYS.map((key) => (
				<label
					key={key}
					htmlFor={`hawks-chart-toggle-${key}`}
					className="gap-s-100 text-tiny text-txt-200 flex cursor-pointer items-center"
				>
					<Checkbox
						id={`hawks-chart-toggle-${key}`}
						checked={toggles[key]}
						onCheckedChange={(v) => onToggle(key, v === true)}
					/>
					<span>{t(`indicator.${key}`)}</span>
				</label>
			))}
		</div>
	)
}

const DEFAULT_INDICATOR_TOGGLES: IndicatorToggles = {
	tradeMarkers: true,
	ema15m: true,
	ema60m: true,
	vwapD: true,
	vwapW: false,
	vwapM: false,
	ajuste: true,
	keltner: false,
	macd: true,
	swingTape: false,
}

export { HawksChartIndicatorPanel, DEFAULT_INDICATOR_TOGGLES }
export type { IndicatorPanelProps, IndicatorToggles }
