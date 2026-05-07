import type {
	DailyChecklist,
	ChecklistCompletion,
	AccountAssetSetting,
	Asset,
} from "@/db/schema"
import type { ChecklistItem } from "@/lib/validations/command-center"

export interface ChecklistWithCompletion extends DailyChecklist {
	parsedItems: ChecklistItem[]
	completion: ChecklistCompletion | null
	completedItemIds: string[]
}

export interface AssetSettingWithAsset extends AccountAssetSetting {
	asset: Asset
}

export interface DailySummary {
	totalPnL: number
	tradesCount: number
	winCount: number
	lossCount: number
	winRate: number
	bestTrade: number
	worstTrade: number
	consecutiveLosses: number
}
