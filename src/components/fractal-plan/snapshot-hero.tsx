interface SnapshotHeroProps {
	tierIndex: number
	oneRCents: number
	capitalCents: number
	computedAt: Date
	reason: "month_start" | "drawdown_trigger" | "manual"
}

const REASON_LABEL: Record<SnapshotHeroProps["reason"], string> = {
	month_start: "Month start",
	drawdown_trigger: "Drawdown trigger",
	manual: "Manual override",
}

const formatBRL = (cents: number): string =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(
		cents / 100,
	)

const SnapshotHero = ({ tierIndex, oneRCents, capitalCents, computedAt, reason }: SnapshotHeroProps) => {
	return (
		<div className="rounded-lg border border-acc-100/30 bg-gradient-to-br from-acc-100/5 to-transparent p-m-500">
			<div className="mb-s-300 flex items-baseline justify-between">
				<span className="text-tiny font-medium uppercase tracking-wider text-acc-100">Tier snapshot</span>
				<span className="text-tiny text-txt-300">{REASON_LABEL[reason]}</span>
			</div>
			<div className="grid grid-cols-1 gap-s-400 sm:grid-cols-3">
				<div>
					<dt className="text-tiny text-txt-300">Tier</dt>
					<dd className="mt-1 font-mono text-2xl font-semibold text-acc-100">T{tierIndex}</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">1R</dt>
					<dd className="mt-1 font-mono text-2xl font-semibold text-txt-100">{formatBRL(oneRCents)}</dd>
				</div>
				<div>
					<dt className="text-tiny text-txt-300">Capital</dt>
					<dd className="mt-1 font-mono text-2xl font-semibold text-txt-100">{formatBRL(capitalCents)}</dd>
				</div>
			</div>
			<p className="mt-s-300 text-tiny text-txt-300">
				Computed at <time dateTime={computedAt.toISOString()}>{computedAt.toLocaleString("pt-BR")}</time>
			</p>
		</div>
	)
}

export type { SnapshotHeroProps }
export { SnapshotHero }
