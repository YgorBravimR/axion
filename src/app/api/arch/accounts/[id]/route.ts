import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tradingAccounts, accountAssets, accountTimeframes } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { getUserDek, decryptAccountFields } from "@/lib/user-crypto"

const GET = async (
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const { id } = await params

		const account = await db.query.tradingAccounts.findFirst({
			where: and(
				eq(tradingAccounts.id, id),
				eq(tradingAccounts.userId, auth.userId)
			),
		})

		if (!account) {
			return archError("Account not found", [
				{ code: "NOT_FOUND", detail: "Account does not exist" },
			], 404)
		}

		// Decrypt account fields
		const dek = await getUserDek(auth.userId)
		const decryptedAccount = dek
			? decryptAccountFields(
				account as unknown as Record<string, unknown>,
				dek
			) as unknown as typeof account
			: account

		// Fetch asset and timeframe configurations
		const [assetConfigs, timeframeConfigs] = await Promise.all([
			db.query.accountAssets.findMany({
				where: eq(accountAssets.accountId, id),
				with: { asset: true },
			}),
			db.query.accountTimeframes.findMany({
				where: eq(accountTimeframes.accountId, id),
				with: { timeframe: true },
			}),
		])

		return archSuccess("Account detail retrieved", {
			...decryptedAccount,
			assetConfigs: assetConfigs.map((config) => ({
				assetId: config.assetId,
				assetName: config.asset?.name ?? null,
				assetSymbol: config.asset?.symbol ?? null,
				isEnabled: config.isEnabled,
				breakevenTicksOverride: config.breakevenTicksOverride,
			})),
			timeframeConfigs: timeframeConfigs.map((config) => ({
				timeframeId: config.timeframeId,
				timeframeName: config.timeframe?.name ?? null,
				isEnabled: config.isEnabled,
			})),
		})
	} catch (error) {
		return archError(
			"Failed to fetch account detail",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
