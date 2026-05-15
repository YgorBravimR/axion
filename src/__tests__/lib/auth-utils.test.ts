import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({
	authMock: vi.fn(),
}))

vi.mock("@/auth", () => ({
	auth: authMock,
}))

import { requireRole } from "@/lib/auth-utils"

describe("requireRole", () => {
	beforeEach(() => {
		authMock.mockReset()
	})

	it("throws Unauthorized when there is no session", async () => {
		authMock.mockResolvedValueOnce(null)
		await expect(requireRole("viewer")).rejects.toThrow("Unauthorized")
	})

	it("throws Unauthorized when the session has no user id", async () => {
		authMock.mockResolvedValueOnce({ user: { role: "admin" } })
		await expect(requireRole("viewer")).rejects.toThrow("Unauthorized")
	})

	it("returns the user id when role exactly matches the requirement", async () => {
		authMock.mockResolvedValueOnce({ user: { id: "u-1", role: "trader" } })
		await expect(requireRole("trader")).resolves.toBe("u-1")
	})

	it("returns the user id when role exceeds the requirement", async () => {
		authMock.mockResolvedValueOnce({ user: { id: "u-2", role: "admin" } })
		await expect(requireRole("premium")).resolves.toBe("u-2")
	})

	it("throws Forbidden when role is below the requirement", async () => {
		authMock.mockResolvedValueOnce({ user: { id: "u-3", role: "viewer" } })
		await expect(requireRole("premium")).rejects.toThrow("Forbidden")
	})

	it("falls back to 'trader' when role is null and grants access to trader gates", async () => {
		authMock.mockResolvedValueOnce({ user: { id: "u-4", role: null } })
		await expect(requireRole("trader")).resolves.toBe("u-4")
	})

	it("falls back to 'trader' when role is null and denies access to admin gates", async () => {
		authMock.mockResolvedValueOnce({ user: { id: "u-5", role: null } })
		await expect(requireRole("admin")).rejects.toThrow("Forbidden")
	})
})
