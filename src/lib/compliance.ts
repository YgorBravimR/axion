/**
 * Compliance ladder — discipline severity tones for plan-adherence metrics.
 *
 * Discipline is process, not P&L. Trade-buy / trade-sell tokens are reserved
 * for P&L magnitude; compliance uses a neutral → warning → fb-error ladder.
 * The `acc-100` ring is reserved for the headline donut anchor on the
 * compliance overview, not the per-strategy ladder.
 */

interface ComplianceTone {
	/** Text token, e.g. `text-warning` */
	text: string
	/** Border token, e.g. `border-warning/30` */
	border: string
	/** Low-opacity background tint, e.g. `bg-warning/10` */
	bg: string
	/** Solid bar / fill token, e.g. `bg-warning` */
	fill: string
	/** SVG stroke value (CSS variable form) */
	stroke: string
}

const HIGH_THRESHOLD = 80
const MID_THRESHOLD = 50

const getComplianceTone = (percent: number): ComplianceTone => {
	if (percent >= HIGH_THRESHOLD) {
		return {
			text: "text-txt-100",
			border: "border-bg-300",
			bg: "bg-bg-300/40",
			fill: "bg-txt-100",
			stroke: "var(--color-txt-100)",
		}
	}
	if (percent >= MID_THRESHOLD) {
		return {
			text: "text-warning",
			border: "border-warning/30",
			bg: "bg-warning/10",
			fill: "bg-warning",
			stroke: "var(--color-warning)",
		}
	}
	return {
		text: "text-fb-error",
		border: "border-fb-error/30",
		bg: "bg-fb-error/10",
		fill: "bg-fb-error",
		stroke: "var(--color-fb-error)",
	}
}

export type { ComplianceTone }
export { getComplianceTone, HIGH_THRESHOLD, MID_THRESHOLD }
