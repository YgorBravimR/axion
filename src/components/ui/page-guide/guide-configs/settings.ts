import type { PageGuideConfig } from "@/types/page-guide"

const settingsGuide: PageGuideConfig = {
	pageKey: "settings",
	steps: [
		{
			targetId: "settings-tabs",
			titleKey: "tabs",
			descriptionKey: "tabsDesc",
			placement: "bottom",
		},
		{
			targetId: "settings-data-display",
			titleKey: "dataDisplay",
			descriptionKey: "dataDisplayDesc",
			placement: "top",
			optional: true,
		},
		{
			targetId: "settings-trading-costs",
			titleKey: "tradingCosts",
			descriptionKey: "tradingCostsDesc",
			placement: "top",
			optional: true,
		},
		{
			targetId: "settings-asset-overrides",
			titleKey: "assetOverrides",
			descriptionKey: "assetOverridesDesc",
			placement: "top",
			optional: true,
		},
		{
			targetId: "settings-data-maintenance",
			titleKey: "dataMaintenance",
			descriptionKey: "dataMaintenanceDesc",
			placement: "top",
			optional: true,
		},
		{
			targetId: "settings-tags",
			titleKey: "tags",
			descriptionKey: "tagsDesc",
			placement: "bottom",
			optional: true,
		},
		{
			targetId: "settings-conditions",
			titleKey: "conditions",
			descriptionKey: "conditionsDesc",
			placement: "bottom",
			optional: true,
		},
	],
}

export { settingsGuide }
