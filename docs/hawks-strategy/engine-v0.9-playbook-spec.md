# Hawks engine v0.9 — playbook architecture (design spec)

**Status:** design — pre-implementation. This doc supersedes the monolithic
state-machine model documented in [`engine-and-quality.md`](./engine-and-quality.md)
(v0.6 — `WAVE_1` / `WAVE_2` phases). It is the authoritative spec for the
upcoming engine rebuild on top of the indicator modules validated in the
Indicator Lab (Groups A–G).

Companion docs:

- [`README.md`](./README.md) — Renko brick rules + BE/stop mechanics
- [`indicator-inventory.md`](./indicator-inventory.md) — `indicators` JSONB keys
- [`engine-and-quality.md`](./engine-and-quality.md) — v0.6 (legacy, for reference)

---

## 0. The "why" — one paragraph

WIN (mini-índice) is moved by institutional flow that is only legible on
higher timeframes. The 60m Renko tells you which side of the market the
elephant is on; trying to take the other side is fighting tape you cannot
see. So **60m is the one and only directional gate**. The 15m and 5m exist
to find a high-quality entry **in the direction the 60m endorses** — not to
overrule it. Within that direction, the same setup can present as several
different playable patterns (mean-reversion to an EMA, retracement of a
swing, rejection of a VWAP). The engine recognises each pattern as its own
**playbook** with its own trigger rule and confluence requirements, but all
playbooks share the same direction filter (60m) and the same OCO exit.

---

## 1. Timeframe roles — hard rules

| TF      | Role                          | Behaviour                                                                                                                                                                                                                  |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **60m** | **The one and only gate**     | `gate60m === "BULL"` → engine may only fire LONGs. `gate60m === "BEAR"` → engine may only fire SHORTs. `gate60m === "NO_SIGNAL"` → no fires in either direction. Hard rule. No playbook can override it.                   |
| **15m** | **Quality booster** (no gate) | If `gate15m` agrees with `gate60m` → +quality on every playbook trigger. If it disagrees or is `NO_SIGNAL` → no quality bump (but trade is **still allowed**). Also used post-entry for target & stop management — see §5. |
| **5m**  | **Trigger timeframe**         | All entry triggers fire on 5m brick closes. Every playbook is a "5m brick close + condition X" rule. No intra-brick / wick triggers.                                                                                       |

This is the macro skeleton. Everything else is confluence layered on top.

---

## 2. Indicator roles — what each one does in v0.9

All indicators are already implemented + isolated in the Indicator Lab
(`/dev/hawks-isolation`). Their role in the engine is now fixed:

### Group A — HTF EMA stack (60m & 15m)

- **Computes:** EMA 27 vs EMA 55 alignment + price-side on the HTF Renko.
- **Outputs:** `gate60m ∈ {BULL, BEAR, NO_SIGNAL}`, `gate15m ∈ {…}`.
- **Role:** 60m = **gate** (§1, hard). 15m = quality booster only.
- **Source:** `src/lib/backtest/hawks-htf-walker.ts`.

### Group B — MACD histogram (5m)

- **Computes:** standard MACD histogram on 5m closes.
- **Role:** **quality booster** on 5m triggers only. Histogram sign agreeing with trade direction at trigger brick → +quality. Disagreeing → no bump (not a block).

### Group C — EMA stack on 5m (9 / 21 weighted, or the 5m equivalent of 27/55 — TBD per probe)

- **Computes:** fast/slow EMA on 5m + price-side.
- **Role:** **defines "the mean"** for the `mean_reversion` playbook (§4.1). Also a quality booster when the slope matches trade direction on any other playbook.

### Group D — VWAP (daily, session, monthly)

- **Computes:** daily VWAP `vwap_d_5m`, session `vwap_s_5m`, monthly `vwap_m_5m`. Already in parquet schema, 100% populated.
- **Role:** **defines the reference line** for the `vwap_rejection` playbook (§4.3). Also a quality booster when price is on the side of VWAP that matches trade direction.

### Group E — Keltner channel / range bands (5m)

- **Computes:** KC upper/lower on 5m.
- **Role:** **defines exhaustion zone** for `vwap_rejection` and quality booster on `retracement` (a pullback that pierces the band has different stats than one that doesn't — captured as quality, not gate).

### Group F — booster-only candidates (volume, S/R, time-of-day)

- **Source:** the user's trading mentor. Not yet probed in this codebase.
- **Role:** **quality boosters only**, never gates. Each one will be
  probed independently before being added to the booster checklist (§3).
  Until probed, they are not wired into the engine — including them now
  would just be noise.
- **Expected candidates:** volume profile (high-volume nodes as S/R),
  static S/R levels (prior session highs/lows), time-of-day filter
  (avoid opening / lunch / close chop). Specifics TBD per probe.

### Group G — Structural pivots (TOPO / FUNDO, period-2)

- **Computes:** Dow-theory swing tape from `hawks-structural-pivots.ts` (shared with the indicator lab). Each pivot has a confirmation brick (`brickIdx`) and a peak brick (`peakBrickIdx`).
- **Role on 5m:** **gate** for `retracement` playbook (§4.2). The playbook needs a confirmed pivot to retrace from.
- **Role on 15m / 60m:** **quality boosters only** — a 5m LONG fire is higher-quality if a recent 15m FUNDO confirms the same structural bias.

### Cooldown

- **5-brick cooldown** between consecutive fires on 5m. Carried over from v0.6. Prevents stacking on the same setup.

---

## 3. Quality boosters — how they combine

A playbook trigger fires with a base **tier = C**. Each booster that aligns
with trade direction bumps the tier:

| Boosters aligned | Tier |
| ---------------- | ---- |
| 0                | C    |
| 1                | B    |
| 2                | A    |
| 3+               | AA   |
| All boosters     | AAA  |

Booster checklist (all evaluated at the trigger brick):

1. **15m gate** agrees with 60m gate
2. **MACD 5m** histogram agrees with direction
3. **EMA 5m** slope agrees with direction
4. **VWAP 5m** on the favoured side
5. **Structural pivot 15m or 60m** recently confirmed in direction

Tier is recorded on the trade row. It does **not gate the entry** — it
gates filtering / aggression / sizing downstream (a B-tier trade may
fire with smaller size; that's a sizing-module decision, not the engine's).

---

## 4. Playbooks — initial three

A **playbook** is a named entry rule with three things:

- a **trigger condition** (the 5m brick-close rule that fires it)
- a **prerequisite state** (what must be true going into the trigger brick)
- a **specific risk shape** (where the stop logically lives, what the natural target is)

The 60m gate (§1) wraps all of them. Boosters (§3) apply equally.

### 4.1 `mean_reversion` — "retorno à média"

> "Price strayed from its 5m moving average; we're betting on a snap back to it."

- **Prerequisite:** 5m close has been ≥ K bricks on the same side of EMA-fast and increasingly far from it (extension building). K and "increasingly far" are tunable; start with `K=3` and `distance > distance_prev for last 2 bricks`.
- **Trigger:** first 5m brick that closes **back** in the direction of the EMA (i.e. the brick whose close reduces distance to EMA). Direction of the trade = direction of that brick (which is also the direction back toward the mean).
- **60m gate alignment:** trade direction must match `gate60m`. Hard rule. If price extended to the BEAR side and is now snapping back UP, we only take the long if `gate60m === "BULL"`. If the gate is BEAR, the snapback is just noise inside a downtrend — skip. **No counter-gate fires, ever** — applies to every playbook without exception.
- **Risk shape:** stop beyond the brick that printed the maximum extension (the "rejection" wick on the swing low/high). Natural target: the EMA itself, then beyond if momentum carries.

### 4.2 `retracement` — "retração do movimento"

> "Trend made a leg, retraced a bit, we're entering on the resumption."

- **Prerequisite:** a structural pivot in trade direction has been confirmed (Group G — TOPO for SHORTs, FUNDO for LONGs) on 5m, AND price has since retraced a configurable fraction of that leg (start with: at least 2 brick-sizes of retracement, capped by the prior pivot — same rule as v0.6's `WAVE_2`).
- **Trigger:** first 5m brick that closes back **in trend direction** AFTER the retracement (i.e. resumption brick — direction of trade = direction of brick = direction of trend).
- **60m gate alignment:** trend direction must match `gate60m`. A "retracement" in a counter-gate direction is just a continuation of the gate, not a retracement — skipped.
- **Risk shape:** stop beyond the retracement extreme (the pivot we just bounced from). Natural target: prior swing extreme + multiple of brickSize beyond.

### 4.3 `vwap_rejection` — "rejeição de VWAP"

> "Price tested VWAP and the test failed — we're entering on the rejection."

- **Prerequisite:** price has crossed VWAP from the gate-favoured side to the unfavoured side (e.g. in BULL gate, price dipped below VWAP) within the last N bricks. N tunable; start with N=5.
- **Trigger:** first 5m brick that closes **back across VWAP** in gate direction (rejection confirmed). Direction of trade = gate direction.
- **60m gate alignment:** trade direction must match `gate60m` (hard). VWAP rejections counter-gate are common but statistically poor — skipped.
- **Risk shape:** stop beyond the VWAP-pierce extreme (the wick that failed). Natural target: prior session high/low on the gate side, or a KC band, or a fixed R-multiple.

### Playbook naming + storage

Each playbook has a stable string ID consumed by the engine and recorded
on every trade row:

| ID               | Display name          |
| ---------------- | --------------------- |
| `mean_reversion` | Retorno à média       |
| `retracement`    | Retração do movimento |
| `vwap_rejection` | Rejeição de VWAP      |

A trade row carries `playbookId` + `tier` + the booster checklist outcome so
downstream tooling (seeding, replay, analytics) can filter / explain it.

---

## 5. Exits — OCO model (current code; no new module yet)

The codebase has no `OCO` type — exits are a static pairing of:

- a **Stop module** (`src/lib/backtest/modules/stop/*`) — `initial-stops.ts` + `breakeven.ts` + optional `trailing.ts`. Migrates as the trade goes in favour.
- a **Target module** (`src/lib/backtest/modules/target/fixed_levels.ts`) — static at entry.

Per-brick the engine checks both, picks the hit order, and exits. This is
the de-facto OCO. For v0.9 we **keep this as-is** — no dynamic-target work
yet. Targets are static at entry, derived per playbook (§4). Dynamism comes
in a later iteration (v0.10+).

**15m's role post-entry:** none, for now. 15m is a **booster-only** signal
(§3) and a hint to the operator for target placement, but it does not
mutate stops or exits in the engine. We tabled the "15m flip tightens
stop" idea — it was a Claude suggestion, not part of the user's spec, and
adding it now mixes a quality signal with risk logic before either is
proven. May revisit in v0.10.

The 60m gate flipping against an open trade does **not** force exit
either — exit is OCO-driven (stop / target). We just stop opening new
fires in the now-wrong direction until 60m flips back.

---

## 6. Engine flow — pseudocode

```
for each 5m brick (chronological):
  htf = htfWalker.get(brick.timestamp)              # Group A
  pivot = stepStructuralPivot(brick, state)         # Group G

  if no open position:
    if htf.gate60m === NO_SIGNAL: continue
    direction = htf.gate60m === BULL ? LONG : SHORT

    for each playbook in [mean_reversion, retracement, vwap_rejection]:
      if !playbook.prerequisitesMet(state, brick, direction): continue
      if !playbook.triggerFires(brick, direction): continue
      if cooldownActive(state): continue

      tier = scoreBoosters(brick, htf, indicators)  # §3
      open(playbook, direction, brick, tier)
      break                                          # one fire per brick

  else:  # have open position
    if htf.gate15m flipped against position: tightenStop()  # §5
    checkOcoHits(brick)                              # §5
```

**Concurrent fires — single position, multi-tag.** If multiple playbooks'
triggers fire on the same brick, the engine **does not double the
position**. One trade is opened, and **every playbook that fired is
recorded on the trade row** as `playbooksFired: string[]`. The primary
playbook (used for display / stop-target derivation) is picked by this
priority order:

1. `retracement` (continuation of a confirmed structural leg — strongest signal)
2. `vwap_rejection` (institutional-level test failure)
3. `mean_reversion` (rubber-band — weakest of the three, fires most often)

But all tags are kept. Downstream analytics can then answer questions
like: "what's the win-rate when `retracement` AND `vwap_rejection` fire
together vs `retracement` alone?" — this is a first-class statistic we
expect to exploit later. Priority order itself is a design choice based on
expected hit-rate / R; we revisit after the 10-day visual review.

---

## 7. What changes vs v0.6 / v0.8

| Aspect             | v0.6 / v0.8 (current)                              | v0.9 (this doc)                                                      |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| Entry model        | One monolithic state machine (`WAVE_1` → `WAVE_2`) | Three independent playbooks, gate-filtered                           |
| HTF gate           | Both 15m + 60m required to align (symmetric)       | **Only 60m is a gate.** 15m is a booster + post-entry stop manager   |
| Structural pivots  | Hard-coded prerequisite for every fire             | Hard-coded only for `retracement`; soft booster elsewhere            |
| VWAP               | Quality booster only                               | **Gate** for `vwap_rejection` playbook; booster elsewhere            |
| Mean reversion     | Not a concept                                      | First-class playbook                                                 |
| Per-trade metadata | Tier (AAA/AA/A/B/C)                                | Tier + primary `playbookId` + `playbooksFired[]` + booster checklist |
| Exit               | Stop + static target (de-facto OCO)                | Same — no change yet. No 15m-driven stop logic in v0.9.              |

---

## 8. Validation criterion

**Same as the user stated for the rebuild kickoff:**

> "I will review on our software, at least 10 days, and I will check the engine, the criterion is I say: 'On every day I looked, the entries are correct'"

No paper-trade catalog reproduction target this time. Visual review on the
triple-screen UI is the gate. Each fired trade must be inspectable: which
playbook fired it, which boosters were on, which tier it scored.

---

## 9. Open questions — to resolve during build

1. **`mean_reversion` extension definition** — is it brick-count based (≥3 bricks same side of EMA), distance-based (≥X brickSize from EMA), or both? Start: both, AND-joined. Tune from probe.
2. **`vwap_rejection` which VWAP** — daily / session / monthly? Start: daily (`vwap_d_5m`). Session may be added as a second instance of the playbook with its own stats.
3. **Playbook priority order (for primary tag)** — listed in §6, hypothesis only. Revisit after visual review.
4. **EMA periods on 5m for Group C** — confirm 9/21 weighted vs 27/55 simple match the user's mental model. Probe to follow.
5. **Group F probes** — volume / S+R / time-of-day will each get their own isolation probe before being added to the booster checklist.

---

## 10. Build order

1. **Engine skeleton** — gut the v0.6 state machine. Replace with a per-brick orchestrator (§6) that delegates trigger detection to **playbook modules**. Keep stop/target/sizing modules untouched.
2. **Playbook module shape** — define a `Playbook` interface: `id`, `prerequisitesMet(state, brick, direction)`, `triggerFires(state, brick, direction)`, `stopReference(brick, state)`, `targetReference(brick, state)`. One file per playbook under `src/lib/backtest/modules/entry/playbooks/`.
3. **Booster scorer** — `scoreBoosters(brick, htf, indicators)` returns `{ tier, checklist }`. Pure function, unit-testable.
4. **Playbook 1: `mean_reversion`** — simplest, fires often → fastest visual feedback.
5. **Playbook 2: `retracement`** — port the v0.6 wave-2 logic, gate-filtered by 60m only.
6. **Playbook 3: `vwap_rejection`** — net-new.
7. **Triple-screen UI hookup** — each fire renders the primary playbook ID + tier badge on the chart, with `playbooksFired[]` shown as additional tags. Crosshair scrub shows the booster checklist for the brick under the cursor.

Steps 1–3 are the scaffolding. Steps 4–6 are independent and could
parallelise, but doing them serially keeps the visual-review loop tight.
