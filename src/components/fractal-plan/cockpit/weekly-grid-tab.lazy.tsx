import dynamic from "next/dynamic"
import type { MonthInputRow } from "./annual-cockpit-grid"

const WeeklyGridTabComponent = dynamic(
	() => import("./weekly-grid-tab").then((m) => ({ default: m.WeeklyGridTab })),
	{ ssr: false }
)

interface WeeklyGridTabLazyProps {
	year: number
	months: MonthInputRow[]
	currentMonthIndex: number
}

const WeeklyGridTabLazy = (props: WeeklyGridTabLazyProps) => {
	return <WeeklyGridTabComponent {...props} />
}

export { WeeklyGridTabLazy }
