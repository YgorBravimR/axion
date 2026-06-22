/**
 * Tests for the AI Assistant tool registry.
 *
 * The critical test here is the isolation invariant: no tool's input schema
 * may declare `userId` or `accountId`. If it did, an LLM that's been
 * prompt-injected could pass another user's ID and bypass auth scoping.
 *
 * This is the "CI lint" promised in PR 1's done-bar — implemented as a
 * structural test that walks every schema and fails the build if either
 * forbidden field appears.
 */
import { describe, it, expect, vi } from "vitest"

// The registry transitively imports tools which import @/auth → next-auth.
// next-auth can't load in Vitest's node environment. Mock it + the DB so the
// registry's pure-data exports (TOOL_SCHEMAS, isToolName) can be inspected
// without spinning up the auth runtime.
vi.mock("@/auth", () => ({
	auth: vi.fn(),
	handlers: {},
	signIn: vi.fn(),
	signOut: vi.fn(),
}))
vi.mock("@/app/actions/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/db/drizzle", () => ({ db: {} }))

import {
	TOOL_SCHEMAS,
	dispatchTool,
	isToolName,
} from "@/lib/ai-assistant/tool-registry"

describe("tool-registry — isolation invariant", () => {
	it("no tool schema declares 'userId' in its input properties", () => {
		const offenders = TOOL_SCHEMAS.filter(
			(t) => "userId" in t.input_schema.properties
		).map((t) => t.name)
		expect(offenders).toEqual([])
	})

	it("no tool schema declares 'accountId' in its input properties", () => {
		const offenders = TOOL_SCHEMAS.filter(
			(t) => "accountId" in t.input_schema.properties
		).map((t) => t.name)
		expect(offenders).toEqual([])
	})

	it("no tool schema declares 'user_id' or 'account_id' (snake_case guard)", () => {
		const offenders = TOOL_SCHEMAS.filter(
			(t) =>
				"user_id" in t.input_schema.properties ||
				"account_id" in t.input_schema.properties
		).map((t) => t.name)
		expect(offenders).toEqual([])
	})

	it("every tool schema sets additionalProperties: false (LLMs can't sneak extra fields)", () => {
		const offenders = TOOL_SCHEMAS.filter(
			(t) => t.input_schema.additionalProperties !== false
		).map((t) => t.name)
		expect(offenders).toEqual([])
	})
})

describe("tool-registry — schema basics", () => {
	it("exposes exactly the 5 Phase-1 tools", () => {
		expect(TOOL_SCHEMAS.map((t) => t.name).sort()).toEqual(
			[
				"get_account_context",
				"get_engine_replay_for_trade",
				"get_recent_backtest_runs",
				"get_trade_with_enrichment",
				"get_user_trade_aggregates",
			].sort()
		)
	})

	it("every tool has a non-trivial description (LLM uses these to pick)", () => {
		for (const t of TOOL_SCHEMAS) {
			expect(t.description.length).toBeGreaterThanOrEqual(40)
		}
	})

	it("every tool schema is type: 'object'", () => {
		for (const t of TOOL_SCHEMAS) {
			expect(t.input_schema.type).toBe("object")
		}
	})
})

describe("isToolName", () => {
	it("recognizes known tools", () => {
		expect(isToolName("get_trade_with_enrichment")).toBe(true)
		expect(isToolName("get_account_context")).toBe(true)
	})

	it("rejects unknown names", () => {
		expect(isToolName("get_all_users_trades")).toBe(false)
		expect(isToolName("")).toBe(false)
		expect(isToolName("DROP TABLE trades")).toBe(false)
	})
})

describe("dispatchTool — unknown name", () => {
	it("throws on unknown tool name (defends against an LLM inventing one)", async () => {
		await expect(dispatchTool("evil_tool", {})).rejects.toThrow(/Unknown tool/)
	})
})
