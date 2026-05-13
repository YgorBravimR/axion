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
			className="border-acc-100/30 bg-acc-100/5 p-s-300 sm:p-m-400 space-y-m-400 rounded-lg border"
		>
			<header className="gap-s-300 flex items-start">
				<div className="bg-bg-300 text-acc-100 p-s-200 rounded-md">
					<Crosshair className="h-5 w-5" aria-hidden="true" />
				</div>
				<div>
					<h3
						id="hawks-trade-fields-title"
						className="text-body text-txt-100 font-semibold"
					>
						{t("title")}
					</h3>
					<p className="mt-s-100 text-tiny text-txt-300 max-w-prose">
						{t("description")}
					</p>
				</div>
			</header>

			<div className="space-y-s-300">
				{TOGGLES.map((row) => (
					<FormField
						key={row.key}
						control={form.control}
						name={`hawks.${row.key}` as const}
						render={({ field }) => (
							<FormItem className="gap-s-300 flex items-start justify-between">
								<div className="flex-1">
									<FormLabel id={`hawks-${row.key}-label`}>
										{t(row.labelKey)}
									</FormLabel>
									<p className="text-tiny text-txt-300">{t(row.hintKey)}</p>
									<FormMessage />
								</div>
								<FormControl>
									<Switch
										id={`hawks-${row.key}`}
										checked={field.value === true}
										onCheckedChange={field.onChange}
										aria-label={t(row.labelKey)}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				))}
			</div>
		</section>
	)
}

export { HawksTradeFields }
