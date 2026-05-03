"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { and, desc, eq, gte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksLearningProgress, hawksMentorInsights } from "@/db/schema"
import { getCurrentUser } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"

interface LearningProgressRecord {
	sectionKey: string
	completedAt: string | null
	notes: string | null
}

interface MentorInsightRecord {
	id: string
	date: string
	assetSymbol: string | null
	biasCalled: string | null
	setupCalled: string | null
	outcome: string | null
	bodyMarkdown: string
}

const fetchHawksLearningProgress = async (): Promise<
	ActionResponse<LearningProgressRecord[]>
> => {
	const t = await getTranslations("hawksLearning")
	try {
		const user = await getCurrentUser()
		if (!user) return { status: "error", message: t("errors.noUser") }

		const rows = await db.query.hawksLearningProgress.findMany({
			where: eq(hawksLearningProgress.userId, user.id),
		})

		return {
			status: "success",
			message: t("actions.progressLoaded"),
			data: rows.map((row) => ({
				sectionKey: row.sectionKey,
				completedAt: row.completedAt ? row.completedAt.toISOString() : null,
				notes: row.notes,
			})),
		}
	} catch (error) {
		console.error("Failed to fetch hawks learning progress:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

const toggleHawksLearningSection = async ({
	sectionKey,
	completed,
}: {
	sectionKey: string
	completed: boolean
}): Promise<ActionResponse<LearningProgressRecord>> => {
	const t = await getTranslations("hawksLearning")
	try {
		const user = await getCurrentUser()
		if (!user) return { status: "error", message: t("errors.noUser") }

		const completedAt = completed ? new Date() : null
		const existing = await db.query.hawksLearningProgress.findFirst({
			where: and(
				eq(hawksLearningProgress.userId, user.id),
				eq(hawksLearningProgress.sectionKey, sectionKey)
			),
		})

		let row
		if (existing) {
			const [updated] = await db
				.update(hawksLearningProgress)
				.set({ completedAt, updatedAt: new Date() })
				.where(eq(hawksLearningProgress.id, existing.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksLearningProgress)
				.values({
					userId: user.id,
					sectionKey,
					completedAt,
				})
				.returning()
			row = inserted
		}

		revalidatePath("/hawks/learning")

		return {
			status: "success",
			message: completed ? t("actions.markedComplete") : t("actions.markedIncomplete"),
			data: {
				sectionKey: row.sectionKey,
				completedAt: row.completedAt ? row.completedAt.toISOString() : null,
				notes: row.notes,
			},
		}
	} catch (error) {
		console.error("Failed to toggle hawks learning section:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

const fetchHawksMentorInsights = async (
	days = 14
): Promise<ActionResponse<MentorInsightRecord[]>> => {
	const t = await getTranslations("hawksLearning")
	try {
		const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * days)
		const rows = await db.query.hawksMentorInsights.findMany({
			where: gte(hawksMentorInsights.date, since),
			orderBy: [desc(hawksMentorInsights.date)],
			limit: 25,
		})

		return {
			status: "success",
			message: t("actions.insightsLoaded"),
			data: rows.map((row) => ({
				id: row.id,
				date: row.date.toISOString(),
				assetSymbol: row.assetSymbol,
				biasCalled: row.biasCalled,
				setupCalled: row.setupCalled,
				outcome: row.outcome,
				bodyMarkdown: row.bodyMarkdown,
			})),
		}
	} catch (error) {
		console.error("Failed to fetch hawks mentor insights:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

export {
	fetchHawksLearningProgress,
	toggleHawksLearningSection,
	fetchHawksMentorInsights,
}
export type { LearningProgressRecord, MentorInsightRecord }
