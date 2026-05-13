"use client"

import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { Crosshair } from "lucide-react"
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { FeatureStamp } from "@/components/ui/feature-stamp"
import { HelpText } from "@/components/ui/help-text"
import type { TradeFormInput } from "@/lib/validations/trade"

interface HawksTradeFieldsProps {
	form: UseFormReturn<TradeFormInput>
}

type ToggleKey = "tripleScreenConfirmed" | "vwapRespected" | "ajusteRespected"

const TOGGLES: ReadonlyArray<{
	key: ToggleKey
	labelKey: string
	hintKey: string
}> = [
	{
		key: "tripleScreenConfirmed",
		labelKey: "tripleScreenLabel",
		hintKey: "tripleScreenHint",
	},
	{ key: "vwapRespected", labelKey: "vwapLabel", hintKey: "vwapHint" },
	{ key: "ajusteRespected", labelKey: "ajusteLabel", hintKey: "ajusteHint" },
]

const HawksTradeFields = ({ form }: HawksTradeFieldsProps) => {
	const t = useTranslations("hawks.tradeFields")

	return (
		<section
			id="hawks-trade-fields"
			aria-labelledby="hawks-trade-fields-title"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 space-y-m-400 rounded-lg border"
		>
			<header className="gap-s-300 flex items-start">
				<FeatureStamp icon={Crosshair} />
				<div>
					<h3
						id="hawks-trade-fields-title"
						className="text-body text-txt-100 font-semibold"
					>
						{t("title")}
					</h3>
					<HelpText
						id="hawks-trade-fields-description"
						className="mt-s-100 max-w-prose"
					>
						{t("description")}
					</HelpText>
				</div>
			</header>

			<div className="space-y-s-300">
				{TOGGLES.map((row) => {
					const switchId = `hawks-${row.key}`
					const hintId = `${switchId}-hint`
					return (
						<FormField
							key={row.key}
							control={form.control}
							name={`hawks.${row.key}` as const}
							render={({ field }) => (
								<FormItem className="gap-s-300 flex items-start justify-between">
									<div className="flex-1">
										<FormLabel id={`${switchId}-label`}>
											{t(row.labelKey)}
										</FormLabel>
										<HelpText id={hintId}>{t(row.hintKey)}</HelpText>
										<FormMessage />
									</div>
									<FormControl>
										<Switch
											id={switchId}
											checked={field.value === true}
											onCheckedChange={field.onChange}
											aria-describedby={hintId}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					)
				})}
			</div>
		</section>
	)
}

export { HawksTradeFields }
