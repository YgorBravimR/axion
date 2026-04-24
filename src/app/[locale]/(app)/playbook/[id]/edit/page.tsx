import { notFound } from "next/navigation"
import { getStrategy } from "@/app/actions/strategies"
import { getStrategyConditions } from "@/app/actions/strategy-conditions"
import { EditStrategyForm } from "./edit-strategy-form"

interface EditStrategyPageProps {
	params: Promise<{ id: string }>
}

const EditStrategyPage = async ({ params }: EditStrategyPageProps) => {
	const { id } = await params

	const [stratResult, condResult] = await Promise.all([
		getStrategy(id),
		getStrategyConditions(id),
	])

	if (stratResult.status !== "success" || !stratResult.data) {
		notFound()
	}

	const conditions =
		condResult.status === "success" ? (condResult.data ?? []) : []

	return (
		<EditStrategyForm
			strategy={stratResult.data}
			initialConditions={conditions}
		/>
	)
}

export { EditStrategyPage as default }
