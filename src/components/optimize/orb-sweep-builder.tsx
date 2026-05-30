"use client"

import { ORB_LEAVES, ORB_VALIDATORS } from "@/lib/backtest/presets/orb-leaves"
import {
	StrategySweepBuilder,
	type StrategySweepConfig,
	type StrategySweepBuilderProps,
} from "./strategy-sweep-builder"

const ORB_SECTIONS: StrategySweepConfig["sections"] = [
	{
		id: "entry",
		titleKey: "sectionEntry",
		pathPrefixes: ["entry.config."],
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

const ORB_CONFIG: StrategySweepConfig = {
	leaves: ORB_LEAVES,
	validators: ORB_VALIDATORS,
	sections: ORB_SECTIONS,
	defaultTimeBaseline: 900, // 09:00 — ORB session start default
}

type OrbSweepBuilderProps = Omit<StrategySweepBuilderProps, "config">

const OrbSweepBuilder = (props: OrbSweepBuilderProps) => (
	<StrategySweepBuilder config={ORB_CONFIG} {...props} />
)

export { OrbSweepBuilder }
export type { OrbSweepBuilderProps }
