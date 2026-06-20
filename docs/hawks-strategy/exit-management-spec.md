# Hawks Exit-Management Spec (v0.10)

> Status: **DRAFT — awaiting Ygor's line-by-line sign-off before any code lands.**
> Locked in conversation with Ygor on 2026-06-14. This doc is the single source of truth for how Hawks trades exit. Once signed off, it freezes; further changes require an explicit "spec update" turn.

---

## §0 The "why"

Today's engine has a single exit primitive: a static 3:1 OCO (one stop, one take-profit at 3R). Hawks reality is richer — there are three trade-management approaches Ygor uses live, each suited to a different market personality:

- **Conservative** — fixed 3R target, accept the cap.
- **Moderate** — let winners run beyond 3R via a 2-brick trailing stop.
- **Fibo** — exit at a measured-move projection from the 15m last impulse, optionally with the trail running alongside.

All three share two universal primitives:

1. **Breakeven-at-1R-favor** — once price has moved 2 bricks (= 1R) in trade-favorable direction (Renko close-based), the stop moves to entry.
2. **Cooldown / OCO discipline** — one open position per playbook, one stop, one target (or no target if running pure trail).

Rather than encode "Conservative", "Moderate", "Fibo" as 3 monolithic modes, this spec defines them as **compositions of two orthogonal axes**: the target rule and the trail-after-3R toggle.

---

## §1 The canonical unit: 1 brick = 1 unit of risk

Throughout this spec, **R is measured in bricks**, not points. The renko size for WIN is the brick size of the active hawks-renko-sizes triple (`bricksizes` row for the trade date). Two consequences:

- **1R = 2 brick bodies = `2 × renkoSize`** of net price movement (favorable or adverse).
- **All distance measurements are brick-close based** (net price distance since entry), never raw price-tick. Triggers fire only on bricks that close favorable.
- **The stop is always 2 brick bodies adverse of entry**. For a SHORT at brick X's close, stop = `X.close + (2 × renkoSize)`. Symmetric for LONG.
- **3R favor = `6 × renkoSize` net favorable price distance** measured at a favorable brick close.

Ygor's exact spec phrase (2026-06-14): _"always in brick sizes, always Renko close-based, never fixed points."_

---

## §2 The universal primitive: breakeven-at-1R-favor

**Applies to every exit mode**, no opt-out.

### Rule (locked 2026-06-14 — net-distance semantics)

When the **net favorable price distance since entry** reaches 1R (= 2 brick bodies = `2 × renkoSize`) AND the current brick closes favorable, the stop is moved to the entry price.

> **Why net-distance, not favorable-brick count.** Pedro's rule mirrors how a broker bracket order evaluates: when realized P&L equals R in your favor, lock breakeven. Counting favorable bricks while ignoring adverse ones would trigger BE in mixed sequences (red→green→red→red) before the trade is net-favorable, which doesn't reflect real exposure. Net distance + favorable-close gate gives Renko-correct semantics: ticks don't move the stop, only confirmed brick closes do, and only when the net move is fully 1R.

### Mechanics

- **SHORT:** trigger when `currentBrick.close ≤ entry.close − (2 × renkoSize)` AND `currentBrick.close < currentBrick.open`.
- **LONG:** trigger when `currentBrick.close ≥ entry.close + (2 × renkoSize)` AND `currentBrick.close > currentBrick.open`.

On trigger, `stop = entry.close`. From that brick onward, the stop is locked at entry until either (a) it gets hit (zero P&L exit), (b) a later trailing rule moves it further favorable, or (c) the target is hit.

### Edge cases

- **Brick that takes you to 2R or 3R from a 1-brick start.** Renko cannot move 2 bricks in a single tick — a brick fully forms only when price moves a full brick-size. So this can't happen by construction. Skip handling it.
- **Adverse brick after breakeven trigger.** Stop already at entry; if the adverse brick hits the stop, you exit at 0 P&L. Working as intended.
- **Trade entered exactly at the close of an unfavorable brick.** First favorable brick must form after entry. The entry brick itself does NOT count toward distance.

### Implementation note

This is the existing `on_pct_risk` breakeven config (`triggerPct: 100`) in `src/lib/backtest/modules/stop/breakeven.ts`, combined with `triggerMode: "brick_close"`. Phase B wires the trigger-mode into the hawks preset; no new module needed.

---

## §3 The composition matrix

Exit configuration is two orthogonal switches:

|                                  | Target rule                    | Trail-after-3R |
| -------------------------------- | ------------------------------ | -------------- |
| **Mode 1 — Conservative**        | Static `+3R`                   | Off            |
| **Mode 2 — Moderate**            | None (pure trail)              | On             |
| **Mode 3a — Fibo (target only)** | Fibo measured-move at T1/T2/T3 | Off            |
| **Mode 3b — Fibo + Trail**       | Fibo measured-move at T1/T2/T3 | On             |

**Both axes are decoupled.** A playbook can mix-and-match. The four cells above are the only ones that ship in v0.10; combinations like "trail with no target trigger condition" are intentionally excluded.

Each playbook config will carry two fields:

```ts
exitConfig: {
	targetRule: "static3R" | "fibo_T1" | "fibo_T2" | "fibo_T3" | "trail_only"
	trailAfter3R: boolean
}
```

`targetRule: "trail_only"` is what Mode 2 uses (no target, pure trail). Combined with `trailAfter3R: true`, it means "after 3R hit, ride the trail forever." `trailAfter3R: false` with `targetRule: "trail_only"` is excluded (would be a stop-only trade with no exit logic at all — fail fast).

---

## §4 Target rule: static 3R (Mode 1)

The simplest. Static stop + static take-profit at 6 favorable bricks from entry.

- **SHORT entry at `X.close`:** target = `X.close - (6 × renkoSize)`.
- **LONG entry at `X.close`:** target = `X.close + (6 × renkoSize)`.

Target price is locked at fire time. Doesn't recompute on later bricks.

OCO: stop hit OR target hit, whichever first.

---

## §5 Target rule: fibo measured-move (Mode 3a/3b)

This is **the measured-move projection** Ygor described in Image #13 — NOT a textbook Fib extension. The legs are assumed equal-magnitude and the targets are discounts on that equality.

### Anchors

Two 15m structural pivots are needed:

- **For SHORT:** the 15m last topo (impulse start) and the 15m last fundo (impulse end). Impulse direction = down.
- **For LONG:** the 15m last fundo (impulse start) and the 15m last topo (impulse end). Impulse direction = up.

Pivots use the **same period-2 detector** as 5m (`stepStructuralPivot` in `hawks-structural-pivots.ts`), just fed 15m bricks. The HtfWalker (Phase C build step) will surface them alongside today's `gate60m` / `gate15m`.

### Retracement-peak anchor

The projection is anchored at the **retracement peak** — the local high (for SHORT) or low (for LONG) of the corrective rally we're shorting/longing against, captured at fire time.

These are already tracked in the 5m loop today as:

- `runningHighSinceLastTopo` (for SHORT)
- `runningLowSinceLastFundo` (for LONG)

Captured **at fire-time snapshot**, locked for the duration of the trade.

### Impulse size

```
impulseSize = |topo15m.price - fundo15m.price|
```

For SHORT: `topo15m.price - fundo15m.price` (positive).
For LONG: `topo15m.price - fundo15m.price` (also positive — absolute value).

### Target prices

Three targets, **only one is selected** per trade via `targetRule`:

```
T1 (76.4%):  retracementPeak ± (impulseSize × 0.764)
T2 (100%):   retracementPeak ± (impulseSize × 1.000)
T3 (161.8%): retracementPeak ± (impulseSize × 1.618)
```

Sign:

- **SHORT:** subtract from retracementPeak (target is below it).
- **LONG:** add to retracementPeak (target is above it).

### Insufficient 15m anchors

If at fire time there is no confirmed 15m topo AND fundo in the favorable direction (e.g. day just started, no 15m pivots yet, or both pivots are wrong-direction), use **the most recent confirmed 15m pair in the favorable direction**, even from earlier sessions. Pivots persist across day boundaries per the same rule as 5m structure.

If **no such pair exists at all** in the session history available to the engine: **the trade fires stop-only** (no target), and only the trail-after-3R rule (if enabled) can exit. If the trail is also disabled, the fire is **blocked** — stop-only with no exit mechanism would ride a trade forever with no termination criterion.

### Target rounding

Target prices are continuous; renko bricks are discrete. The engine **does NOT snap targets to brick boundaries**. The OCO triggers when intraday tick price crosses the target — same semantics as a broker bracket order. Visual rendering in the lab uses the raw continuous price.

---

## §6 Target rule: trail-only (Mode 2)

There is no take-profit target. The trade can ONLY exit via:

1. The static stop being hit before 3R is reached, OR
2. The trail (after 3R is reached) catching up.

Requires `trailAfter3R: true`. Combination `targetRule: "trail_only" + trailAfter3R: false` is invalid (rejected at config-validation time).

---

## §7 Trail-after-3R primitive

**Applies when `trailAfter3R: true`**, regardless of target rule.

### Activation

Two things must be true:

1. Net favorable price distance since entry has reached **`6 × renkoSize` (= 3R)** AND the current brick closed favorable. (Same net-distance + favorable-close semantics as §2.)
2. The take-profit has NOT yet fired (always true in Mode 2 by construction; in Mode 3b, the trail may activate before the chosen Fib target is hit, depending on order).

On activation, **the static stop is replaced** by a trailing stop.

### Trail rule

On every brick close after activation:

- **SHORT:** `stop = currentBrickClose + (2 × renkoSize)`. Only updates if the new value is more favorable than the current stop (never moves adversely).
- **LONG:** `stop = currentBrickClose - (2 × renkoSize)`. Only updates if more favorable.

The trail is "**2 bricks behind**" the latest brick close, recomputed on each new brick close.

### Interaction with the breakeven primitive

Breakeven moves the stop to entry at 1R. Trail-after-3R re-moves it dynamically from 3R onward. Between 1R and 3R, the stop sits at entry (locked profit at zero loss). At 3R, the trail takes over and the stop ratchets favorable with each brick close.

### Doji and adverse bricks during trail

The trail rule says "update on each brick close." A doji or adverse brick still produces a brick-close event. Two interpretations and the spec picks one:

- **(LOCKED)** The trail updates on the LATEST brick close, **regardless of color**. If the latest brick was adverse (close moves against trade direction), the new computed stop value is MORE adverse than the current trailing stop — and the "never moves adversely" rule kicks in. So adverse bricks effectively don't move the stop. Doji bricks have close ≈ open; new stop = close ± 2 brickSize; whether it moves the stop depends on whether `close ± 2 brickSize` is more favorable than current. In practice doji rarely moves it.

---

## §8 Engine flow (per brick, post-entry)

```pseudo
on every 5m brick close for an open trade:
  1. Has the stop been hit during this brick?
     → exit at stop price, close trade.

  2. Has the take-profit target been hit during this brick?
     → exit at target price, close trade.

  3. Compute net favorable distance:
     - SHORT: netFavor = entry.close − brick.close
     - LONG:  netFavor = brick.close − entry.close
     (Negative means brick is net-adverse vs entry.)

  4. If breakeven not yet triggered AND brick closed favorable AND
     netFavor ≥ (2 × renkoSize):
     → move stop to entry price (breakeven primitive).

  5. If trailAfter3R is true AND trail not yet active AND brick closed
     favorable AND netFavor ≥ (6 × renkoSize):
     → activate trail; replace static stop with trailing stop computed
       from this brick's close.

  6. If trail is active:
     → newStop = brick.close ± (2 × renkoSize) in trade-direction
     → if newStop is more favorable than current stop, update stop;
       else hold (never moves adversely).

  7. Persist exit state for next brick.
```

### Order of stop vs target check

If both stop AND target are between the prior brick's close and this brick's close (improbable but possible on gaps), the engine resolves by **time-priority** — whichever was hit FIRST during the brick's intra-period tick stream. Since the engine doesn't have tick data, this v1 falls back to: **stop wins on ties** (conservative). Trail-active trades follow the same rule.

---

## §9 Per-playbook engine variant (architecture)

Today's `processHawksPlaybookCandle` is a shared orchestrator dispatching to all 3 playbook stubs. v0.10 splits this into:

### File layout

```
src/lib/backtest/modules/entry/playbooks/
  mean-reversion.ts       (Phase G — real logic)
  retracement.ts          (Phase H — real logic)
  vwap-rejection.ts       (Phase I — real logic)
  types.ts                (existing)

src/lib/backtest/modules/exit/
  exit-state.ts           (new, Phase B)
  breakeven.ts            (new, Phase B)
  trail-after-3r.ts       (new, Phase D)
  fibo-target.ts          (new, Phase E)
  static-3r-target.ts     (new, Phase B, extracted from current OCO)
  orchestrator.ts         (new, Phase B — composes the primitives)

src/lib/backtest/modules/entry/
  hawks-playbook.ts       (existing — stays as the "all playbooks" orchestrator)
  hawks-mean-reversion-only.ts   (new, Phase F)
  hawks-retracement-only.ts      (new, Phase F)
  hawks-vwap-rejection-only.ts   (new, Phase F)
```

### Per-playbook config

Each playbook's `evaluate()` returns a `PlaybookFire` that carries its preferred exit config:

```ts
interface PlaybookFire {
	id: PlaybookId
	direction: "long" | "short"
	// ...existing fields...
	exitConfig: {
		targetRule: "static3R" | "fibo_T1" | "fibo_T2" | "fibo_T3" | "trail_only"
		trailAfter3R: boolean
	}
}
```

Defaults (locked in this spec, can be tuned later via the per-playbook config):

- **mean_reversion:** `{ targetRule: "static3R", trailAfter3R: false }` (Mode 1)
- **retracement:** `{ targetRule: "fibo_T2", trailAfter3R: true }` (Mode 3b — fibo to 100% with trail)
- **vwap_rejection:** `{ targetRule: "static3R", trailAfter3R: true }` (Mode 2 with a 3R cap)

These are starting points. Phase J (validation scrub) is where Ygor adjusts them.

### Engine lab UI

The lab gains a **playbook switcher** and an **exit-mode switcher** (only the exit-mode visualizer; the actual exit-mode is determined per playbook). Three new cursor-reactive badges:

- **Exit state** — current stop price, current target price (or "trailing"), favorable brick count.
- **15m impulse** — last topo/fundo, impulse size in points and ticks.
- **Fib levels** — overlay of T1/T2/T3 prices when the cursor is on a brick that has fibo exit config.

---

## §10 Interaction with existing entry gates

This spec **does NOT change any entry gate**. The following continue to gate every fire (from `hawks-engine-lab-data.ts`):

- 60m direction gate
- VB (Virada de Box) — fire only on color-flip
- Leg shape (expansion ≥ 4, retraction ≥ 2, 1-brick noise absorbed)
- 5m HH/LL running-extreme — `runningHigh < lastTopo` for SHORT, `runningLow > lastFundo` for LONG
- Gate stability (prior brick's gate60m matches)
- Cooldown (5 bricks since last fire)
- In-window

Once a fire passes all those, the playbook's `evaluate()` returns its `PlaybookFire` including the exit config. The new exit-management orchestrator takes over from there.

---

## §11 Acceptance criteria for the v0.10 wave (Phase J)

Ygor will scrub at least 10 catalogued days in the engine lab, per-playbook, with each exit mode visible. Pass criterion (his exact quote, 2026-06-13): _"On every day I looked, the entries are correct."_

Specific checks during the scrub:

1. **Every fire's breakeven event** is visible on the chart (stop moves to entry at exactly 2 favorable bricks). Verify with the cursor badge.
2. **Every Mode 3 fire has a visible Fib overlay** at fire time, anchored correctly to the 15m last impulse.
3. **Every trail-after-3R event** shows the moment of activation (6 favorable bricks = 3R) and the stop ratcheting on each subsequent brick close.
4. **Per-playbook view** in the lab shows ONLY that playbook's fires; the integrated view shows all three with no contamination.
5. **No false-positive fires** from chop / noise — the existing entry gates plus a `mean_reversion` playbook that intentionally fires INSIDE chop (its design) are visually distinguishable from `retracement` and `vwap_rejection` fires that should reject chop.

If any of the 5 checks fails, the wave returns to the offending phase (B/D/E/F/G/H/I) and re-validates.

---

## §12 Open questions (intentionally left for spec sign-off)

These are points I (Arch) want Ygor to either confirm or override before this spec freezes:

### Q1 — Playbook default exit configs (§9)

Are the defaults I picked sensible?

- mean_reversion → Mode 1 (Conservative, static 3R)
- retracement → Mode 3b (Fibo T2 + trail)
- vwap_rejection → Mode 2-ish (static 3R + trail)

Honest read: I don't know mean-reversion or vwap-rejection well enough to call. Override any/all.

### Q2 — Trail-after-3R interaction with Fibo target (§7)

In Mode 3b, both a Fib target AND the trail-after-3R are active. The trail can move the stop favorable beyond the target's R-distance if the trade reaches 3R before reaching the Fib target. Two cases:

- **Fib target near (T1 ≈ 1R-2R):** trade likely hits target before 3R; trail never activates. Fine.
- **Fib target far (T3 ≈ 5R+):** trade hits 3R first → trail activates → trail likely closes the trade before reaching T3.

Is this what you want — trail can short-circuit far Fib targets? Or should the trail be suppressed when a Fib target is set?

### Q3 — Multiple per-playbook open positions

Today the cooldown is **5 bricks per orchestrator** (`lastFireBrickIndex`). Once we split into per-playbook engines, does each playbook have its own cooldown counter, or does the cooldown stay global?

I assume **per-playbook cooldown** (each is an independent strategy), but spec it. Confirm.

### Q4 — Stop adjustment after breakeven if the trail is NOT enabled

Mode 1 and Mode 3a both have `trailAfter3R: false`. In these modes, after breakeven moves the stop to entry, does the stop stay at entry forever (until target hits) — yes? — or does any other mechanism move it favorable before the target?

My read: stop stays at entry. No mid-trade tightening. Simpler is better. Confirm.

### Q5 — Lab visualization: what should the Fib overlay look like?

Three options, pick one:

- **(a) Three horizontal lines** at T1/T2/T3 with labels. Anchor line is invisible.
- **(b) Three horizontal lines + dashed anchor line** showing the 15m impulse (topo to fundo) and projection.
- **(c) Three horizontal bands** (filled rectangles between thresholds) with target labels.

I lean (b) — most informative for catalog scrubbing. Override if needed.

---

## §13 Build order recap

(Same as Phase A→J in TaskCreate; restated here for the spec record.)

- **A — Spec doc** (this file). Sign off.
- **B — Breakeven primitive + Conservative mode refactor.** Validate in lab.
- **C — 15m pivot stream in HtfWalker.** Validate via overlay.
- **D — Moderate exit mode (trail-after-3R).** Validate in lab.
- **E — Fibo exit mode + lab overlay.** Validate in lab.
- **F — Per-playbook engine split.** Validate per-playbook view.
- **G — Mean-reversion playbook real logic.** Validate fires.
- **H — Retracement playbook real logic.** Validate fires.
- **I — VWAP-rejection playbook real logic.** Validate fires.
- **J — 10-day scrub with Ygor.** Sign off the whole wave.

Each phase ends with a smoke-test in the lab + a commit. No PR — Ygor opens manually.

---

## Sign-off checklist (Ygor)

Read line-by-line. For each item, answer agree / disagree / change-to-X:

- §1 (1R = 2 bricks, Renko close-based, no fixed points)
- §2 (breakeven = 2 favorable bricks → stop at entry, applies to all modes)
- §3 (composition matrix — 4 valid mode-cells; "trail_only + no trail" rejected)
- §4 (static 3R target)
- §5 (Fibo measured-move math + 15m anchors + retracement-peak anchor + insufficient-anchor fallback + no rounding)
- §6 (trail_only = no target)
- §7 (trail = 2 bricks behind latest close, activates at 3R, never moves adversely)
- §8 (engine flow ordering; stop wins ties)
- §9 (per-playbook split + default exit configs from Q1)
- §10 (existing entry gates unchanged)
- §11 (acceptance criteria for Phase J)
- §12 (Q1–Q5 open questions)

Once every section has an explicit agree (or change), the spec freezes and Phase B starts.
