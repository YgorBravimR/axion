---
description: Fetch open bug reports from DB, cluster by feature, propose fixes, verify with browser, write regression tests, close bugs, commit.
allowed-tools: Agent, Read, Glob, Grep, Edit, Write, Bash(pnpm test:unit:*), Bash(pnpm tsc:*), Bash(curl:*), Bash(git add:*), Bash(git commit:*), Bash(git diff:*), Bash(git status:*), mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_click, mcp__plugin_playwright_playwright__browser_fill_form, mcp__plugin_playwright_playwright__browser_type, mcp__plugin_playwright_playwright__browser_press_key, mcp__plugin_playwright_playwright__browser_select_option, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_wait_for, mcp__plugin_playwright_playwright__browser_hover, mcp__plugin_playwright_playwright__browser_tabs, mcp__plugin_playwright_playwright__browser_console_messages, mcp__plugin_playwright_playwright__browser_network_requests
---

# Fix Bugs

Systematically fix all open bug reports from the Axion database. Fetches bugs via Arch API, clusters by feature/symptom, proposes grouped fixes, verifies each with a live browser, writes regression tests, closes bugs, and creates atomic commits per group.

## Prerequisites

Before starting, **auto-resolve both prerequisites** — do NOT ask the user:

1. **Arch API key:** Always set it yourself:
   ```bash
   export ARCH_API_KEY="profitjournal-arch-bravo"
   ```
   Use this value in all curl commands directly if `$ARCH_API_KEY` is not in the environment.

2. **Dev server running:** Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/en`.
   - If it returns `200` or `307` — server is up, proceed.
   - If it fails (connection refused / non-2xx/3xx) — start it yourself:
     ```bash
     cd /Users/ygorbravim/personal/projects/bravo/axion && pnpm dev &
     ```
     Wait up to 30 seconds for the server to be ready (poll with curl every 3 seconds).
     If still not ready after 30s, STOP and tell the user.

Both prerequisites must be resolved automatically. Only stop if the server fails to start after 30s.

## Phase 1: Research (subagent)

Spawn a `general-purpose` agent with this prompt:

> You are analyzing open bug reports for the Axion trading journal app.
>
> **Step 1 — Fetch bugs:**
> Run BOTH curl commands to get all actionable bugs (open + accepted):
> ```bash
> curl -s "http://localhost:3003/api/arch/bugs/list?status=open" \
>   -H "Authorization: Bearer profitjournal-arch-bravo" | cat
> ```
> ```bash
> curl -s "http://localhost:3003/api/arch/bugs/list?status=accepted" \
>   -H "Authorization: Bearer profitjournal-arch-bravo" | cat
> ```
>
> Merge both results into a single list. If the combined total is zero items, return exactly: "No open bugs found." and stop.
>
> **Step 2 — Read bug details:**
> For each bug, note: `id`, `subject`, `description`, `currentUrl`, `consoleLogs`, `networkErrors`.
> If a bug has images or you need more detail, fetch `GET /api/arch/bugs/[id]` for the full record.
>
> **Step 3 — Map bugs to source code:**
> For each bug's `currentUrl`, map the URL path to the source code:
> - `/en/journal` → `src/app/[locale]/(app)/journal/`
> - `/en/analytics` → `src/app/[locale]/(app)/analytics/`
> - `/en/dashboard` or `/en` → `src/app/[locale]/(app)/` (root page)
> - Pattern: `/en/<page>` → `src/app/[locale]/(app)/<page>/`
>
> Read the page component, related components in `src/components/<page>/`, hooks in `src/hooks/`, lib functions in `src/lib/`, and API routes in `src/app/api/arch/<page>/`.
>
> Also check `consoleLogs` and `networkErrors` fields for clues about which specific functions or endpoints are involved.
>
> **Step 4 — Cluster bugs into groups:**
> Group bugs that share:
> - Same `currentUrl` or route prefix
> - Similar keywords in subject/description
> - Same component, hook, or utility in error traces
> - Likely same root cause
>
> A bug can only belong to one group. Prefer smaller, focused groups over large catch-all groups.
>
> **Step 5 — Analyze and propose fixes:**
> For each group:
> - Identify the root cause by reading the relevant source code
> - Propose a specific fix strategy (which files to change, what the change is)
> - Assess confidence: `high` (clear root cause), `medium` (likely cause, needs verification), `low` (uncertain)
> - Describe what to verify in the browser and what a unit test should cover
>
> **Output format — return EXACTLY this structure:**
>
> For each group:
> ```
> === Group N: [descriptive name] ===
> Bugs: [comma-separated bug IDs with subjects]
> Root cause: [1-3 sentence analysis]
> Affected files: [file paths, one per line]
> Fix strategy: [specific changes to make]
> Confidence: high | medium | low
> Browser verification: [what to check in MCP browser at which URL]
> Unit test scope: [what function/logic to test, which test file]
> E2e test scope: [what to add to which existing spec file]
> ```
>
> If there are no open bugs, return: "No open bugs found."

### Handle Research Result

If the agent returns "No open bugs found." — print that to the user and STOP. Do not proceed to Phase 2.

Otherwise, continue with the research output.

## Phase 2: Proposal & Approval

Present the research agent's grouped findings as a table:

| # | Group | Bugs | Root Cause | Files | Fix | Confidence |
|---|-------|------|------------|-------|-----|------------|
| 1 | ... | ... | ... | ... | ... | ... |

Then ask:

> **Fix all groups? Or pick specific group numbers?**
> Examples: `all`, `1, 3`, `skip 2`

Wait for user response:
- `all` → proceed with every group
- Comma-separated numbers (e.g., `1, 3`) → fix only those groups
- `skip N` → fix all except group N
- Any other response → ask for clarification

## Phase 3: Fix Loop

For each approved group, execute these steps **sequentially**. Complete one group entirely before starting the next.

### Step 1: Fix Code

Apply the proposed changes from the research agent's fix strategy.

Rules:
- Follow all code conventions from `CLAUDE.md` (arrow functions, no default exports, typed, early returns, etc.)
- Do NOT add unnecessary changes outside the fix scope
- Do NOT add comments explaining the bug fix unless the logic is non-obvious

After applying changes, run:
```bash
pnpm tsc --noEmit
```

If type check fails:
- Diagnose the error
- Fix it
- Re-run type check
- Max 2 attempts per group — if still failing after 2 attempts, revert all changes for this group and mark as **failed**

### Step 2: Verify with MCP Browser

Use the Playwright MCP browser tools to verify the fix:

1. `browser_navigate` to the bug's `currentUrl` (use `http://localhost:3003` + the path)
2. `browser_snapshot` to see the current page state
3. Follow the reproduction steps described in the bug's `description`
4. Interact with the page using `browser_click`, `browser_fill_form`, `browser_type`, etc. as needed
5. Verify the symptom described in the bug report is **gone**
6. `browser_take_screenshot` for evidence

**If the bug has no `currentUrl`:** Skip browser verification. Rely on unit test only.

**If verification fails** (symptom still present):
- Revert all code changes for this group (`git checkout -- <files>`)
- Mark group as **failed** in the summary
- Keep all bugs in this group as `open` in DB
- Move to the next group

### Step 3: Write Regression Tests

#### Unit Test

- Add to existing test file in `src/__tests__/` if one covers the area, or create a new file following the pattern `src/__tests__/<area>.test.ts`
- Use vitest globals (`describe`, `test`, `expect` — no imports needed)
- Test the specific function/logic that was fixed
- Include at least one test case that **would have caught the original bug** (the failing condition before the fix)
- Follow existing test patterns in the project

Run the test to verify it passes:
```bash
pnpm test:unit -- --run src/__tests__/<test-file>.test.ts
```

If the test fails, fix it and re-run.

#### E2e Spec

- Add test case(s) to the **existing** spec file for the relevant page (e.g., `e2e/tests/journal.spec.ts` for journal bugs)
- Do NOT create a new spec file — add to existing ones
- Use helpers from `e2e/utils/helpers.ts` (`navigateTo`, `waitForToast`, `waitForLoading`, `waitForSuspenseLoad`, etc.)
- Use i18n-aware text matchers (regex with both EN and PT-BR variants, e.g., `/win rate|taxa de acerto/i`)
- Follow existing patterns: `test.describe` grouping, `test.beforeEach` for navigation, `data-testid` selectors where available
- Reference routes from `e2e/fixtures/test-data.ts`

Do NOT run the full e2e suite — that's too slow. The e2e spec is committed as a regression guard for CI.

### Step 4: Close Bugs in DB

For each bug ID in the group, close it via the Arch API:

```bash
curl -s -X POST http://localhost:3003/api/arch/bugs/update \
  -H "Authorization: Bearer $ARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "<BUG_ID>", "action": "close", "adminNotes": "Fixed in commit <SHORT_SHA>. Regression tests added."}' | cat
```

Replace `<BUG_ID>` with the actual bug ID and `<SHORT_SHA>` with the commit hash from Step 5.

**Note:** Since the commit happens after this step, use the commit SHA from Step 5 to update the adminNotes. If calling curl before committing, use a placeholder and update after. Alternatively, commit first (Step 5), then close bugs with the real SHA.

**Adjusted order for this group:** Fix → Verify → Write Tests → Commit → Close Bugs (so the SHA is available for adminNotes).

### Step 5: Atomic Commit

Run `git status` and `git diff --stat` to review changes.

Stage only files related to this group:
```bash
git add <fixed-source-files> <test-files>
```

Commit with this format:
```
fix: <short group description>

Closes bug reports: <bug-id-1>, <bug-id-2>
Regression tests: <test files added/modified>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Save the commit SHA for the bug closure step.

### Step 6: Close Bugs with Commit SHA

Now close each bug in the DB with the real commit SHA from Step 5:

```bash
COMMIT_SHA=$(git rev-parse --short HEAD)
curl -s -X POST http://localhost:3003/api/arch/bugs/update \
  -H "Authorization: Bearer $ARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"<BUG_ID>\", \"action\": \"close\", \"adminNotes\": \"Fixed in commit $COMMIT_SHA. Regression tests added.\"}" | cat
```

Repeat for each bug ID in the group.

Then move to the next group.

## Post-Loop Summary

After all groups are processed, print a summary table:

| Group | Status | Bugs Closed | Commit | Tests Added |
|-------|--------|-------------|--------|-------------|
| Journal date picker | fixed | BUG-abc, BUG-def | `a1b2c3d` | `calculations.test.ts`, `journal.spec.ts` |
| Dashboard KPI NaN | failed | — | — | — |

If any groups failed, explain why and suggest next steps.

## Important Rules

- **Never skip browser verification** unless the bug has no `currentUrl`
- **Never close a bug** without confirming the fix works (browser or unit test)
- **Never mix groups** in a single commit — one commit per group
- **Never modify code outside the fix scope** — no drive-by refactoring
- **Always run type check** before browser verification
- **Always run unit test** before committing
- **Revert on failure** — if a group's fix doesn't work, cleanly revert and move on
- **Follow CLAUDE.md conventions** for all code written (arrow functions, no default exports, typed, early returns)
