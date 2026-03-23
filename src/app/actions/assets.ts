"use server"

import { db } from "@/db/drizzle"
import { assetTypes, assets, type Asset, type AssetType } from "@/db/schema"
import { eq, inArray, asc, desc } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import {
	createAssetTypeSchema,
	updateAssetTypeSchema,
	createAssetSchema,
	updateAssetSchema,
	type CreateAssetTypeInput,
	type UpdateAssetTypeInput,
	type CreateAssetInput,
	type UpdateAssetInput,
} from "@/lib/validations/asset"
import { toCents } from "@/lib/money"
import { auth } from "@/auth"
import { requireRole } from "@/lib/auth-utils"
import { getTranslations } from "next-intl/server"

/**
 * Require authenticated session. Returns userId or throws.
 */
const requireSession = async (): Promise<string> => {
	const session = await auth()
	if (!session?.user?.id) {
		throw new Error("Unauthorized")
	}
	return session.user.id
}

// ============================================================================
// ASSET TYPES
// ============================================================================

export const getAssetTypes = async (): Promise<AssetType[]> => {
	await requireSession()
	const result = await db.query.assetTypes.findMany({
		orderBy: [asc(assetTypes.name)],
	})
	return result
}

export const getActiveAssetTypes = async (): Promise<AssetType[]> => {
	await requireSession()
	const result = await db.query.assetTypes.findMany({
		where: eq(assetTypes.isActive, true),
		orderBy: [asc(assetTypes.name)],
	})
	return result
}

export const getAssetType = async (id: string): Promise<AssetType | null> => {
	await requireSession()
	const result = await db.query.assetTypes.findFirst({
		where: eq(assetTypes.id, id),
	})
	return result ?? null
}

export const createAssetType = async (
	data: CreateAssetTypeInput
): Promise<{ success: boolean; data?: AssetType; error?: string }> => {
	await requireRole("admin")
	const validated = createAssetTypeSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [assetType] = await db
		.insert(assetTypes)
		.values({
			code: validated.data.code,
			name: validated.data.name,
			description: validated.data.description,
			isActive: validated.data.isActive,
		})
		.returning()

	invalidateSettingsData()

	return { success: true, data: assetType }
}

export const updateAssetType = async (
	id: string,
	data: UpdateAssetTypeInput
): Promise<{ success: boolean; data?: AssetType; error?: string }> => {
	await requireRole("admin")
	const validated = updateAssetTypeSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [assetType] = await db
		.update(assetTypes)
		.set(validated.data)
		.where(eq(assetTypes.id, id))
		.returning()

	if (!assetType) {
		const t = await getTranslations("settings")
		return { success: false, error: t("errors.assetTypeNotFound") }
	}

	invalidateSettingsData()

	return { success: true, data: assetType }
}

export const deleteAssetType = async (
	id: string
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	const existingAssets = await db.query.assets.findFirst({
		where: eq(assets.assetTypeId, id),
	})

	if (existingAssets) {
		const t = await getTranslations("settings")
		return {
			success: false,
			error: t("errors.cannotDeleteAssetType"),
		}
	}

	await db.delete(assetTypes).where(eq(assetTypes.id, id))

	invalidateSettingsData()

	return { success: true }
}

// ============================================================================
// ASSETS
// ============================================================================

export interface AssetWithType extends Asset {
	assetType: AssetType
}

export const getAssets = async (): Promise<AssetWithType[]> => {
	await requireSession()
	const result = await db.query.assets.findMany({
		with: {
			assetType: true,
		},
		orderBy: [asc(assets.symbol)],
	})
	return result
}

export const getActiveAssets = async (): Promise<AssetWithType[]> => {
	await requireSession()
	const result = await db.query.assets.findMany({
		where: eq(assets.isActive, true),
		with: {
			assetType: true,
		},
		orderBy: [asc(assets.symbol)],
	})
	return result
}

export const getAsset = async (id: string): Promise<AssetWithType | null> => {
	await requireSession()
	const result = await db.query.assets.findFirst({
		where: eq(assets.id, id),
		with: {
			assetType: true,
		},
	})
	return result ?? null
}

// B3 futures prefixes that map to canonical FUT-suffixed symbols
// e.g., WIN → WINFUT, WINM25 → WINFUT, WDOG26 → WDOFUT
const B3_FUT_PREFIXES = ["WIN", "WDO", "DOL", "IND", "BGI", "CCM", "ICF", "SFI", "DI1"]

/**
 * Find the B3 futures prefix that a symbol starts with.
 * e.g., "WINM25" → "WIN", "WDOG26" → "WDO", "AAPL" → null
 */
const extractB3Prefix = (symbol: string): string | null => {
	const upper = symbol.toUpperCase()
	return B3_FUT_PREFIXES.find((prefix) => upper.startsWith(prefix)) ?? null
}

export const getAssetBySymbol = async (
	symbol: string
): Promise<AssetWithType | null> => {
	await requireSession()
	const upper = symbol.toUpperCase()
	const prefix = extractB3Prefix(upper)

	if (prefix) {
		// Build candidate symbols: exact input, base prefix, prefix+FUT
		const candidates = [...new Set([upper, prefix, `${prefix}FUT`])]
		const results = await db.query.assets.findMany({
			where: inArray(assets.symbol, candidates),
			with: { assetType: true },
		})
		// Priority: exact match > base prefix > FUT variant
		return results.find((a) => a.symbol === upper)
			?? results.find((a) => a.symbol === prefix)
			?? results.find((a) => a.symbol === `${prefix}FUT`)
			?? null
	}

	const result = await db.query.assets.findFirst({
		where: eq(assets.symbol, upper),
		with: { assetType: true },
	})
	return result ?? null
}

export const createAsset = async (
	data: CreateAssetInput
): Promise<{ success: boolean; data?: Asset; error?: string }> => {
	await requireRole("admin")
	const validated = createAssetSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [asset] = await db
		.insert(assets)
		.values({
			symbol: validated.data.symbol,
			name: validated.data.name,
			assetTypeId: validated.data.assetTypeId,
			tickSize: validated.data.tickSize.toString(),
			tickValue: toCents(validated.data.tickValue),
			currency: validated.data.currency,
			multiplier: validated.data.multiplier?.toString() ?? "1",
			isActive: validated.data.isActive,
		})
		.returning()

	invalidateSettingsData()

	return { success: true, data: asset }
}

export const updateAsset = async (
	data: UpdateAssetInput
): Promise<{ success: boolean; data?: Asset; error?: string }> => {
	await requireRole("admin")
	const validated = updateAssetSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const { id, ...updateData } = validated.data

	const updateValues: Record<string, unknown> = {}

	if (updateData.symbol !== undefined)
		updateValues.symbol = updateData.symbol
	if (updateData.name !== undefined) updateValues.name = updateData.name
	if (updateData.assetTypeId !== undefined)
		updateValues.assetTypeId = updateData.assetTypeId
	if (updateData.tickSize !== undefined)
		updateValues.tickSize = updateData.tickSize.toString()
	if (updateData.tickValue !== undefined)
		updateValues.tickValue = toCents(updateData.tickValue)
	if (updateData.currency !== undefined)
		updateValues.currency = updateData.currency
	if (updateData.multiplier !== undefined)
		updateValues.multiplier = updateData.multiplier.toString()
	if (updateData.isActive !== undefined)
		updateValues.isActive = updateData.isActive

	updateValues.updatedAt = new Date()

	const [asset] = await db
		.update(assets)
		.set(updateValues)
		.where(eq(assets.id, id))
		.returning()

	if (!asset) {
		return { success: false, error: "Asset not found" }
	}

	invalidateSettingsData()

	return { success: true, data: asset }
}

export const deleteAsset = async (
	id: string
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db.delete(assets).where(eq(assets.id, id))

	invalidateSettingsData()

	return { success: true }
}

export const toggleAssetActive = async (
	id: string,
	isActive: boolean
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db
		.update(assets)
		.set({ isActive, updatedAt: new Date() })
		.where(eq(assets.id, id))

	invalidateSettingsData()

	return { success: true }
}
