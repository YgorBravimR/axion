import { CheckCircle, AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type RatingGrade = "A" | "B" | "C" | "D" | "F"

const RATING_CLASS: Record<RatingGrade, string> = {
	A: "bg-bg-300 text-txt-100 ring-1 ring-inset ring-acc-100/40",
	B: "bg-bg-300 text-txt-100",
	C: "bg-warning/15 text-warning",
	D: "bg-warning/25 text-warning",
	F: "bg-fb-error/20 text-fb-error",
}

interface RatingBadgeProps {
	id: string
	grade: RatingGrade
	withLabel?: boolean
	className?: string
}

const RatingBadge = ({
	id,
	grade,
	withLabel = false,
	className,
}: RatingBadgeProps) => {
	const tTrade = useTranslations("trade")
	return (
		<Badge id={id} className={cn(RATING_CLASS[grade], className)}>
			{withLabel ? `${tTrade("rating")}: ${grade}` : grade}
		</Badge>
	)
}

interface FollowedPlanBadgeProps {
	id: string
	followed: boolean
	className?: string
}

const FollowedPlanBadge = ({
	id,
	followed,
	className,
}: FollowedPlanBadgeProps) => {
	const tTrade = useTranslations("trade")
	if (followed) {
		return (
			<Badge
				id={id}
				className={cn("bg-bg-300 text-txt-100", className)}
				aria-label={tTrade("followedPlan")}
			>
				<CheckCircle className="mr-s-100 h-3 w-3" aria-hidden="true" />
				{tTrade("followedPlan")}
			</Badge>
		)
	}
	return (
		<Badge
			id={id}
			className={cn("bg-warning/20 text-warning", className)}
			aria-label={tTrade("detail.disciplineBreach")}
		>
			<AlertTriangle className="mr-s-100 h-3 w-3" aria-hidden="true" />
			{tTrade("detail.disciplineBreach")}
		</Badge>
	)
}

type TradeTagKind = "setup" | "mistake" | "general"

const TAG_CLASS: Record<TradeTagKind, string> = {
	setup: "bg-bg-300 text-txt-100",
	mistake: "bg-warning/15 text-warning",
	general: "bg-bg-300 text-txt-300",
}

interface TradeTagProps {
	id: string
	kind: TradeTagKind
	name: string
	className?: string
}

const TradeTag = ({ id, kind, name, className }: TradeTagProps) => {
	return (
		<Badge id={id} className={cn(TAG_CLASS[kind], className)}>
			{name}
		</Badge>
	)
}

export type { RatingGrade, TradeTagKind }
export { RatingBadge, FollowedPlanBadge, TradeTag }
