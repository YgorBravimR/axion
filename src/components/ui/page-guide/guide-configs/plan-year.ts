import type { PageGuideConfig } from "@/types/page-guide"

const setDrawer = (open: boolean): void => {
	if (typeof window === "undefined") return
	window.dispatchEvent(
		new CustomEvent("plan-year-guide:set-drawer", { detail: { open } }),
	)
}

const closeDrawer = (): void => setDrawer(false)
const openDrawer = (): void => setDrawer(true)

const planYearGuide: PageGuideConfig = {
	pageKey: "planYear",
	steps: [
		{
			targetId: "plan-year-intro-anchor",
			titleKey: "intro",
			descriptionKey: "introDesc",
			placement: "center",
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-setup-card",
			titleKey: "setup",
			descriptionKey: "setupDesc",
			placement: "bottom",
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-drawer-capital",
			titleKey: "drawerCapital",
			descriptionKey: "drawerCapitalDesc",
			placement: "left",
			onEnter: openDrawer,
		},
		{
			targetId: "plan-year-drawer-defaults",
			titleKey: "drawerDefaults",
			descriptionKey: "drawerDefaultsDesc",
			placement: "left",
			onEnter: openDrawer,
		},
		{
			targetId: "plan-year-drawer-ladder",
			titleKey: "drawerLadder",
			descriptionKey: "drawerLadderDesc",
			placement: "left",
			onEnter: openDrawer,
		},
		{
			targetId: "plan-year-eoy-banner",
			titleKey: "eoy",
			descriptionKey: "eoyDesc",
			placement: "bottom",
			optional: true,
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-month-card-current",
			titleKey: "monthCurrent",
			descriptionKey: "monthCurrentDesc",
			placement: "right",
			optional: true,
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-month-card-projection",
			titleKey: "monthProjection",
			descriptionKey: "monthProjectionDesc",
			placement: "left",
			optional: true,
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-month-card-real",
			titleKey: "monthReal",
			descriptionKey: "monthRealDesc",
			placement: "right",
			optional: true,
			onEnter: closeDrawer,
		},
		{
			targetId: "plan-year-tabs",
			titleKey: "tabs",
			descriptionKey: "tabsDesc",
			placement: "bottom",
			onEnter: closeDrawer,
		},
	],
}

export { planYearGuide }
