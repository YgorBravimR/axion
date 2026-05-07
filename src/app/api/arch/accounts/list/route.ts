import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tradingAccounts } from "@/db/schema"
import { eq } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { getUserDek, decryptAccountFields } from "@/lib/user-crypto"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(tradingAccounts.userId, auth.userId),
		})

		const dek = await getUserDek(auth.userId)
		const decryptedAccounts = dek
			? accounts.map(
					(account) =>
						decryptAccountFields(
							account as unknown as Record<string, unknown>,
							dek
						) as unknown as typeof account
				)
			: accounts

		const formatted = decryptedAccounts.map((account) => ({
			id: account.id,
			name: account.name,
			accountType: account.accountType,
			isDefault: account.isDefault,
			isActive: account.isActive,
			brand: account.brand,
			propFirmName: account.propFirmName,
			description: account.description,
			createdAt: account.createdAt,
		}))

		return archSuccess("Accounts retrieved", formatted)
	} catch (error) {
		return archError(
			"Failed to fetch accounts",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
