import { Lock, Sparkles } from "lucide-react"
import { Link } from "@/i18n/routing"

interface PremiumFeatureTeaserProps {
	title: string
	description: string
	bullets: string[]
	upgradeLabel: string
	upgradeHref?: string
	// Optional small visual block — when omitted the teaser is text-only and
	// suits inline placement (e.g. inside a strategy card). Pass JSX for a
	// faux-chart / mockup when the teaser sits in a larger empty slot.
	visual?: React.ReactNode
}

export const PremiumFeatureTeaser = ({
	title,
	description,
	bullets,
	upgradeLabel,
	upgradeHref = "/settings?tab=account",
	visual,
}: PremiumFeatureTeaserProps) => {
	return (
		<div className="border-acc-100/30 bg-acc-100/5 p-m-400 sm:p-m-500 gap-m-400 flex flex-col rounded-lg border md:flex-row md:items-start">
			<div className="bg-acc-100/15 p-s-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
				<Lock className="text-acc-100 h-5 w-5" aria-hidden="true" />
			</div>
			<div className="gap-s-300 flex flex-1 flex-col">
				<div className="gap-s-200 flex flex-wrap items-center">
					<h3 className="text-body text-txt-100 font-semibold">{title}</h3>
					<span className="bg-acc-100/15 px-s-200 text-tiny text-acc-100 gap-s-100 inline-flex items-center rounded-sm py-px font-medium">
						<Sparkles className="h-3 w-3" aria-hidden="true" />
						Premium
					</span>
				</div>
				<p className="text-small text-txt-200">{description}</p>
				{bullets.length > 0 && (
					<ul className="space-y-s-100 text-small text-txt-200 list-disc pl-5">
						{bullets.map((b) => (
							<li key={b}>{b}</li>
						))}
					</ul>
				)}
				<div>
					<Link
						href={upgradeHref}
						className="bg-acc-100 text-bg-100 px-m-400 py-s-200 text-small hover:bg-acc-100/90 inline-flex items-center rounded-md font-medium transition-colors"
					>
						{upgradeLabel}
					</Link>
				</div>
			</div>
			{visual && (
				<div className="bg-bg-200 border-bg-300 p-s-300 hidden w-full max-w-xs shrink-0 rounded-md border md:block">
					{visual}
				</div>
			)}
		</div>
	)
}
