"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useFormatting } from "@/hooks/use-formatting"
import type { DataSourceInfo } from "@/types/candle"

interface DataSourceSelectProps {
	id: string
	dataSources: DataSourceInfo[]
	value: string
	onValueChange: (_value: string) => void
}

// hawk_15m_win and hawk_60m_win are projection inputs for the 5m brick — no
// strategy fires trades from them directly, so they don't belong in a
// user-facing source picker.
const HIDDEN_TIMEFRAME_CODES = new Set(["hawk_15m_win", "hawk_60m_win"])

const RENKO_CODE = /^R\d+$/

type Bucket = "hawks" | "renko" | "time"

const bucketFor = (timeframeCode: string): Bucket => {
	if (timeframeCode.startsWith("hawk_")) {
		return "hawks"
	}
	if (RENKO_CODE.test(timeframeCode)) {
		return "renko"
	}
	return "time"
}

const DataSourceSelect = ({
	id,
	dataSources,
	value,
	onValueChange,
}: DataSourceSelectProps) => {
	const t = useTranslations("backtest.config")
	const { formatNumber } = useFormatting()

	const groups = useMemo(() => {
		const hawks: Array<{ source: DataSourceInfo; index: number }> = []
		const renko: typeof hawks = []
		const time: typeof hawks = []
		for (const [index, source] of dataSources.entries()) {
			if (HIDDEN_TIMEFRAME_CODES.has(source.timeframeCode)) {
				continue
			}
			const bucket = bucketFor(source.timeframeCode)
			if (bucket === "hawks") {
				hawks.push({ source, index })
			} else if (bucket === "renko") {
				renko.push({ source, index })
			} else {
				time.push({ source, index })
			}
		}
		return { hawks, renko, time }
	}, [dataSources])

	const renderItem = ({
		source,
		index,
	}: {
		source: DataSourceInfo
		index: number
	}) => (
		<SelectItem
			key={`${source.assetId}-${source.timeframeId}`}
			value={String(index)}
		>
			{source.assetSymbol} — {source.timeframeCode}
			{source.rowCount ? ` (${formatNumber(source.rowCount)})` : ""}
		</SelectItem>
	)

	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{groups.hawks.length > 0 && (
					<SelectGroup>
						<SelectLabel>{t("sourceGroupHawks")}</SelectLabel>
						{groups.hawks.map(renderItem)}
					</SelectGroup>
				)}
				{groups.renko.length > 0 && (
					<SelectGroup>
						<SelectLabel>{t("sourceGroupRenko")}</SelectLabel>
						{groups.renko.map(renderItem)}
					</SelectGroup>
				)}
				{groups.time.length > 0 && (
					<SelectGroup>
						<SelectLabel>{t("sourceGroupTime")}</SelectLabel>
						{groups.time.map(renderItem)}
					</SelectGroup>
				)}
			</SelectContent>
		</Select>
	)
}

export { DataSourceSelect }
