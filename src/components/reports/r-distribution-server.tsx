import { getRDistribution } from "@/app/actions/fractal-plan/reports"
import { RDistributionTab } from "./r-distribution-tab"

interface RDistributionServerProps {
	from: Date
	to: Date
}

const RDistributionServer = async ({ from, to }: RDistributionServerProps) => {
	const result = await getRDistribution({ from, to })
	const rows = result.status === "success" && result.data ? result.data : []

	return <RDistributionTab rows={rows} />
}

export { RDistributionServer }
