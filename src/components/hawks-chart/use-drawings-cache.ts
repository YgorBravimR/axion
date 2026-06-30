"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { syncDrawings } from "@/app/actions/hawks-chart-drawings"
import type { Drawing } from "./drawings"

// localStorage-first cache for hawks-chart drawings.
//
// Lifecycle:
//   1. Mount — merge the SSR-loaded server list with whatever's already in
//      localStorage. Conflict tiebreaker: higher `lastModifiedMs` wins per
//      id (server `updated_at` round-trips through that field). Local
//      tombstones (ids in the deleted set) shadow server entries until
//      the next successful flush.
//   2. Every mutation (add/update/remove/clearAll) writes synchronously to
//      both React state AND localStorage — no network in the hot path.
//   3. A debounced background flush diffs the current localStorage against
//      the last-synced snapshot and posts the delta to `syncDrawings`.
//      Throttle = FLUSH_DEBOUNCE_MS (5s); also force-flushed on
//      `visibilitychange === hidden` and `beforeunload` so closing the tab
//      doesn't drop the last 5s of edits.
//   4. A `storage` event listener mirrors edits from sibling tabs into
//      local state (multi-tab live sync, same-origin only — `storage`
//      doesn't fire in the tab that wrote it, only siblings, so there's
//      no self-loop).
//
// Failure modes:
//   - Server flush errors → leave localStorage untouched, surface the
//     error via `lastSyncError`, retry on next debounce tick. User keeps
//     drawing without interruption.
//   - localStorage write fails (private mode, quota): drawings still work
//     in-memory, just don't survive a reload.
//   - Stale snapshot vs. current after a slow flush completes: the diff
//     algorithm re-computes against the latest localStorage, so a flush
//     in flight while the user keeps editing only delays — never loses.

const FLUSH_DEBOUNCE_MS = 5000

// Tombstone TTL — how long to remember "this id was deleted locally" so
// the diff knows to send a tombstone to the server. Cleared after a
// successful flush includes the id. The 24-hour ceiling is just a safety
// net for the pathological case where a flush keeps failing — we don't
// want tombstones piling up forever in localStorage.
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000

interface DrawingsCacheState {
	readonly drawings: ReadonlyArray<Drawing>
	readonly lastSyncError: string | null
	readonly lastSyncedAt: number | null
}

interface DrawingsCacheApi {
	readonly drawings: ReadonlyArray<Drawing>
	readonly lastSyncError: string | null
	readonly lastSyncedAt: number | null
	readonly setDrawings: (
		_updater: (_prev: ReadonlyArray<Drawing>) => ReadonlyArray<Drawing>
	) => void
	readonly add: (_drawing: Drawing) => void
	readonly update: (_drawing: Drawing) => void
	readonly remove: (_id: string) => void
	readonly clearAll: () => void
	readonly flushNow: () => Promise<void>
}

const storageKey = (assetSymbol: string): string =>
	`hawks-chart:drawings:${assetSymbol}`

const tombstoneKey = (assetSymbol: string): string =>
	`hawks-chart:drawings:${assetSymbol}:tombstones`

interface PersistedShape {
	readonly drawings: Drawing[]
	readonly version: 1
}

interface TombstonesShape {
	// id → epoch ms when the deletion happened.
	readonly entries: Record<string, number>
	readonly version: 1
}

const readLocal = (assetSymbol: string): Drawing[] => {
	if (typeof window === "undefined") {
		return []
	}
	try {
		const raw = window.localStorage.getItem(storageKey(assetSymbol))
		if (!raw) {
			return []
		}
		const parsed = JSON.parse(raw) as PersistedShape
		if (parsed.version !== 1 || !Array.isArray(parsed.drawings)) {
			return []
		}
		return parsed.drawings
	} catch {
		// Malformed JSON, quota errors, private-mode access denial — fall
		// back to "no local cache" and let the SSR list seed it.
		return []
	}
}

const writeLocal = (
	assetSymbol: string,
	drawings: ReadonlyArray<Drawing>
): void => {
	if (typeof window === "undefined") {
		return
	}
	try {
		const shape: PersistedShape = {
			drawings: [...drawings],
			version: 1,
		}
		window.localStorage.setItem(storageKey(assetSymbol), JSON.stringify(shape))
	} catch {
		// Quota exceeded or private mode — swallow; in-memory state still
		// works, the user will just lose persistence on reload.
	}
}

const readTombstones = (assetSymbol: string): Map<string, number> => {
	if (typeof window === "undefined") {
		return new Map()
	}
	try {
		const raw = window.localStorage.getItem(tombstoneKey(assetSymbol))
		if (!raw) {
			return new Map()
		}
		const parsed = JSON.parse(raw) as TombstonesShape
		if (parsed.version !== 1) {
			return new Map()
		}
		// Prune entries older than the TTL — they'd never be useful (their
		// server-side counterpart has either already been deleted or has
		// drifted so far that local "I deleted this" doesn't translate).
		const cutoff = Date.now() - TOMBSTONE_TTL_MS
		const out = new Map<string, number>()
		for (const [id, ts] of Object.entries(parsed.entries)) {
			if (ts >= cutoff) {
				out.set(id, ts)
			}
		}
		return out
	} catch {
		return new Map()
	}
}

const writeTombstones = (
	assetSymbol: string,
	tombstones: Map<string, number>
): void => {
	if (typeof window === "undefined") {
		return
	}
	try {
		const shape: TombstonesShape = {
			entries: Object.fromEntries(tombstones),
			version: 1,
		}
		window.localStorage.setItem(
			tombstoneKey(assetSymbol),
			JSON.stringify(shape)
		)
	} catch {
		// ignore
	}
}

// Merge SSR-loaded server drawings with the local cache. Tie-break by
// `lastModifiedMs` per id (newer wins). Local tombstones shadow server
// entries — i.e. if the user deleted X locally and the next page load
// fetched X again before the flush landed, the deletion sticks.
const mergeServerAndLocal = (
	serverDrawings: ReadonlyArray<Drawing>,
	localDrawings: ReadonlyArray<Drawing>,
	tombstones: Map<string, number>
): Drawing[] => {
	const byId = new Map<string, Drawing>()
	for (const d of serverDrawings) {
		if (tombstones.has(d.id)) {
			continue
		}
		byId.set(d.id, d)
	}
	for (const d of localDrawings) {
		if (tombstones.has(d.id)) {
			continue
		}
		const existing = byId.get(d.id)
		if (!existing || d.lastModifiedMs >= existing.lastModifiedMs) {
			byId.set(d.id, d)
		}
	}
	return Array.from(byId.values())
}

const useDrawingsCache = (
	assetSymbol: string,
	initialDrawings: ReadonlyArray<Drawing>
): DrawingsCacheApi => {
	// One-time merge on mount. We initialise lazily so the localStorage
	// reads happen exactly once per mount, never during a render that
	// could re-run.
	const [state, setState] = useState<DrawingsCacheState>(() => {
		const local = readLocal(assetSymbol)
		const tombstones = readTombstones(assetSymbol)
		const merged = mergeServerAndLocal(initialDrawings, local, tombstones)
		// Seed localStorage so the next mount starts from the merged set
		// rather than the pre-merge local-only view.
		writeLocal(assetSymbol, merged)
		return {
			drawings: merged,
			lastSyncError: null,
			lastSyncedAt: null,
		}
	})

	// Snapshot of what the server most recently confirmed — used by the
	// diff algorithm to compute upserts/deletes for the next flush. After
	// the merge on mount we treat the server's view as authoritative for
	// "what the server thinks exists", then the diff naturally pushes the
	// merge-time decisions on the first flush.
	const lastSyncedRef = useRef<Map<string, number>>(new Map())
	useEffect(() => {
		const initial = new Map<string, number>()
		for (const d of initialDrawings) {
			initial.set(d.id, d.lastModifiedMs)
		}
		lastSyncedRef.current = initial
		// Intentionally NO dep on initialDrawings — the value is meant to
		// reflect the SSR snapshot at mount, not refresh on every render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const tombstonesRef = useRef<Map<string, number>>(readTombstones(assetSymbol))
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isFlushingRef = useRef<boolean>(false)
	// Holds the LATEST drawings array — used inside scheduleFlush's async
	// closure so a flush that fires after a render sees the fresh data.
	const drawingsRef = useRef<ReadonlyArray<Drawing>>(state.drawings)

	const flushNow = useCallback(async (): Promise<void> => {
		if (isFlushingRef.current) {
			return
		}
		const current = drawingsRef.current
		const tombstones = tombstonesRef.current
		const lastSynced = lastSyncedRef.current

		// Diff against last-synced snapshot:
		//   upserts = drawings whose lastModifiedMs differs (or never seen)
		//   deletes = tombstoned ids the server hasn't been told about
		const upserts: Drawing[] = []
		for (const d of current) {
			const synced = lastSynced.get(d.id)
			if (synced === undefined || synced < d.lastModifiedMs) {
				upserts.push(d)
			}
		}
		const deletedIds: string[] = []
		for (const id of tombstones.keys()) {
			// Only send tombstones for ids the server still knows about (or
			// might know about — we can't tell without a round-trip). Safe
			// default: send them all; the server treats unknown ids as
			// already-deleted-no-op.
			deletedIds.push(id)
		}

		if (upserts.length === 0 && deletedIds.length === 0) {
			return
		}

		isFlushingRef.current = true
		try {
			const result = await syncDrawings({
				assetSymbol,
				upserts,
				deletedIds,
			})
			if (result.status === "error") {
				setState((prev) => ({ ...prev, lastSyncError: result.message }))
				return
			}
			// Server confirmed — update the last-synced snapshot using its
			// post-sync view (covers the case where another tab on another
			// machine touched the same row).
			const next = new Map<string, number>()
			for (const d of result.drawings) {
				next.set(d.id, d.lastModifiedMs)
			}
			lastSyncedRef.current = next
			// Tombstones we just successfully sent: clear them.
			for (const id of deletedIds) {
				tombstones.delete(id)
			}
			writeTombstones(assetSymbol, tombstones)
			setState((prev) => ({
				...prev,
				lastSyncError: null,
				lastSyncedAt: Date.now(),
			}))
		} catch (err) {
			setState((prev) => ({
				...prev,
				lastSyncError: err instanceof Error ? err.message : "Sync failed",
			}))
		} finally {
			isFlushingRef.current = false
		}
	}, [assetSymbol])

	const scheduleFlush = useCallback(() => {
		if (flushTimerRef.current) {
			clearTimeout(flushTimerRef.current)
		}
		flushTimerRef.current = setTimeout(() => {
			flushTimerRef.current = null
			void flushNow()
		}, FLUSH_DEBOUNCE_MS)
	}, [flushNow])

	// State updater that ALSO writes localStorage + schedules a flush.
	// Every mutation goes through this so we can't accidentally skip
	// persistence in one of the three add/update/remove paths.
	const applyChange = useCallback(
		(updater: (_prev: ReadonlyArray<Drawing>) => ReadonlyArray<Drawing>) => {
			setState((prev) => {
				const next = updater(prev.drawings)
				drawingsRef.current = next
				writeLocal(assetSymbol, next)
				return { ...prev, drawings: next }
			})
			scheduleFlush()
		},
		[assetSymbol, scheduleFlush]
	)

	const add = useCallback(
		(drawing: Drawing) => {
			applyChange((prev) => [...prev, drawing])
		},
		[applyChange]
	)

	const update = useCallback(
		(drawing: Drawing) => {
			applyChange((prev) =>
				prev.map((d) => (d.id === drawing.id ? drawing : d))
			)
		},
		[applyChange]
	)

	const remove = useCallback(
		(id: string) => {
			// Tombstone for the next flush so the server learns about the
			// deletion even if the drawing was never synced upstream.
			tombstonesRef.current.set(id, Date.now())
			writeTombstones(assetSymbol, tombstonesRef.current)
			applyChange((prev) => prev.filter((d) => d.id !== id))
		},
		[applyChange, assetSymbol]
	)

	const clearAll = useCallback(() => {
		// Stamp tombstones for every currently-known drawing so the next
		// flush wipes them on the server too. Reusing the per-id tombstone
		// path keeps the diff algorithm uniform (no special "clear all"
		// case to plumb through syncDrawings).
		const now = Date.now()
		for (const d of drawingsRef.current) {
			tombstonesRef.current.set(d.id, now)
		}
		writeTombstones(assetSymbol, tombstonesRef.current)
		applyChange(() => [])
	}, [applyChange, assetSymbol])

	// Multi-tab live sync. The `storage` event fires in OTHER tabs when
	// localStorage changes here (never in the writing tab itself, so no
	// self-loop). Pull the sibling tab's view in.
	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}
		const handler = (event: StorageEvent) => {
			if (event.key !== storageKey(assetSymbol)) {
				return
			}
			const next = readLocal(assetSymbol)
			drawingsRef.current = next
			setState((prev) => ({ ...prev, drawings: next }))
		}
		window.addEventListener("storage", handler)
		return () => {
			window.removeEventListener("storage", handler)
		}
	}, [assetSymbol])

	// Force-flush on tab hide / unload so the last 5 seconds of edits
	// don't fall on the floor when the user closes the tab.
	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}
		const handleHide = () => {
			void flushNow()
		}
		window.addEventListener("beforeunload", handleHide)
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") {
				void flushNow()
			}
		})
		return () => {
			window.removeEventListener("beforeunload", handleHide)
		}
	}, [flushNow])

	// Cleanup pending timer on unmount.
	useEffect(() => {
		return () => {
			if (flushTimerRef.current) {
				clearTimeout(flushTimerRef.current)
			}
		}
	}, [])

	// Generic setter — used by the workspace's edit-existing-drawing flow
	// that already builds the next array itself (rare). Keeps the API
	// surface tight at four well-known mutation paths plus this escape
	// hatch.
	const setDrawings = useCallback(
		(updater: (_prev: ReadonlyArray<Drawing>) => ReadonlyArray<Drawing>) => {
			applyChange(updater)
		},
		[applyChange]
	)

	return {
		drawings: state.drawings,
		lastSyncError: state.lastSyncError,
		lastSyncedAt: state.lastSyncedAt,
		setDrawings,
		add,
		update,
		remove,
		clearAll,
		flushNow,
	}
}

export { useDrawingsCache }
export type { DrawingsCacheApi }
