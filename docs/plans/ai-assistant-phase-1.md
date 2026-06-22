# AI Assistant — Phase 1 (Narrator)

**Status**: Spec locked, ready for backlog promotion + first PR.
**Date**: 2026-06-20.
**Source**: [`docs/ideas.md`](../ideas.md) §"In-platform AI agent" — phase-1 scope agreed with Ygor on this date.
**Sequencing**: build after the deterministic enrichment passes ship trade-level payloads (`indicator-readout`, `deterministic-sl`, `candle-math`, `ops-csv`). Enrichment IS the agent's narration source. No agent ships before snapshots produce reliable data on the user's trades.

---

## 1. What this is (and what it is NOT)

### Is

A read-only, per-trade conversational narrator. The user clicks **"Ask about this trade"** on `/journal/[id]`. A panel slides in. The agent reads that trade's `trade_enrichment_snapshot` payload + cross-trade aggregates the user already has, and writes natural-language commentary about what the deterministic engine already computed.

### Is NOT

- **Not a recommender.** The agent does not propose parameter changes, new stops, new targets, new ladder values, new playbooks. It never produces a number the engine didn't already produce.
- **Not a planner.** No "what if we tighten wave-2 retracement on Wednesdays" — that's Phase 2 (conversational optimizer), explicitly out of scope.
- **Not a generalist.** No chatting about markets, news, other strategies. Off-topic prompts return a templated refusal.
- **Not a global drawer.** Not yet. The first surface is per-feature and scoped. Drawer ships after the narrator's value is proven on one surface (Phase 1.5, optional).
- **Not write-capable.** Zero tools mutate state. No edits to trades, ladders, playbooks, settings.
- **Not cross-user.** Per-user prompt context. No aggregation, no cross-user learning, no shared vector store.

The boundary is the moat: **narrate deterministic truth Axion uniquely has; never invent.** Every claim the agent makes must trace to a row the engine wrote. Phase 2 (recommendations) only unlocks if Phase 1 demonstrably builds trust without hallucinating.

---

## 2. Hard rules (non-negotiable)

These are enforced both in the system prompt AND in code (post-stream validators where possible).

1. **No invented numbers.** Every numeric value in the agent's output must trace to a tool call's return payload. Validator: scan the streamed response for digit-sequences, cross-reference against the tool-call results in the trace. Any unsourced number → flag the message + log to `ai_assistant_violations`.
2. **No parameter recommendations.** Any sentence matching "you should [tighten|widen|raise|lower|move|change] your [stop|target|tier|playbook|ladder|threshold|sizing]" → refuse + log.
3. **No financial decisions.** Any sentence matching "[buy|sell|enter|exit|hold|close|cut|let it run] (a|your|this)" → refuse + log.
4. **Citations mandatory.** Every paragraph references the source: "From your enrichment snapshot for this trade: ...", "Per your tier-A backtest of 2026-05: ...". Bare assertions are a violation.
5. **One surface, one context.** Per invocation, the agent reads only the scoped data (e.g., this trade ID's enrichment + this user's last-90-day trade aggregates). No fishing across the database.
6. **Budget hard ceiling.** $5/user/month tracked in `ai_assistant_usage`. Soft warning at 80%, hard cutoff at 100% with a templated "monthly budget reached, resets on the 1st" message.
7. **Audit log is the source of truth.** Every assistant message persists: full prompt, all tool calls + results, full response, model+version, token counts, latency, validator verdicts. Retrievable forever per user.

---

## 2a. Visibility gating model (locked + shipped 2026-06-22)

**The assistant is invisible until two switches are on.** Both must be true; the gate fails closed by default.

### The three gates (all must pass)

1. **Build-time env** (cheapest, sync):
   - `ANTHROPIC_API_KEY` present — else no LLM client is possible. Returns false instantly without DB hit.
   - `AI_ASSISTANT_ENABLED=1` — defaults to `"0"` (opposite polarity from `FRACTAL_PLAN_*` flags which default ON). The assistant is post-launch optional infrastructure; it stays off in any environment that didn't explicitly opt in.
   - Lives at `src/lib/flags/ai-assistant.ts` (`isAiAssistantBuildEnabled()`).

2. **Runtime DB config** (admin-manageable, no deploy):
   - Singleton row at `ai_assistant_config.id = 1` (table added to `src/db/schema.ts`).
   - Fields: `enabled` (master kill-switch, default `false`), `allowedRoles` (default `["admin"]`), `allowedUserIds` (optional allowlist that overrides role check when non-empty — the "dogfood on Ygor only" path), `allowedSurfaces` (per-surface gate, default `[]`), `monthlyCostCapCents` (default 500 = $5/user/month).
   - **If the row doesn't exist, the assistant stays invisible** (`reason: "config_missing"`). Fresh installs see nothing until an admin runs the migration AND inserts the row AND flips `enabled = true`.
   - An admin UI under `/settings/admin/ai-assistant` (built in PR 4) edits this row. No code deploy needed to enable, disable, expand allowlist, restrict surfaces, or lower cost cap.

3. **Per-session resolution** (runs on every request):
   - Single source of truth: `canUseAiAssistant(surface?)` in `src/lib/ai-assistant/access.ts`.
   - Composes: build flag → session present → DB config loaded → `enabled` true → user is in `allowedUserIds` OR role is in `allowedRoles` → (optional) surface is in `allowedSurfaces`.
   - Per-request cached (`React.cache`) so multiple checks on the same page share one query — matches the `getCachedSession` pattern in `src/lib/auth-utils.ts`.

### What "invisible" means concretely

When any gate is closed:

- **UI**: `<AskButton />` (and every future surface trigger) returns `null` from the server component. **Zero DOM nodes**, zero hydration overhead, zero added bytes to the client bundle for users who don't see it. The surface is pixel-identical to today.
- **API**: `/api/ai/narrate` returns **404, not 403**. 403 leaks that the feature exists; 404 is indistinguishable from "this route was never built". Matches the IDOR pattern from `docs/plans/ai-assistant-learning-and-isolation.md` §B.1.
- **DB**: zero writes. No conversation row, no message row, no usage row, no violation row. The assistant's tables stay empty.
- **LLM**: zero Anthropic API calls. The Anthropic client is never constructed.
- **Cost**: zero. Anthropic billing is untouched.

### Gate composition table

| Build flag | DB `enabled` | Role in allowlist | User in `allowedUserIds` (if set) | Surface in `allowedSurfaces` | Visible?                          |
| ---------- | ------------ | ----------------- | --------------------------------- | ---------------------------- | --------------------------------- |
| off        | —            | —                 | —                                 | —                            | **no**                            |
| on         | false        | —                 | —                                 | —                            | **no**                            |
| on         | true         | no                | —                                 | —                            | **no**                            |
| on         | true         | yes               | n/a (empty list)                  | no                           | **no**                            |
| on         | true         | yes               | n/a (empty list)                  | yes                          | **yes**                           |
| on         | true         | n/a               | yes                               | yes                          | **yes**                           |
| on         | true         | n/a (irrelevant)  | no                                | —                            | **no** (allowlist overrides role) |

### Rollout playbook (the typical sequence)

1. Day -1: admin runs migration that creates `ai_assistant_config` table. Row inserted with `enabled = false`. **Zero user-facing change** because the build flag is also off.
2. Day 0: env `AI_ASSISTANT_ENABLED=1` ships in a deploy. **Still invisible** — DB still says `enabled = false`.
3. Day 1: admin toggles `enabled = true`, `allowedUserIds = ["<ygor-user-id>"]`, `allowedSurfaces = ["trade_detail"]`. Ygor sees the button on `/journal/[id]`. No one else does. No new deploy required.
4. Day 14 (dogfood passes promote criteria from §9): admin clears `allowedUserIds`, sets `allowedRoles = ["admin", "premium"]`. Premium users now see the button.
5. Emergency: admin toggles `enabled = false`. Everyone loses access instantly. Next request after the cache TTL (≤1 request scope) sees the gate closed.

### Why both an env flag AND a DB flag?

- **Env flag alone** = "redeploy to roll out / roll back". Slow, requires CI access, doesn't let support roll back at 2am.
- **DB flag alone** = "anyone with DB access flips the assistant on in any environment". Fine for prod, scary for dev/staging where the API key might not be set or might be a different key.
- **Both** = staging gets to test the integration end-to-end with its own key without a prod rollout; prod admin has runtime control; rollback is instant; rolling forward to a wider audience needs zero engineering involvement once the build flag is set.

### Files shipped 2026-06-22

- `src/lib/flags/ai-assistant.ts` — build-time gate.
- `src/db/schema.ts` — `aiAssistantConfig` table + inferred types.
- `src/lib/ai-assistant/access.ts` — `canUseAiAssistant()` resolver (single source of truth).
- `src/app/api/ai/narrate/route.ts` — stub route (404 closed, 501 open).
- `src/components/ai-assistant/ask-button.tsx` — stub trigger (null closed, placeholder open).

All four files are TypeScript-clean + lint-clean as of ship. They are the **only** entry points for AI Assistant visibility — every Phase-1.5+ surface MUST call `canUseAiAssistant(surface)` in the same way; no surface gets to invent its own gate.

---

## 3. Surface (locked)

**First and only Phase-1 surface**: per-feature "Ask about this trade" button on the trade-info panel at `/journal/[id]`.

Why this surface won:

- Trade is the **richest deterministic payload** in the app (full enrichment snapshot, indicator readout, deterministic SL/TP, candle math, ops reconciliation, MFE/MAE).
- Context is **explicit and bounded** (one trade ID). Lower hallucination risk than a global drawer that has to infer what page-state matters.
- Easiest to **gate per-surface** with a feature flag, and easiest to A/B against "no agent" by simply hiding the button.
- Lines up directly with the 2026-06-17 boundary update in `ideas.md`: agent narrates the `hawks_engine_replay` JSON the enrichment pass writes.

### Mock

```
┌──────────────────────────────────────┐
│ Trade #4821  SHORT WIN  -1.2R       │
│ Tier: A   Boosters: 2/5             │
│ ───────────────────────────────────  │
│ Indicators                           │
│   15m gate     ✗ misaligned         │
│   60m gate     ✓ favorable          │
│   MACD 5m      ✗ misaligned         │
│   VWAP-D       ✓ favorable          │
│   ...                                │
│                                      │
│  [ ✨ Ask about this trade ]         │
└──────────────────────────────────────┘
```

Click → inline panel expands below the trade card (NOT a modal, NOT a global drawer). Empty state shows three suggested prompts:

- "Why did the engine score this A and not AA?"
- "How does this trade compare to my other SHORT WINs with this booster pattern?"
- "Walk me through the indicator readout at entry."

User can type a freeform question; suggestion chips are pre-typed prompts.

Panel state:

- **Idle**: suggested-prompt chips.
- **Streaming**: token-by-token render via SSE, with the tool-call timeline visible above the response ("📖 Reading trade snapshot... ✓", "📖 Reading 90-day aggregates...").
- **Done**: full message + a "View audit trail" link (opens drawer showing the full tool-call payloads).
- **Error**: templated error message + "Try again" button + Sentry breadcrumb.
- **Budget reached**: templated "monthly budget reached" message.

**Surfaces explicitly deferred to Phase 1.5**: day detail modal, backtest results page, dashboard insight card, global drawer. Hawks engine lab moved to Phase 2 (dev-only, narrate the audit harness).

---

## 4. Tool catalog (the agent's hands)

The agent calls tools — never invents data. Every tool is read-only. Every tool's args + result is logged.

### Phase 1 tool set (5 tools, all read-only)

| Tool                          | Args                                                                                                         | Returns                                                                                                                                                                                               | What the agent narrates from this                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `get_trade_with_enrichment`   | `tradeId`                                                                                                    | `Trade` + latest `trade_enrichment_snapshot` (committed status) + `indicatorReadout` + `profitMetadata` + computed P&L breakdown                                                                      | The "why this trade scored what it scored" narration. The core of phase 1.                               |
| `get_user_trade_aggregates`   | `userId`, `accountId`, `windowDays` (default 90), `filters?: { direction?, asset?, tier?, boosterPattern? }` | Trade-cohort summary: count, win rate, avg R, avg MFE/MAE, tier breakdown via `computeTierBreakdown`, indicator-alignment distribution                                                                | "How does this compare to your other trades like it" narration.                                          |
| `get_account_context`         | `accountId`                                                                                                  | Active capital, current ladder tier definitions (R$ per tier), Disciplina metric snapshot, OCO week state if active                                                                                   | Frames per-trade R-value in user's actual capital reality.                                               |
| `get_recent_backtest_runs`    | `userId`, `entryType`, `limit` (default 5)                                                                   | Latest backtest runs the user persisted: recipe + summary + tier breakdown. No trade arrays (too large).                                                                                              | "Your latest hawks backtest scored X, so this trade at tier-A is in the 40% bucket..." cross-references. |
| `get_engine_replay_for_trade` | `tradeId`                                                                                                    | If `trade_enrichment_snapshot` carries the `hawksEngineReplay` JSON (per 2026-06-17 ideas.md update): tier, boosters fired, vetoes active, indicator-vs-threshold deltas at entry brick. Else `null`. | "Per the engine replay at entry: tier=A because boosters htf15m+macd were misaligned. Veto: none."       |

### Explicitly NOT in Phase 1

- `run_backtest` / `run_optimize_sweep` — Phase 2.
- `update_trade` / `update_ladder` / `update_playbook` — Phase 3 if ever.
- `query_arbitrary_sql` — never.
- `read_other_users_data` — never.
- `read_docs` / RAG over `docs/` — Phase 1.5 if needed; deferred because Phase 1's narration target is the user's own data, not Axion's methodology docs.

Each tool is a server action under `src/app/actions/ai-assistant/tools/` with auth check via `requireAuth()` and account-scoping check.

---

## 5. System prompt (locked grammar)

Stored at `src/lib/ai-assistant/system-prompt.ts`. Versioned. Every assistant message stamps the prompt version used.

```
You are the Axion Trading Narrator.

Your job: narrate deterministic engine output. You read data the engine
already computed and you explain it in plain language. You never invent
numbers. You never recommend parameter changes. You never tell the user
what to trade.

RULES (never break):
1. Every number you cite MUST come from a tool call's return value.
2. Never use the words "should", "I recommend", "you ought to" about
   any trading parameter, stop, target, sizing, or playbook choice.
3. Every paragraph must reference its source: "From your enrichment
   snapshot for trade X: ...", "Per your tier-A backtest of 2026-05: ...".
4. If you don't have the data to answer, say so and call the right tool.
   Never guess. Never extrapolate.
5. If the user asks you to recommend a change, refuse with: "I narrate
   what the engine computed. For parameter changes, use the deterministic
   optimizer at /backtest/optimize."

STYLE:
- Concise. One paragraph for the headline, one for the supporting detail.
- Reference the engine, not yourself. "The engine scored this A" not
  "I think this is an A trade".
- When indicators are listed, group favorable/unfavorable separately so
  the user sees the alignment at a glance.
- Use the user's vocabulary: "tier", "booster", "gate", "AJUSTE", "VWAP-D"
  — never translate to generic finance terms.

CONTEXT (always provided):
- The trade ID + its enrichment snapshot via `get_trade_with_enrichment`.
- The user's account context via `get_account_context`.
- The user's locale (en or pt-BR) for output language.

TOOLS available: [list of 5 tools with schemas]

If a question is outside the scope of narrating Axion engine output (general
market commentary, news, other strategies, code questions), refuse with:
"I only narrate output from the Axion engine on your data."
```

Prompt version tag: `narrator-v1.0`. Bumped on every prompt edit.

---

## 6. Backend architecture

### Stack choice

- **LLM**: Anthropic SDK direct (`@anthropic-ai/sdk` v0.100.1 — **already in deps** at `package.json:32`, battle-tested in `src/lib/vision/providers/claude.ts`).
- **Model**: Sonnet 4.6 (`claude-sonnet-4-6`) as default. Haiku 4.5 (`claude-haiku-4-5`) as fallback when budget < 20% remaining. Opus only via explicit dev flag.
- **Streaming**: Server-Sent Events from `/api/ai/narrate/route.ts` (Node runtime, not Edge — auth check needs the existing `requireAuth()` + Drizzle, both Node-only in this repo).
- **Tool-call loop**: Standard Anthropic tool-use, max 6 iterations, fail-fast on budget exceed.
- **Prompt caching**: System prompt + tool schemas cached aggressively (TTL 5m). User-specific context (trade payload) not cached.
- **Feature flag**: `AI_ASSISTANT_ENABLED` (env var, default `0` until first PR ships).

### New API route

```
POST /api/ai/narrate
Body: { tradeId: number, userMessage: string, conversationId?: string }
Headers: Cookie (for auth)
Returns: SSE stream of:
  - event: tool_call      { toolName, args }
  - event: tool_result    { toolName, result }
  - event: token          { text }
  - event: done           { messageId, tokensIn, tokensOut, costCents }
  - event: error          { code, message }
```

Conversation continuation: pass `conversationId` to continue a thread; agent loads prior messages from `ai_assistant_messages` and includes them in context (capped at 10 message-pairs to control token spend).

### New tables

```ts
// src/db/schema.ts (new section)

export const aiAssistantConversations = pgTable(
	"ai_assistant_conversations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		accountId: uuid("account_id")
			.notNull()
			.references(() => accounts.id),
		surface: text("surface").notNull(), // "trade_detail" for phase 1
		contextRefId: text("context_ref_id").notNull(), // e.g. tradeId as string
		promptVersion: text("prompt_version").notNull(), // "narrator-v1.0"
		createdAt: timestamp("created_at").defaultNow().notNull(),
		closedAt: timestamp("closed_at"),
	},
	(t) => [index("ai_conv_user_idx").on(t.userId, t.createdAt)]
)

export const aiAssistantMessages = pgTable(
	"ai_assistant_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => aiAssistantConversations.id),
		role: text("role").notNull(), // "user" | "assistant"
		content: text("content").notNull(),
		toolCalls: jsonb("tool_calls"), // [{ name, args, result, latencyMs }]
		model: text("model"), // "claude-sonnet-4-6"
		tokensIn: integer("tokens_in"),
		tokensOut: integer("tokens_out"),
		costCents: integer("cost_cents"),
		latencyMs: integer("latency_ms"),
		validatorVerdicts: jsonb("validator_verdicts"), // { unsourcedNumbers: [], recommendationsCaught: [] }
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("ai_msg_conv_idx").on(t.conversationId, t.createdAt)]
)

export const aiAssistantUsage = pgTable(
	"ai_assistant_usage",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		yearMonth: text("year_month").notNull(), // "2026-06"
		costCents: integer("cost_cents").notNull().default(0),
		tokensIn: bigint("tokens_in", { mode: "number" }).notNull().default(0),
		tokensOut: bigint("tokens_out", { mode: "number" }).notNull().default(0),
		messageCount: integer("message_count").notNull().default(0),
	},
	(t) => [primaryKey({ columns: [t.userId, t.yearMonth] })]
)

export const aiAssistantViolations = pgTable("ai_assistant_violations", {
	id: uuid("id").primaryKey().defaultRandom(),
	messageId: uuid("message_id")
		.notNull()
		.references(() => aiAssistantMessages.id),
	kind: text("kind").notNull(), // "unsourced_number" | "recommendation" | "financial_decision" | "off_topic"
	snippet: text("snippet").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

All four tables behind a single Drizzle migration. No backfill needed (new tables).

### Cost model

- Sonnet 4.6: $3/M input, $15/M output. Cached input: $0.30/M.
- One narration turn rough estimate: 8K cached system+tools (cache hit after warmup) + 2K user context + 800 output ≈ 0.3¢ per turn warm, ~2.5¢ cold.
- $5/user/month → ~1,500 warm turns or ~200 cold turns. Plenty for solo dogfood + early users.
- Hard cutoff enforced server-side BEFORE the API call (cheap check on `ai_assistant_usage`).

### Validators (post-stream, before persist)

1. **Unsourced-number detector**: regex extract all `\d+(\.\d+)?(%|R|pts|pt|cents|\$|R\$)?` tokens from response. For each, check it appears in any `tool_result.result` JSON when serialized. Flag missing → `ai_assistant_violations`. Does NOT block the response in Phase 1 (logs only; we want a baseline of false-positive rate before hard-blocking).
2. **Recommendation-phrase detector**: regex match against the rule-2 patterns. If matched: replace the offending paragraph with "[redacted: recommendation phrasing — Phase 1 narrator does not propose changes]" and flag.
3. **Off-topic detector**: if response doesn't reference any tool result by name, flag as off-topic.

Validators run server-side after the stream completes, before the `done` event fires. Mild UX hit (~200ms) is acceptable in phase 1.

---

## 7. Connecting the assistant to existing Axion surfaces (where it plugs in)

This is the integration map: how each existing feature exposes data to the agent, and where the future Phase 1.5/2 surfaces would live.

### Phase 1 — single surface (this PR slice)

| Surface                          | Data source                                                                                              | Tool wired                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/journal/[id]` trade-info panel | `trades` + `trade_enrichment_snapshots` (latest committed) + `indicatorReadout` JSONB + `profitMetadata` | `get_trade_with_enrichment`, `get_user_trade_aggregates`, `get_account_context`, `get_recent_backtest_runs`, `get_engine_replay_for_trade` |

### Phase 1.5 — easy follow-ups (deferred backlog entries)

| Surface                                   | Data already there                                                             | New tool needed                                                       | Why deferred                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Day detail modal (`day-detail-modal.tsx`) | Per-day P&L aggregation + each trade's enrichment                              | `get_day_summary(date, accountId)` — reuses existing day-bucket query | Wait for trade-detail UX to prove out; then add this without changing the agent loop.     |
| Backtest results (`/backtest`)            | `BacktestResult` (`src/types/backtest.ts:728`) — already in memory client-side | `get_backtest_run_by_id`                                              | Same agent, different scoped context. Phase 1.5.                                          |
| Tier analytics page                       | `computeTierBreakdown` output                                                  | `get_tier_breakdown(window, filters)`                                 | Same.                                                                                     |
| Dashboard insight card                    | `BacktestSummary` cross-account aggregates                                     | `get_dashboard_kpis(accountId)`                                       | Highest visibility but lowest per-call value; do last so the narration grammar is mature. |

### Phase 2 — deferred conversational scope (NOT in this plan)

- Global right-side drawer with page-aware context.
- `run_backtest`, `run_optimize_sweep` tool calls — "what if I tighten wave-2 retracement on Wednesdays".
- Playbook drafting flow.
- Hawks engine lab narration.
- RAG over `docs/` for methodology questions.

These are explicitly out of scope for Phase 1. Backlog entries will be filed after Phase 1 ships.

### Hard boundary with the Ladder Assistant

The Ladder Assistant (separate idea in `ideas.md`) is deterministic code over the Monte Carlo engine, NOT an LLM. The AI Assistant may **reference** ladder values ("Your T1 sits at 3.33% per R") via `get_account_context`, but **never edits** the ladder table. Editing the ladder is the Ladder Assistant's (and the user's) job. Boundary enforced by absence of any write tool on the ladder.

---

## 8. PR sequencing (4 shippable slices)

Each PR is independently mergeable. Each leaves `main` in a working state. The feature flag stays `0` until PR 4 lands.

### PR 1 — Schema + cost meter (no agent yet)

**Goal**: persist tables, ship a budget-checking utility, ship a Sentry-tracked log of all `ANTHROPIC_API_KEY` calls (none yet — guarantees zero spend before PR 4).

- New Drizzle migration: `ai_assistant_conversations`, `ai_assistant_messages`, `ai_assistant_usage`, `ai_assistant_violations`.
- `src/lib/ai-assistant/budget.ts`: `getMonthlySpend(userId)`, `assertWithinBudget(userId)`, `recordSpend(userId, costCents, ...)`.
- Unit tests for budget math edge cases (rollover at month boundary, cache hits, multiple parallel writes).
- **Done when**: `pnpm db:generate` clean; `pnpm test` green; lint green; no env vars required to merge.
- **Effort**: S (~4h). **Risk**: very low.

### PR 2 — Read-only tool registry (no UI, no LLM yet)

**Goal**: ship the 5 server actions the agent will call later. They're useful in isolation as typed query helpers, so they earn their keep before any LLM wiring.

- `src/app/actions/ai-assistant/tools/get-trade-with-enrichment.ts`
- `src/app/actions/ai-assistant/tools/get-user-trade-aggregates.ts`
- `src/app/actions/ai-assistant/tools/get-account-context.ts`
- `src/app/actions/ai-assistant/tools/get-recent-backtest-runs.ts`
- `src/app/actions/ai-assistant/tools/get-engine-replay-for-trade.ts`
- Each with `requireAuth()` + account-scope check + Zod input/output schemas.
- `src/lib/ai-assistant/tool-registry.ts`: assembles the Anthropic tool schemas for later use.
- Unit tests per tool against a seeded fixture user.
- **Done when**: all 5 tools return typed payloads; account-isolation tested; lint + tests green.
- **Effort**: M (1-2 days). **Risk**: low (pure read queries).

### PR 3 — Stream endpoint + validators + system prompt (still no UI)

**Goal**: ship `/api/ai/narrate` end-to-end, callable via `curl`, behind `AI_ASSISTANT_ENABLED=1`.

- `src/app/api/ai/narrate/route.ts` (Node runtime, SSE).
- `src/lib/ai-assistant/system-prompt.ts` (versioned, `narrator-v1.0`).
- `src/lib/ai-assistant/anthropic-client.ts` (thin wrapper, reuses pattern from `src/lib/vision/providers/claude.ts`).
- `src/lib/ai-assistant/validators.ts` (unsourced-number, recommendation-phrase, off-topic).
- `src/lib/ai-assistant/agent-loop.ts` (tool-use loop, max 6 iterations, budget check on entry + after each iteration).
- Integration test: hit the endpoint with a fixture `tradeId`, assert SSE events fire in order, assert a message + tool calls land in DB, assert validators wrote verdicts.
- **Done when**: `curl -N -b cookies.txt http://localhost:3000/api/ai/narrate -d '{...}'` streams a complete narration for a seeded trade behind the flag; tests green; budget is decremented; violations table is empty for a well-formed prompt.
- **Effort**: M (1-2 days). **Risk**: medium (streaming + Anthropic tool loop is the most novel code).

### PR 4 — UI (the "Ask about this trade" button + panel) + flag flip for dev account only

**Goal**: ship the UX. Flag flipped on for Ygor's dev account only until dogfood proves out.

- `src/components/journal/ai-narrator-panel.tsx` (client component, consumes SSE).
- `src/components/journal/ai-narrator-trigger.tsx` (the button, in trade-info-panel).
- Use existing `Sheet` / inline panel pattern from `src/components/ui/`.
- i18n strings in `messages/en.json` + `messages/pt-BR.json` under `assistant` namespace.
- Audit-trail drawer that shows tool calls + payloads (uses existing JSON viewer if there is one, else a `<pre>`).
- E2E test: navigate to a trade, click button, click a suggested prompt, assert narration streams in.
- **Done when**: button visible at `/journal/[id]` behind flag; clicking streams a narration; audit trail visible; i18n complete; e2e green.
- **Effort**: M (1-2 days). **Risk**: low (UI; SSE consumer pattern is standard).

### Rollback story

- Flag off → button disappears, route 404s. Zero risk in production.
- Tables stay in place — never destructive to roll back a migration mid-feature in this project.
- If validators catch a critical pattern of hallucinations post-launch, flag off, fix prompt, re-flip.
- If budget overruns, lower `$5/user/month` to `$1`, no schema change.

---

## 9. Dogfood plan + promote criteria

After PR 4 lands, flag on for Ygor's account only for **2 weeks**. During this window:

**Daily**: Ygor uses "Ask about this trade" on at least 5 trades per session. Flags every hallucinated/wrong/useless response in a Sentry breadcrumb (one-click via the audit-trail drawer).

**Weekly**: review `ai_assistant_violations` count. Target: ≤2 violations per 100 messages by end of week 2.

**Promote-to-broader-rollout criteria** (all must hold):

1. Validator-caught violations ≤ 2% of messages.
2. User-flagged hallucinations ≤ 5% of messages.
3. p50 latency ≤ 4s, p95 ≤ 8s.
4. Average cost per turn ≤ 1¢ (i.e. cache is working).
5. At least 50 narrations across at least 10 distinct trades without an outage.

If any criterion fails → root-cause + re-run the 2-week dogfood from week 1. No "good enough, ship it" carve-outs.

---

## 10. Open questions to settle DURING the build (not blockers)

1. **Suggested-prompt copy** — what exactly do the 3 default chips say? Draft during PR 4.
2. **Conversation thread depth** — keep 10 message-pairs or fewer for token control? Tune during dogfood.
3. **i18n of the agent's own output** — locale is passed in context, but does Sonnet narrate as well in pt-BR as in en? Test in PR 3.
4. **Audit-trail UI density** — show full tool payloads inline, or collapsed-by-default? Iterate in PR 4.

These are tuning knobs, not architecture decisions. They settle during dogfood without changing any schema or contract.

---

## 11. Backlog entries to promote from this spec

After Ygor signs off on this plan, the following lands in `docs/backlog.md` (and is removed from `docs/ideas.md` per the promotion rule):

1. **P1 / M** — "AI Assistant Phase 1: schema + cost meter" (PR 1)
2. **P1 / M** — "AI Assistant Phase 1: read-only tool registry" (PR 2)
3. **P1 / L** — "AI Assistant Phase 1: stream endpoint + validators" (PR 3)
4. **P1 / M** — "AI Assistant Phase 1: UI for trade detail" (PR 4)
5. **P2 / S each** — "Phase 1.5 follow-up surface: day detail / backtest results / tier analytics / dashboard insight card" (4 entries, each cheap once PR 4 ships)
6. **P3** — "Phase 2 — conversational optimizer scope" (placeholder; doesn't start until Phase 1 hits promote criteria)

The `ideas.md` entry stays as a Phase 2 reference; it gets a `**Status (2026-06-20)**: Phase 1 scoped → docs/plans/ai-assistant-phase-1.md` line added at the top.
