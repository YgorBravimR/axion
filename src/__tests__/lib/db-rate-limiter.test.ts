/**
 * Unit tests for `createDbRateLimiter` in src/lib/db-rate-limiter.ts.
 *
 * The DB layer is fully mocked via vi.mock. No real database connection is
 * needed. Drizzle fluent chains are replicated as mock objects.
 *
 * Query shapes emitted by the module under test:
 *
 *   Count query (no .limit):
 *     await db.select({total:count()}).from(t).where(and(...))
 *     → returns Array<{total: number}>
 *
 *   Oldest-row query (.orderBy + .limit):
 *     await db.select({createdAt:t.createdAt}).from(t).where(and(...)).orderBy(t.createdAt).limit(1)
 *     → returns Array<{createdAt: Date}>
 *
 *   Insert:
 *     await db.insert(t).values({identifier})
 *
 *   Delete (reset):
 *     await db.delete(t).where(eq(...))
 *
 *   Delete (cleanup, fire-and-forget):
 *     db.delete(t).where(lt(...)).then(()=>{}).catch(()=>{})
 *
 * Test coverage:
 *  - check(): allow under limit, record attempt, compute remaining
 *  - check(): block at limit, compute retryAfterMs from oldest attempt
 *  - check(): retryAfterMs clamped to 0 when window has lapsed
 *  - check(): falls back to windowMs when no oldest row found
 *  - check(): probabilistic cleanup triggered / not triggered
 *  - reset(): deletes all rows for the key
 *  - countAttempts(): counts without inserting, uses custom windowMs
 *  - record(): inserts without checking limit
 *  - getLatest(): returns most recent timestamp, null when empty
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.hoisted: declare mock references before vi.mock hoists factories to top
// ---------------------------------------------------------------------------

const { dbMock } = vi.hoisted(() => {
	const dbMock = {
		select: vi.fn(),
		insert: vi.fn(),
		delete: vi.fn(),
	}
	return { dbMock }
})

// ---------------------------------------------------------------------------
// Module-level mock registrations
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({ db: dbMock }))

// drizzle-orm operators are structural helpers; we pass them through as
// lightweight stubs so the code can call eq/and/gt/lt/count without failing.
vi.mock("drizzle-orm", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("drizzle-orm")>()
	return {
		...original,
		eq: vi.fn((_col, _val) => "__eq__"),
		and: vi.fn((..._conditions) => "__and__"),
		gt: vi.fn((_col, _val) => "__gt__"),
		lt: vi.fn((_col, _val) => "__lt__"),
		count: vi.fn(() => "__count__"),
		sql: vi.fn((strings: TemplateStringsArray) => strings.join("")),
	}
})

vi.mock("@/db/schema", () => ({
	rateLimitAttempts: {
		identifier: "col_identifier",
		createdAt: "col_created_at",
	},
}))

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { createDbRateLimiter } from "@/lib/db-rate-limiter"

// ---------------------------------------------------------------------------
// Mock chain builders
// ---------------------------------------------------------------------------

/**
 * Builds a fluent chain for the count query:
 *   db.select({total}).from(t).where(cond)  →  Promise<Array<{total}>>
 */
const buildCountChain = (rows: Array<{ total: number | null }>) =>
	({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(rows),
		}),
	}) as unknown as ReturnType<typeof dbMock.select>

/**
 * Builds a fluent chain for the oldest-row query:
 *   db.select({createdAt}).from(t).where(cond).orderBy(col).limit(1)  →  Promise<Array<{createdAt}>>
 */
const buildOldestRowChain = (rows: Array<{ createdAt: Date }>) =>
	({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(rows),
				}),
			}),
		}),
	}) as unknown as ReturnType<typeof dbMock.select>

/**
 * Builds a fluent chain for getLatest:
 *   db.select({createdAt}).from(t).where(cond).orderBy(sql`DESC`).limit(1)  →  Promise<Array<{createdAt}>>
 */
const buildGetLatestChain = (rows: Array<Partial<{ createdAt: Date }>>) =>
	({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(rows),
				}),
			}),
		}),
	}) as unknown as ReturnType<typeof dbMock.select>

/**
 * Configures dbMock.select to return different chains on successive calls.
 * Call index 0 → count chain, call index 1 → oldest-row chain.
 */
const setupTwoSelectCalls = (
	countRows: Array<{ total: number | null }>,
	oldestRows: Array<{ createdAt: Date }>
) => {
	let callIndex = 0
	dbMock.select.mockImplementation(() => {
		const index = callIndex++
		if (index === 0) {
			return buildCountChain(countRows)
		}
		return buildOldestRowChain(oldestRows)
	})
}

const setupSingleSelectCall = (countRows: Array<{ total: number | null }>) => {
	dbMock.select.mockReturnValue(buildCountChain(countRows))
}

const setupInsert = () => {
	dbMock.insert.mockReturnValue({
		values: vi.fn().mockResolvedValue(undefined),
	})
}

const setupDelete = () => {
	dbMock.delete.mockReturnValue({
		where: vi.fn().mockReturnValue({
			// supports both: await .where() and fire-and-forget .then().catch()
			then: vi.fn().mockReturnThis(),
			catch: vi.fn().mockReturnThis(),
		}),
	})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDbRateLimiter", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	// ========================================================================
	// check()
	// ========================================================================

	describe("check()", () => {
		it("should allow the request when count is below the limit and insert a new row", async () => {
			// Arrange: 2 existing attempts, limit = 5 → allowed, remaining = 2
			setupSingleSelectCall([{ total: 2 }])
			setupInsert()
			setupDelete()

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })

			// Act
			const result = await limiter.check("test-key")

			// Assert
			expect(result.allowed).toBe(true)
			expect(result.remaining).toBe(2) // 5 - 2 - 1
			expect(result.retryAfterMs).toBe(0)
			expect(dbMock.insert).toHaveBeenCalledOnce()
		})

		it("should allow the very first request when no attempts exist", async () => {
			setupSingleSelectCall([{ total: 0 }])
			setupInsert()
			setupDelete()

			const limiter = createDbRateLimiter({ maxAttempts: 3, windowMs: 60_000 })
			const result = await limiter.check("brand-new-key")

			expect(result.allowed).toBe(true)
			expect(result.remaining).toBe(2) // 3 - 0 - 1
			expect(result.retryAfterMs).toBe(0)
		})

		it("should return remaining=0 on the last allowed attempt (count = maxAttempts - 1)", async () => {
			setupSingleSelectCall([{ total: 4 }]) // one slot left
			setupInsert()
			setupDelete()

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.check("last-slot-key")

			expect(result.allowed).toBe(true)
			expect(result.remaining).toBe(0) // 5 - 4 - 1 = 0
		})

		it("should treat a null total from the DB as zero (defensive null coalescing)", async () => {
			setupSingleSelectCall([{ total: null }])
			setupInsert()
			setupDelete()

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.check("null-total-key")

			expect(result.allowed).toBe(true)
			expect(result.remaining).toBe(4) // 5 - 0 - 1
		})

		it("should block the request when count equals maxAttempts and return correct retryAfterMs", async () => {
			const fakeNow = 1_700_000_000_000
			vi.spyOn(Date, "now").mockReturnValue(fakeNow)

			// Oldest attempt was 30 seconds ago → retryAfterMs = 60000 - 30000 = 30000
			const oldestCreatedAt = new Date(fakeNow - 30_000)
			setupTwoSelectCalls([{ total: 5 }], [{ createdAt: oldestCreatedAt }])

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.check("blocked-key")

			expect(result.allowed).toBe(false)
			expect(result.remaining).toBe(0)
			expect(result.retryAfterMs).toBe(30_000)
			// Must NOT insert a new row when blocked
			expect(dbMock.insert).not.toHaveBeenCalled()
		})

		it("should clamp retryAfterMs to 0 when the oldest attempt is older than the window", async () => {
			const fakeNow = 1_700_000_000_000
			vi.spyOn(Date, "now").mockReturnValue(fakeNow)

			// Oldest attempt was 90s ago, window is 60s → computed retryAfter = -30000 → clamped to 0
			const oldestCreatedAt = new Date(fakeNow - 90_000)
			setupTwoSelectCalls([{ total: 5 }], [{ createdAt: oldestCreatedAt }])

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.check("lapsed-window-key")

			expect(result.allowed).toBe(false)
			expect(result.retryAfterMs).toBe(0)
		})

		it("should fall back to windowMs for retryAfterMs when the oldest-row query returns no rows", async () => {
			const fakeNow = 1_700_000_000_000
			vi.spyOn(Date, "now").mockReturnValue(fakeNow)

			setupTwoSelectCalls([{ total: 5 }], []) // no oldest row found

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.check("no-oldest-key")

			expect(result.allowed).toBe(false)
			expect(result.retryAfterMs).toBe(60_000) // full window fallback
		})

		it("should trigger probabilistic cleanup when Math.random is below 0.01", async () => {
			vi.spyOn(Math, "random").mockReturnValue(0.005)

			setupSingleSelectCall([{ total: 0 }])
			setupInsert()

			// Delete mock with full chain for the fire-and-forget cleanup path
			const thenMock = vi.fn().mockReturnThis()
			const catchMock = vi.fn().mockReturnThis()
			dbMock.delete.mockReturnValue({
				where: vi.fn().mockReturnValue({
					then: thenMock,
					catch: catchMock,
				}),
			})

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await limiter.check("cleanup-trigger-key")

			expect(dbMock.delete).toHaveBeenCalled()
		})

		it("should not call delete when Math.random is at or above 0.01", async () => {
			vi.spyOn(Math, "random").mockReturnValue(0.02)

			setupSingleSelectCall([{ total: 0 }])
			setupInsert()
			setupDelete()

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await limiter.check("no-cleanup-key")

			expect(dbMock.delete).not.toHaveBeenCalled()
		})
	})

	// ========================================================================
	// reset()
	// ========================================================================

	describe("reset()", () => {
		it("should call db.delete with the key and resolve", async () => {
			const whereDeleteMock = vi.fn().mockResolvedValue(undefined)
			dbMock.delete.mockReturnValue({ where: whereDeleteMock })

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await limiter.reset("my-reset-key")

			expect(dbMock.delete).toHaveBeenCalledOnce()
			expect(whereDeleteMock).toHaveBeenCalledOnce()
		})

		it("should resolve without error when no rows exist for the key (idempotent)", async () => {
			dbMock.delete.mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			})

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await expect(limiter.reset("nonexistent-key")).resolves.toBeUndefined()
		})
	})

	// ========================================================================
	// countAttempts()
	// ========================================================================

	describe("countAttempts()", () => {
		it("should return the row count from DB without inserting a new row", async () => {
			setupSingleSelectCall([{ total: 7 }])
			setupInsert()

			const limiter = createDbRateLimiter({ maxAttempts: 10, windowMs: 60_000 })
			const total = await limiter.countAttempts("count-me-key")

			expect(total).toBe(7)
			expect(dbMock.insert).not.toHaveBeenCalled()
		})

		it("should return 0 when the DB returns no rows", async () => {
			setupSingleSelectCall([])

			const limiter = createDbRateLimiter({ maxAttempts: 10, windowMs: 60_000 })
			const total = await limiter.countAttempts("empty-key")

			expect(total).toBe(0)
		})

		it("should return 0 when DB returns null for total (null coalescing)", async () => {
			setupSingleSelectCall([{ total: null }])

			const limiter = createDbRateLimiter({ maxAttempts: 10, windowMs: 60_000 })
			const total = await limiter.countAttempts("null-key")

			expect(total).toBe(0)
		})

		it("should use the config windowMs when no custom window is provided", async () => {
			setupSingleSelectCall([{ total: 2 }])

			const limiter = createDbRateLimiter({ maxAttempts: 10, windowMs: 30_000 })
			const total = await limiter.countAttempts("default-window-key")

			expect(total).toBe(2)
			expect(dbMock.select).toHaveBeenCalledOnce()
		})

		it("should accept a custom windowMs that overrides the config window", async () => {
			setupSingleSelectCall([{ total: 15 }])

			const limiter = createDbRateLimiter({ maxAttempts: 10, windowMs: 60_000 })
			const total = await limiter.countAttempts(
				"custom-window-key",
				24 * 60 * 60 * 1000
			)

			expect(total).toBe(15)
			expect(dbMock.select).toHaveBeenCalledOnce()
		})
	})

	// ========================================================================
	// record()
	// ========================================================================

	describe("record()", () => {
		it("should insert a row with the given identifier without calling select", async () => {
			const valuesMock = vi.fn().mockResolvedValue(undefined)
			dbMock.insert.mockReturnValue({ values: valuesMock })

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await limiter.record("record-this-key")

			expect(dbMock.insert).toHaveBeenCalledOnce()
			expect(valuesMock).toHaveBeenCalledWith({ identifier: "record-this-key" })
			expect(dbMock.select).not.toHaveBeenCalled()
		})

		it("should resolve without returning a value", async () => {
			dbMock.insert.mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			})

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			await expect(limiter.record("void-return-key")).resolves.toBeUndefined()
		})
	})

	// ========================================================================
	// getLatest()
	// ========================================================================

	describe("getLatest()", () => {
		it("should return the createdAt date of the most recent row", async () => {
			const expectedDate = new Date("2026-03-13T10:00:00Z")

			dbMock.select.mockReturnValue(
				buildGetLatestChain([{ createdAt: expectedDate }])
			)

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.getLatest("latest-key")

			expect(result).toEqual(expectedDate)
		})

		it("should return null when no rows exist for the key", async () => {
			dbMock.select.mockReturnValue(buildGetLatestChain([]))

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.getLatest("no-rows-key")

			expect(result).toBeNull()
		})

		it("should return null when the single returned row has no createdAt field", async () => {
			dbMock.select.mockReturnValue(buildGetLatestChain([{}]))

			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })
			const result = await limiter.getLatest("no-created-at-key")

			// row?.createdAt → undefined, ?? null → null
			expect(result).toBeNull()
		})
	})

	// ========================================================================
	// Factory isolation
	// ========================================================================

	describe("createDbRateLimiter factory", () => {
		it("should expose exactly the five expected methods", () => {
			const limiter = createDbRateLimiter({ maxAttempts: 5, windowMs: 60_000 })

			expect(typeof limiter.check).toBe("function")
			expect(typeof limiter.reset).toBe("function")
			expect(typeof limiter.countAttempts).toBe("function")
			expect(typeof limiter.record).toBe("function")
			expect(typeof limiter.getLatest).toBe("function")
		})

		it("should create independent instances that do not share config", async () => {
			// limiterSmall allows 3; limiterLarge allows 10
			// Both see a count of 2 → limiterSmall.remaining = 0, limiterLarge.remaining = 7
			dbMock.select.mockImplementation(() => buildCountChain([{ total: 2 }]))
			setupInsert()
			setupDelete()

			const limiterSmall = createDbRateLimiter({
				maxAttempts: 3,
				windowMs: 60_000,
			})
			const limiterLarge = createDbRateLimiter({
				maxAttempts: 10,
				windowMs: 60_000,
			})

			const resultSmall = await limiterSmall.check("shared-key")
			const resultLarge = await limiterLarge.check("shared-key")

			expect(resultSmall.remaining).toBe(0) // 3 - 2 - 1
			expect(resultLarge.remaining).toBe(7) // 10 - 2 - 1
		})
	})
})
