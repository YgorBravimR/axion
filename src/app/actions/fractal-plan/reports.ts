"use server"

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, eq, isNotNull, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"
import type { RDistRow } from "./reports.types"

const bucketize = (r: number): RDistRow["bucket"] => {
	if (r < -1) {
		return "lt_neg1"
	}
	if (r < 0) {
		return "neg1_to_0"
	}
	if (r < 1) {
		return "0_to_1"
	}
	if (r < 2) {
		return "1_to_2"
	}
	return "ge_2"
}

export const getRDistribution = async (range: {
	from: Date
	to: Date
}): Promise<ActionResponse<RDistRow[]>> => {
	const { accountId } = await requireAuth()

	const rows = await db
		.select({ rOutcome: trades.rOutcome })
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				isNotNull(trades.rOutcome),
				gte(trades.exitDate, range.from),
				lte(trades.exitDate, range.to)
			)
		)

	const counts = new Map<RDistRow["bucket"], number>()
	for (const row of rows) {
		const r = Number(row.rOutcome)
		if (!Number.isFinite(r)) {
			continue
		}
		const b = bucketize(r)
		counts.set(b, (counts.get(b) ?? 0) + 1)
	}

	const data: RDistRow[] = (
		["lt_neg1", "neg1_to_0", "0_to_1", "1_to_2", "ge_2"] as const
	).map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }))

	return { status: "success", message: "ok", data }
}
