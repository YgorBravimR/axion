"use client"

import {
	HAWKS_LEAVES,
	HAWKS_VALIDATORS,
	BUNDLE_PATH,
	BUNDLE_OWNED_PATHS,
} from "@/lib/backtest/presets/hawks-leaves"
import {
	StrategySweepBuilder,
	type StrategySweepConfig,
	type StrategySweepBuilderProps,
} from "./strategy-sweep-builder"

const HAWKS_SECTIONS: StrategySweepConfig["sections"] = [
	{
		id: "entry",
		titleKey: "sectionEntry",
		pathPrefixes: [
			"entry.config.startTime",
			"entry.config.endTime",
			"entry.config.fireCooldownBricks",
			"entry.config.wave1MinBricks",
			"entry.config.retracementMinBricks",
		],
	},
	{
		id: "quality",
		titleKey: "sectionQuality",
		pathPrefixes: ["entry.config.qualityGates"],
	},
	{
		id: "stop",
		titleKey: "sectionStop",
		pathPrefixes: ["stop."],
	},
	{
		id: "reversal",
		titleKey: "sectionReversal",
		pathPrefixes: ["reversal."],
	},
	{
		id: "target",
		titleKey: "sectionTarget",
		pathPrefixes: ["target."],
	},
	{
		id: "execution",
		titleKey: "sectionExecution",
		pathPrefixes: ["slippageTicks"],
	},
]

const HAWKS_CONFIG: StrategySweepConfig = {
	leaves: HAWKS_LEAVES,
	validators: HAWKS_VALIDATORS,
	sections: HAWKS_SECTIONS,
	bundle: {
		path: BUNDLE_PATH,
		ownedPaths: BUNDLE_OWNED_PATHS,
		labelKeyPrefix: "hawksQualityBundle_",
		sectionId: "quality",
	},
	defaultTimeBaseline: 910, // 09:10 — Hawks session start default
}

type HawksSweepBuilderProps = Omit<StrategySweepBuilderProps, "config">

const HawksSweepBuilder = (props: HawksSweepBuilderProps) => (
	<StrategySweepBuilder config={HAWKS_CONFIG} {...props} />
)

export { HawksSweepBuilder }
export type { HawksSweepBuilderProps }
