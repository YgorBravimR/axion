"use server"

import { db } from "@/db/drizzle"
import { accountCapitalEvents } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { invalidateAggregates } from "@/lib/aggregation/invalidate"

interface RecordCapitalEventParams {
	eventType: "deposit" | "withdrawal"
	amountCents: number
	eventDate: string // ISO "YYYY-MM-DD"
	notes?: string
}

interface ActionResult<T = void> {
	status: "success" | "error"
	data?: T
	message?: string
}

const recordCapitalEvent = async (
	params: RecordCapitalEventParams,
): Promise<ActionResult<{ id: string }>> => {
	const { accountId } = await requireAuth()

	if (!["deposit", "withdrawal"].includes(params.eventType)) {
		return { status: "error", message: "Invalid event type" }
	}
	if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
		return { status: "error", message: "Amount must be a positive integer (cents)" }
	}
	const eventDateObj = new Date(params.eventDate)
	if (Number.isNaN(eventDateObj.getTime())) {
		return { status: "error", message: "Invalid event date" }
	}
	if (eventDateObj > new Date()) {
		return { status: "error", message: "Event date cannot be in the future" }
	}

	const [inserted] = await db
		.insert(accountCapitalEvents)
		.values({
			accountId,
			eventType: params.eventType,
			amountCents: params.amountCents,
			eventDate: params.eventDate,
			notes: params.notes ?? null,
		})
		.returning({ id: accountCapitalEvents.id })

	await invalidateAggregates(accountId, eventDateObj)

	return { status: "success", data: { id: inserted.id } }
}

const deleteCapitalEvent = async (id: string): Promise<ActionResult> => {
	const { accountId } = await requireAuth()

	const rows = await db
		.select()
		.from(accountCapitalEvents)
		.where(and(eq(accountCapitalEvents.id, id), eq(accountCapitalEvents.accountId, accountId)))
		.limit(1)

	if (!rows[0]) {
		return { status: "error", message: "Event not found or access denied" }
	}

	const eventDate = new Date(rows[0].eventDate)
	await db.delete(accountCapitalEvents).where(eq(accountCapitalEvents.id, id))
	await invalidateAggregates(accountId, eventDate)

	return { status: "success" }
}

export { recordCapitalEvent, deleteCapitalEvent }
