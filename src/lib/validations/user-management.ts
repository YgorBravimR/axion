import { z } from "zod"

const updateUserRoleSchema = z.object({
	userId: z.string().uuid("validation.userManagement.invalidUserId"),
	role: z.enum(["admin", "trader", "viewer"], {
		message: "validation.userManagement.roleRequired",
	}),
})

type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>

export { updateUserRoleSchema, type UpdateUserRoleInput }
