# Ideas — Pre-Commit Thinking Space

This file is for half-formed ideas, strategic seeds, and "we should think about X" notes that aren't yet commit-ready. Cheap to file, cheap to delete. The commit-ready slice lives in [`docs/backlog.md`](backlog.md).

## When something lives here vs. in the backlog

| Lives here (ideas)                                              | Lives in backlog                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| Missing a clear shape ("we should personalize each mode")       | Has a concrete shape ("add `trade_conditions` junction table") |
| Missing a rough effort estimate                                 | Has at least an XS / S / M / L / XL guess                      |
| Needs a product / design conversation first                     | Needs only a code change                                       |
| Could plausibly be deferred forever without anyone losing sleep | Has a clear next-shipping window or strategic ROI              |

## Promotion rule

When an idea earns its **What + Why + Effort + Priority + Source**, promote it to `backlog.md` and **delete it from this file in the same PR**. Don't double-list — the backlog is the single source of truth for committed work.

## Demotion is okay

If a backlog item turns out to be more speculative than it looked, demote it back here. The cost is one paste; the savings is a backlog that reads like a real shortlist.

---

## Onboarding integration with the zero-to-hero demo

- **Status**: needs product decisioning before it has a concrete shape.
- **Idea**: Use the demo-mode video (output of `e2e/journey/`) as the new-user walkthrough; embed the stage gallery in `docs/zero-to-hero.md`; nightly-publish the demo artifact to S3 / internal docs site so it's always fresh. The technical building blocks (chained journey suite, per-stage screenshots, video stitching) are already shipping; what's missing is the product framing — "is this the onboarding tour, or a separate sales asset?", "does it run in-app behind a `?demo=1` flag, or on the marketing site only?", "how does it interact with the empty-state guidance we already render?"
- **Why this is an idea, not a backlog item**: today there's no concrete UI surface to add to. The work is gated on a product call about where and how the demo gets surfaced.
- **Promotion path**: once product chooses a surface (in-app onboarding tour vs. external marketing asset vs. both), this fragments into 2-3 concrete backlog entries (artifact publishing pipeline, in-app embed, docs gallery integration).
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 5; moved from backlog 2026-05-15 because it lacked a concrete shape.

## Assistant reviewer

- **Status**: Needs product development and engeneering thinking
- **Idea**: Implement more assisted reviews, maybe AI looking at numbers, comparing with benchmarks, preview of future, giving insights
- **Source**: Ygor

## Mentor role

- **Status**: Needs product development and engeneering thinking
- **Idea**: Specific user role with specific information about a group of other accounts, new pages, new tables, where user can monitor it's pupils.
- **Source**: Ygor

## Connect Backtest ↔ Optimize (carry recipe + range across surfaces)

- **Status**: Shape clear, awaiting product call on which direction is primary.
- **Idea**: Today the two surfaces share code (presets, sections, engine, types) but the user has no programmatic handoff — a recipe tuned on `/backtest` cannot be carried to `/backtest/optimize` for sweep refinement, and a specific run from `/backtest/optimize` cannot be reopened on `/backtest` for trade-level / brick-level inspection. The path is manual re-entry: pick preset again, retype every field.
  Two complementary bridges, both reuse the same URL-param contract (one serializer, two consumers):
  - **Bridge A — "Optimize this" on `/backtest`.** Serialize current `recipe` + `dateRange` + `selectedSourceIndex` into URL params, navigate to `/backtest/optimize?seed=…&from=…&to=…&asset=…`. OPTIMIZE hydrates on mount, auto-derives `leafSelections` from the recipe baseline (the existing `deriveInitialSelections(HAWKS_LEAVES, recipe)` already does this), lands on the parameters step.
  - **Bridge C — "Open in Backtest" on each OPTIMIZE run row.** Each `OptimizationRun` already carries its full recipe. Reverse of A: pop `/backtest?seed=…` so the user can inspect the run's full trades table, equity, and brick-level chart that OPTIMIZE doesn't surface.
  - **Bonus — Bridge D — hero presets visible in Backtest.** Today frozen hero presets (`axion:optimize:heroPresets`) only appear in OPTIMIZE's preset dropdown. Backtest reads `[...orbPresets, ...hawksPresets]` directly. Have Backtest call the same `useHeroPresets()` hook and merge in for parity.
- **Why an idea, not a backlog item**: needs product call on which bridge is primary (forward / backward / both at once), and whether the param payload should be base64-encoded JSON or a tighter schema. Schema-versioning convention matches the localStorage stores (bump on shape change).
- **Promotion path**: once primary direction is picked, this becomes 1–2 backlog entries (the URL-contract module + the two button placements).
- **Source**: 2026-05-30 session — identified after completing the OPTIMIZE funnel (PRs 1–4). User asked "what connects Backtest and Optimize now?" and the honest answer was: shared code, zero programmatic handoff.
