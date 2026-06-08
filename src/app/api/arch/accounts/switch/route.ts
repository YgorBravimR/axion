import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tradingAccounts } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as unknown
		const rawAccountId = (() => {
			if (typeof body === "object" && body !== null && "accountId" in body) {
				return (body as { accountId?: unknown }).accountId
			}
			return undefined
		})()
		const accountId =
			typeof rawAccountId === "string" ? rawAccountId : undefined

		if (!accountId) {
			return archError("Missing required field: accountId", [
				{ code: "MISSING_FIELD", detail: "accountId is required" },
			])
		}

		// Verify the account belongs to the user
		const targetAccount = await db.query.tradingAccounts.findFirst({
			where: and(
				eq(tradingAccounts.id, accountId),
				eq(tradingAccounts.userId, auth.userId)
			),
		})

		if (!targetAccount) {
			return archError(
				"Account not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Account does not exist or does not belong to this user",
					},
				],
				404
			)
		}

		// Unset all defaults for this user
		await db
			.update(tradingAccounts)
			.set({ isDefault: false })
			.where(eq(tradingAccounts.userId, auth.userId))

		// Set the target account as default
		const [updatedAccount] = await db
			.update(tradingAccounts)
			.set({ isDefault: true })
			.where(eq(tradingAccounts.id, accountId))
			.returning()

		if (!updatedAccount) {
			return archError(
				"Failed to switch account",
				[{ code: "ACCOUNT_NOT_UPDATED", detail: "Update returned no rows" }],
				500
			)
		}

		return archSuccess("Default account switched", {
			id: updatedAccount.id,
			name: updatedAccount.name,
			isDefault: updatedAccount.isDefault,
		})
	} catch (error) {
		return archError(
			"Failed to switch account",
			[{ code: "SWITCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
