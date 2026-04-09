import type { IndicatorGroup, IndicatorDefinition } from "@/db/schema"

interface IndicatorGroupWithDefinitions extends IndicatorGroup {
	indicators: IndicatorDefinition[]
}

export type { IndicatorGroupWithDefinitions }
