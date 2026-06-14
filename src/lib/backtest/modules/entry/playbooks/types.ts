/**
 * Playbook contract for the Hawks engine v0.9.
 *
 * A playbook is a named 5m entry rule. Each playbook owns:
 *   - `id` — stable string ID, recorded on every trade row and used to
 *     filter / aggregate downstream.
 *   - `evaluate(ctx)` — pure per-brick check. Given the orchestrator's
 *     context (current brick, prior bricks today, indicator readout,
 *     direction allowed by the 60m gate), the playbook returns either
 *     `null` (no fire) or a `PlaybookFire` describing where the stop &
 *     target should be placed.
 *
 * Playbooks are **stateless across bricks** from the orchestrator's
 * perspective. Any history a playbook needs (e.g. "K bricks of
 * extension before snapback") is derived from `ctx.priorBricks` at
 * evaluation time. This keeps state ownership inside the orchestrator
 * and avoids the v0.6 / v0.8 pattern where playbook-specific fields
 * leaked into the shared `HawksState`.
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md
 */

import type { CandleRow } from "@/types/candle"
import type { Direction } from "@/types/backtest"

export type PlaybookId = "mean_reversion" | "retracement" | "vwap_rejection"

export interface PlaybookContext {
	/** The brick that just closed. Trigger evaluation is at this brick's close. */
	brick: CandleRow
	/** Bricks earlier today, oldest → most recent. Excludes `brick`. */
	priorBricks: ReadonlyArray<CandleRow>
	/** Index of `brick` in the current day (0-based). */
	brickIndexInDay: number
	/** Direction the 60m gate allows. Playbooks must respect this. */
	direction: Direction
	/** brickSize in points for this brick (dynamic from brick body). */
	brickSize: number
	/** Indicator key map from the recipe config. */
	indicatorKeys: PlaybookIndicatorKeys
}

export interface PlaybookIndicatorKeys {
	/** 5m fast EMA key. Used by mean_reversion. */
	ema_fast_5m_key: string
	/** 5m slow EMA key. */
	ema_slow_5m_key: string
	/** Daily VWAP key. Used by vwap_rejection. */
	vwap_d_key: string
}

/**
 * Per-playbook exit configuration. Each playbook carries its own
 * preferred exit recipe; the engine's exit-management orchestrator
 * consumes this to pick the right target rule and trail behaviour
 * for the trade. Spec §9 (Phase F).
 *
 *   - `targetRule`:
 *       "static3R" — fixed 3R (= 6 brick bodies) take-profit, OCO with
 *         the static stop. The conservative default.
 *       "fibo_T1" / "fibo_T2" / "fibo_T3" — 15m measured-move target
 *         at 76.4 / 100 / 161.8% of the impulse, anchored at the
 *         retracement peak (spec §5).
 *       "trail_only" — no take-profit; only the trail-after-3R can
 *         exit. Requires `trailAfter3R: true` (validated at
 *         config-build time).
 *   - `trailAfter3R`: when true, after net favor reaches 3R AND a
 *     brick closes favorable, the static stop is replaced by a
 *     2-brick-behind trail that ratchets favorable on each subsequent
 *     brick close (spec §7).
 */
export type ExitTargetRule =
	| "static3R"
	| "fibo_T1"
	| "fibo_T2"
	| "fibo_T3"
	| "trail_only"

export interface PlaybookExitConfig {
	targetRule: ExitTargetRule
	trailAfter3R: boolean
}

export interface PlaybookFire {
	/** Which playbook fired. */
	id: PlaybookId
	/** Entry price (must be `brick.close` for v0.9). */
	price: number
	/** Suggested stop price (engine consumes as `signal.stopReference`). */
	stopReference: number
	/** Human-readable label for chart / debug. */
	label: string
	/**
	 * Exit configuration this playbook prefers for this fire. The engine's
	 * exit-management orchestrator consumes this; see spec §9.
	 */
	exitConfig: PlaybookExitConfig
}

/**
 * Locked defaults for each playbook (spec §9, signed off 2026-06-14).
 * Starting points only — Phase J's validation scrub is where the user
 * may override per playbook.
 */
export const PLAYBOOK_EXIT_DEFAULTS: Readonly<
	Record<PlaybookId, PlaybookExitConfig>
> = {
	mean_reversion: { targetRule: "static3R", trailAfter3R: false },
	retracement: { targetRule: "fibo_T2", trailAfter3R: true },
	vwap_rejection: { targetRule: "static3R", trailAfter3R: true },
}

export interface Playbook {
	id: PlaybookId
	evaluate(_ctx: PlaybookContext): PlaybookFire | null
}

/**
 * Priority order for the primary playbook tag when multiple fire on the
 * same brick. See spec §6. All fired playbooks are still recorded in
 * `playbooksFired[]` regardless of priority.
 */
export const PLAYBOOK_PRIORITY: readonly PlaybookId[] = [
	"retracement",
	"vwap_rejection",
	"mean_reversion",
]
