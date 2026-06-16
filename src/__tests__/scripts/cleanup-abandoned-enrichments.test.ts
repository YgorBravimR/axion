import { describe, it, expect } from "vitest"
import { findExpiredDraftIds } from "@/lib/enrichment/cleanup-logic"

describe("findExpiredDraftIds", () => {
	it("returns empty array when no snapshots exist", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const result = findExpiredDraftIds([], now)
		expect(result).toEqual([])
	})

	it("filters out committed snapshots", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "committed" as const,
				expires_at: new Date("2026-06-15T10:00:00Z"),
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual([])
	})

	it("filters out abandoned snapshots", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "abandoned" as const,
				expires_at: new Date("2026-06-15T10:00:00Z"),
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual([])
	})

	it("filters out draft snapshots with no expiry", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "draft" as const,
				expires_at: null,
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual([])
	})

	it("filters out draft snapshots that haven't expired yet", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "draft" as const,
				expires_at: new Date("2026-06-20T10:00:00Z"),
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual([])
	})

	it("includes draft snapshots that have expired", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "draft" as const,
				expires_at: new Date("2026-06-15T10:00:00Z"),
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual(["snap-1"])
	})

	it("includes only expired draft snapshots when mixed with other statuses", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const expiredTime = new Date("2026-06-15T10:00:00Z")
		const futureTime = new Date("2026-06-20T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "draft" as const,
				expires_at: expiredTime,
			},
			{
				id: "snap-2",
				status: "committed" as const,
				expires_at: expiredTime,
			},
			{
				id: "snap-3",
				status: "draft" as const,
				expires_at: futureTime,
			},
			{
				id: "snap-4",
				status: "draft" as const,
				expires_at: expiredTime,
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual(["snap-1", "snap-4"])
	})

	it("handles string dates as well as Date objects", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-1",
				status: "draft" as const,
				expires_at: "2026-06-15T10:00:00Z",
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual(["snap-1"])
	})

	it("preserves order of expired snapshots", () => {
		const now = new Date("2026-06-16T10:00:00Z")
		const snapshots = [
			{
				id: "snap-a",
				status: "draft" as const,
				expires_at: new Date("2026-06-10T10:00:00Z"),
			},
			{
				id: "snap-b",
				status: "draft" as const,
				expires_at: new Date("2026-06-12T10:00:00Z"),
			},
			{
				id: "snap-c",
				status: "draft" as const,
				expires_at: new Date("2026-06-14T10:00:00Z"),
			},
		]
		const result = findExpiredDraftIds(snapshots, now)
		expect(result).toEqual(["snap-a", "snap-b", "snap-c"])
	})
})
