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

## Mode-personalization framework

- **Status**: needs product / design conversation.
- **Idea**: Each trading mode (Hawks, ORB, DEZK, "generic") should personalize the surfaces around it — not just the methodology surfaces. Today the dashboard, journal, analytics, plan pages render a single canonical layout regardless of the active mode. A trader using Hawks ought to see Hawks-shaped widgets (B3 cap, scenarios, Renko-aware day breakdown); a DEZK trader should see DEZK-shaped widgets; etc. The question is the **framework**: how much of the UI is methodology-aware, how mode-switching propagates through the app, and what the per-mode contract is (a registry? a context? per-component variants? a layout-level mode prop?). The Hawks v0 work shipped the methodology, but personalization stops at the dashboard's coaching card and the trade form's pre-flight switches.
- **Open questions**:
  - Is "mode" a per-account setting, a per-trade setting, or both?
  - Does mode-personalization apply at the route level (whole pages swap) or at the widget level (cards within a page swap)?
  - How does it interact with the generic ("any methodology") mode — is there a clean degenerate case, or do generic users always get the Hawks-flavored layout?
  - What is the cost-to-add of a new methodology (e.g. wiring ORB or DEZK) — and does the framework reduce it?
- **Why this is an idea, not a backlog item**: the right framework is downstream of the product decision about what personalization should look like in the first place. The framework's shape (registry vs. context vs. layout prop) is a code question; the product shape is not yet committed.
- **Promotion path**: shape this in `/plan-ceo-review` feature-manifesto pass, then convert into one or more backlog entries (likely an L architectural spike plus per-surface follow-ups).
- **Source**: CEO review session 2026-05-15.

---

## Onboarding integration with the zero-to-hero demo

- **Status**: needs product decisioning before it has a concrete shape.
- **Idea**: Use the demo-mode video (output of `e2e/journey/`) as the new-user walkthrough; embed the stage gallery in `docs/zero-to-hero.md`; nightly-publish the demo artifact to S3 / internal docs site so it's always fresh. The technical building blocks (chained journey suite, per-stage screenshots, video stitching) are already shipping; what's missing is the product framing — "is this the onboarding tour, or a separate sales asset?", "does it run in-app behind a `?demo=1` flag, or on the marketing site only?", "how does it interact with the empty-state guidance we already render?"
- **Why this is an idea, not a backlog item**: today there's no concrete UI surface to add to. The work is gated on a product call about where and how the demo gets surfaced.
- **Promotion path**: once product chooses a surface (in-app onboarding tour vs. external marketing asset vs. both), this fragments into 2-3 concrete backlog entries (artifact publishing pipeline, in-app embed, docs gallery integration).
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 5; moved from backlog 2026-05-15 because it lacked a concrete shape.
