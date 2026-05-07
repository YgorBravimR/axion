import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { z } from "zod"
import { simulationParamsV2Schema } from "@/lib/validations/monte-carlo"
import type { SimulationParamsV2 } from "@/types/monte-carlo"
import { runMonteCarloV2 } from "@/lib/monte-carlo-v2"

const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	try {
		const body: SimulationParamsV2 = await request.json()
		const validated = simulationParamsV2Schema.parse(body)
		const result = runMonteCarloV2(validated)

		return archSuccess("V2 simulation completed", result)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError(
				"Validation failed",
				error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				}))
			)
		}

		return archError(
			"Failed to run simulation",
			[{ code: "SIMULATION_ERROR", detail: String(error) }],
			500
		)
	}
}

export { POST }
