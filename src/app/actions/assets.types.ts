import type { Asset, AssetType } from "@/db/schema"

export interface AssetWithType extends Asset {
	assetType: AssetType
}
