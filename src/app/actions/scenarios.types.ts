import type { StrategyScenario, ScenarioImage } from "@/db/schema"

export interface ScenarioWithImages extends StrategyScenario {
	images: ScenarioImage[]
}
