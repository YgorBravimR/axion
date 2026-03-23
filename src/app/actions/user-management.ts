"use server"

import { eq } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { users } from "@/db/schema"
import { requireRole } from "@/lib/auth-utils"
import {
	updateUserRoleSchema,
	type UpdateUserRoleInput,
} from "@/lib/validations/user-management"

interface UserAccount {
	id: string
	name: string
	accountType: string
	isDefault: boolean
	isActive: boolean
}

interface UserWithAccounts {
	id: string
	name: string
	email: string
	role: "admin" | "trader" | "viewer"
	image: string | null
	createdAt: Date
	tradingAccounts: UserAccount[]
}

const getAllUsersWithAccounts = async (): Promise<UserWithAccounts[]> => {
	await requireRole("admin")

	const result = await db.query.users.findMany({
		columns: {
			id: true,
			name: true,
			email: true,
			role: true,
			image: true,
			createdAt: true,
		},
		with: {
			tradingAccounts: {
				columns: {
					id: true,
					name: true,
					accountType: true,
					isDefault: true,
					isActive: true,
				},
			},
		},
		orderBy: (users, { asc }) => [asc(users.createdAt)],
	})

	return result
}

const updateUserRole = async (
	data: UpdateUserRoleInput
): Promise<{ success: boolean; error?: string }> => {
	const adminId = await requireRole("admin")

	const validated = updateUserRoleSchema.safeParse(data)
	if (!validated.success) {
		return { success: false, error: validated.error.issues[0]?.message }
	}

	const { userId, role } = validated.data

	if (userId === adminId) {
		return { success: false, error: "Cannot change your own role" }
	}

	await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))

	invalidateSettingsData()

	return { success: true }
}

export {
	getAllUsersWithAccounts,
	updateUserRole,
	type UserWithAccounts,
	type UserAccount,
}
