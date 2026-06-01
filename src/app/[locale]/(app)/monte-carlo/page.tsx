import { getDataSourceOptions } from "@/app/actions/monte-carlo"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import { MonteCarloContent } from "@/components/monte-carlo"

const MonteCarloPage = async () => {
	const [optionsResponse, profilesResponse] = await Promise.all([
		getDataSourceOptions(),
		listActiveRiskProfiles(),
	])

	const options =
		optionsResponse.status === "success" ? (optionsResponse.data ?? []) : []
	const riskProfiles =
		profilesResponse.status === "success" ? (profilesResponse.data ?? []) : []

	return (
		<MonteCarloContent initialOptions={options} riskProfiles={riskProfiles} />
	)
}

export { MonteCarloPage as default }
