import { describe, it, expect } from "vitest"

import {
	projectIndicators,
	type HostPoint,
	type ProjectedSource,
} from "@/lib/renko/cross-tf-join"

const t = (minute: number): Date => new Date(Date.UTC(2026, 0, 1, 9, minute, 0))

describe("projectIndicators", () => {
	it("returns one row per host point, with null for sources with no closed point yet", () => {
		const host: HostPoint[] = [
			{ closeTimestamp: t(0) },
			{ closeTimestamp: t(5) },
			{ closeTimestamp: t(10) },
		]
		const sources: ProjectedSource[] = [
			{
				key: "mme27_15m",
				series: [
					{ closeTimestamp: t(15), value: 100 },
					{ closeTimestamp: t(30), value: 101 },
				],
			},
		]
		const out = projectIndicators(host, sources)
		expect(out).toEqual([
			{ mme27_15m: null },
			{ mme27_15m: null },
			{ mme27_15m: null },
		])
	})

	it("advances pointer monotonically as host time crosses each source close", () => {
		const host: HostPoint[] = [
			{ closeTimestamp: t(0) },
			{ closeTimestamp: t(5) },
			{ closeTimestamp: t(10) },
			{ closeTimestamp: t(15) },
			{ closeTimestamp: t(20) },
		]
		const sources: ProjectedSource[] = [
			{
				key: "mme27_15m",
				series: [
					{ closeTimestamp: t(5), value: 100 },
					{ closeTimestamp: t(15), value: 105 },
				],
			},
		]
		const out = projectIndicators(host, sources)
		expect(out.map((r) => r.mme27_15m)).toEqual([null, 100, 100, 105, 105])
	})

	it("inclusive boundary — point closing at exactly host time is visible", () => {
		const host: HostPoint[] = [{ closeTimestamp: t(10) }]
		const sources: ProjectedSource[] = [
			{
				key: "x",
				series: [{ closeTimestamp: t(10), value: 42 }],
			},
		]
		expect(projectIndicators(host, sources)).toEqual([{ x: 42 }])
	})

	it("projects multiple keys independently in one pass", () => {
		const host: HostPoint[] = [
			{ closeTimestamp: t(0) },
			{ closeTimestamp: t(20) },
			{ closeTimestamp: t(40) },
		]
		const sources: ProjectedSource[] = [
			{
				key: "mme27_15m",
				series: [
					{ closeTimestamp: t(10), value: 1 },
					{ closeTimestamp: t(30), value: 2 },
				],
			},
			{
				key: "mme27_60m",
				series: [{ closeTimestamp: t(35), value: 999 }],
			},
		]
		const out = projectIndicators(host, sources)
		expect(out).toEqual([
			{ mme27_15m: null, mme27_60m: null },
			{ mme27_15m: 1, mme27_60m: null },
			{ mme27_15m: 2, mme27_60m: 999 },
		])
	})

	it("propagates null-valued source points (warmup) without skipping ahead", () => {
		const host: HostPoint[] = [
			{ closeTimestamp: t(5) },
			{ closeTimestamp: t(15) },
			{ closeTimestamp: t(25) },
		]
		const sources: ProjectedSource[] = [
			{
				key: "mme27_15m",
				series: [
					{ closeTimestamp: t(5), value: null }, // warmup
					{ closeTimestamp: t(15), value: null }, // warmup
					{ closeTimestamp: t(20), value: 100 },
				],
			},
		]
		const out = projectIndicators(host, sources)
		expect(out.map((r) => r.mme27_15m)).toEqual([null, null, 100])
	})

	it("throws on duplicate source keys", () => {
		expect(() =>
			projectIndicators(
				[],
				[
					{ key: "x", series: [] },
					{ key: "x", series: [] },
				]
			)
		).toThrow(/Duplicate/)
	})

	it("is O(n+m): a single sweep handles 10k host × 10k source", () => {
		const host: HostPoint[] = Array.from({ length: 10_000 }, (_, i) => ({
			closeTimestamp: new Date(i * 60_000),
		}))
		const source: ProjectedSource = {
			key: "x",
			series: Array.from({ length: 10_000 }, (_, i) => ({
				closeTimestamp: new Date(i * 60_000),
				value: i,
			})),
		}
		const start = Date.now()
		const out = projectIndicators(host, [source])
		const elapsed = Date.now() - start
		expect(out).toHaveLength(10_000)
		expect(out[9_999]!.x).toBe(9_999)
		expect(elapsed).toBeLessThan(500)
	})
})
