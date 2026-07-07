"use client"

import { useTranslations } from "next-intl"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

type ConventionKey = "conservative" | "balanced" | "aggressive"

interface Convention {
	key: ConventionKey
	stopMultiple: number
	profitTargetR: number
	trailingTriggerR: number
	trailingDistanceR: number
	maxHoldHours: number
}

const CONVENTIONS: readonly Convention[] = [
	{
		key: "conservative",
		stopMultiple: 1,
		profitTargetR: 1.5,
		trailingTriggerR: 1,
		trailingDistanceR: 0.5,
		maxHoldHours: 2,
	},
	{
		key: "balanced",
		stopMultiple: 1,
		profitTargetR: 2.5,
		trailingTriggerR: 1.5,
		trailingDistanceR: 0.75,
		maxHoldHours: 4,
	},
	{
		key: "aggressive",
		stopMultiple: 1.5,
		profitTargetR: 4,
		trailingTriggerR: 2,
		trailingDistanceR: 1,
		maxHoldHours: 6,
	},
] as const

const formatR = (n: number): string => `${n.toFixed(1)}R`

const ExitConventionTab = () => {
	const t = useTranslations("plan.exits")

	return (
		<div className="space-y-m-400 mt-m-400">
			<header className="space-y-s-200">
				<h3 className="text-body text-txt-100 font-semibold">{t("title")}</h3>
				<p className="text-tiny text-txt-300">{t("subtitle")}</p>
			</header>

			<Tabs defaultValue="balanced">
				<TabsList variant="line">
					{CONVENTIONS.map((c) => (
						<TabsTrigger key={c.key} value={c.key}>
							{t(`conventions.${c.key}.name`)}
						</TabsTrigger>
					))}
				</TabsList>

				{CONVENTIONS.map((c) => (
					<TabsContent key={c.key} value={c.key}>
						<div className="space-y-m-400 mt-m-400">
							<div className="border-acc-100/30 bg-acc-100/5 p-m-400 rounded-lg border">
								<p className="text-small text-txt-100">
									{t(`conventions.${c.key}.description`)}
								</p>
							</div>

							<dl className="gap-s-300 grid grid-cols-2 sm:grid-cols-3">
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">
										{t("stopMultiple")}
									</dt>
									<dd className="text-body text-txt-100 mt-1 font-mono">
										{formatR(c.stopMultiple)}
									</dd>
								</div>
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">
										{t("profitTarget")}
									</dt>
									<dd className="text-body text-trade-buy mt-1 font-mono">
										{formatR(c.profitTargetR)}
									</dd>
								</div>
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">
										{t("trailingTrigger")}
									</dt>
									<dd className="text-body text-txt-100 mt-1 font-mono">
										{formatR(c.trailingTriggerR)}
									</dd>
								</div>
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">
										{t("trailingDistance")}
									</dt>
									<dd className="text-body text-txt-100 mt-1 font-mono">
										{formatR(c.trailingDistanceR)}
									</dd>
								</div>
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">{t("maxHold")}</dt>
									<dd className="text-body text-txt-100 mt-1 font-mono">
										{c.maxHoldHours}h
									</dd>
								</div>
								<div className="bg-bg-200 border-bg-300 p-s-300 rounded-md border">
									<dt className="text-tiny text-txt-300">{t("rrRatio")}</dt>
									<dd className="text-body text-txt-100 mt-1 font-mono">
										1 : {(c.profitTargetR / c.stopMultiple).toFixed(1)}
									</dd>
								</div>
							</dl>

							<div className="border-bg-300 p-m-400 space-y-s-200 rounded-lg border">
								<h4 className="text-small text-txt-100 font-medium">
									{t("rulebookTitle")}
								</h4>
								<ul className="text-tiny text-txt-200 space-y-s-100 list-disc pl-5">
									<li>{t(`conventions.${c.key}.rules.entry`)}</li>
									<li>{t(`conventions.${c.key}.rules.stop`)}</li>
									<li>{t(`conventions.${c.key}.rules.profit`)}</li>
									<li>{t(`conventions.${c.key}.rules.trail`)}</li>
								</ul>
							</div>
						</div>
					</TabsContent>
				))}
			</Tabs>

			<p className="text-tiny text-txt-300">{t("disclaimer")}</p>
		</div>
	)
}

export { ExitConventionTab }
