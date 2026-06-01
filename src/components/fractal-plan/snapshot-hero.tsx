"use client"

import { useTranslations } from "next-intl"

interface SnapshotHeroProps {
	tierIndex: number
	oneRCents: number
	capitalCents: number
	computedAt: Date
	reason: "month_start" | "drawdown_trigger" | "manual"
}

const formatBRL = (cents: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
	}).format(cents / 100)

const SnapshotHero = ({
	tierIndex,
	oneRCents,
	capitalCents,
	computedAt,
	reason,
}: SnapshotHeroProps) => {
	const t = useTranslations("plan")
	return (
		<div className="border-acc-100/30 from-acc-100/5 p-m-500 rounded-lg border bg-gradient-to-br to-transparent">
			<div className="mb-s-300 flex items-baseline justify-between">
				<span className="text-tiny text-acc-100 font-medium tracking-wider uppercase">
					{t("snapshotHero.title")}
				</span>
				<span className="text-tiny text-txt-300">
					{t(`snapshotHero.reasons.${reason}`)}
				</span>
			</div>
			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-3">
				<div>
					<dt className="text-tiny text-txt-300">{t("common.tier")}</dt>
					<dd className="text-acc-100 text-h2 mt-1 font-mono font-semibold">
						T{tierIndex}
					</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">{t("snapshotHero.oneR")}</dt>
					<dd className="text-txt-100 text-h2 mt-1 font-mono font-semibold">
						{formatBRL(oneRCents)}
					</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">{t("common.capital")}</dt>
					<dd className="text-txt-100 text-h2 mt-1 font-mono font-semibold">
						{formatBRL(capitalCents)}
					</dd>
				</div>
			</div>
			<p className="mt-s-300 text-tiny text-txt-300">
				{t("snapshotHero.computedAt")}{" "}
				<time dateTime={computedAt.toISOString()}>
					{computedAt.toLocaleString("pt-BR")}
				</time>
			</p>
		</div>
	)
}

export type { SnapshotHeroProps }
export { SnapshotHero }
