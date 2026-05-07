interface GuideStep {
	targetId: string
	titleKey: string
	descriptionKey: string
	placement: "top" | "bottom" | "left" | "right" | "center"
	optional?: boolean
	onEnter?: () => void
}

interface PageGuideConfig {
	pageKey: string
	steps: GuideStep[]
}

export type { GuideStep, PageGuideConfig }
