import dynamic from "next/dynamic"

const PayoffMatrixTabComponent = dynamic(
	() =>
		import("./payoff-matrix-tab").then((m) => ({ default: m.PayoffMatrixTab })),
	{ ssr: false }
)

interface PayoffMatrixTabLazyProps {
	initialCapitalCents: number
	tradingDaysPerWeek: number
	currentOneRCents: number
}

const PayoffMatrixTabLazy = (props: PayoffMatrixTabLazyProps) => {
	return <PayoffMatrixTabComponent {...props} />
}

export { PayoffMatrixTabLazy }
