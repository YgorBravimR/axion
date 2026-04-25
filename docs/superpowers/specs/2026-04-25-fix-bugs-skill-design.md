# Fix Bugs Skill — Design Spec

**Date:** 2026-04-25
**Skill name:** `fix-bugs`
**Location:** `.claude/commands/fix-bugs.md`
**Invocation:** `/fix-bugs` (no arguments)

## Overview

A skill that fetches all open bug reports from the Axion `bug_reports` database via the Arch API, clusters them by feature/symptom, proposes fixes, and after user approval executes a fix-verify-test-close-commit loop per group.

## Architecture: Research Agent + Main Execution (Approach B)

- **Phase 1 (subagent):** Fetch bugs, analyze codebase, cluster, propose fixes
- **Phase 2 (main):** Present proposal table, get user approval
- **Phase 3 (main):** Per approved group: fix code → verify with MCP browser → write tests → close bugs → atomic commit

## Prerequisites

- Dev server running on `localhost:3003`
- `ARCH_API_KEY` env var set

## Allowed Tools

- `Agent` (research subagent)
- `Read`, `Glob`, `Grep`, `Edit`, `Write` (code changes)
- `Bash(pnpm test:unit:*)`, `Bash(pnpm tsc:*)`, `Bash(curl:*)` (tests, type check, API)
- `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git diff:*)`, `Bash(git status:*)`
- MCP Playwright tools (`browser_navigate`, `browser_snapshot`, `browser_click`, etc.)

## API Access

All bug data flows through the Arch API at `http://localhost:3003/api/arch/bugs/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/list?status=open` | GET | Fetch all open bugs |
| `/[id]` | GET | Full bug detail with images |
| `/update` | POST | Close bugs after fix |

Auth: `Authorization: Bearer $ARCH_API_KEY` header on all requests.

## Phase 1: Research Agent

**Agent type:** `general-purpose`

**Tasks:**
1. Fetch `GET /api/arch/bugs/list?status=open` via curl
2. Parse all open bugs — extract `id`, `subject`, `description`, `currentUrl`, `consoleLogs`, `networkErrors`
3. For each bug, read source code at the route matching `currentUrl` (map URL → `src/app/[locale]/(app)/...`)
4. Cluster bugs into groups by shared feature/page/root cause:
   - Same `currentUrl` or route prefix
   - Similar keywords in subject/description
   - Same component/utility in console logs or network errors
5. Per group: analyze root cause, read related components/hooks/API routes/lib
6. Propose fix strategy per group

**Output format:**

```
Group N: [name]
  Bugs: [IDs + subjects]
  Root cause: [analysis]
  Affected files: [list]
  Fix strategy: [what to change]
  Confidence: high | medium | low
  Test approach: [browser verification + unit test scope]
```

**Zero bugs:** Return "No open bugs found." — skill exits.

## Phase 2: Proposal & Approval

Present research agent output as a table:

| # | Group | Bugs | Root Cause | Files | Fix | Confidence |
|---|-------|------|------------|-------|-----|------------|

Prompt user: **"Fix all groups? Or pick specific group numbers?"**

Accepted responses:
- `all` → fix every group
- `1, 3` → fix only those
- `skip 2` → fix all except group 2

Skipped groups: bugs stay `open`, no status change.

## Phase 3: Fix Loop (per approved group)

### Step 1: Fix Code

- Apply proposed changes
- Run `pnpm tsc --noEmit` — must pass before proceeding
- If type check fails: diagnose and fix

### Step 2: Verify with MCP Browser

- `browser_navigate` to bug's `currentUrl`
- `browser_snapshot` to assess state
- Interact (`browser_click`, `browser_fill_form`, etc.) to reproduce original bug path
- Confirm symptom is gone
- **If verification fails:** revert changes, mark group as "failed", keep bugs `open`, move to next group

### Step 3: Write Regression Tests

**Unit test** — `src/__tests__/<area>.test.ts`:
- Tests the specific function/logic fixed
- Follows vitest patterns (globals, node environment)
- Includes a case that would have caught the original bug
- Run `pnpm test:unit -- --run <test-file>` to verify pass

**E2e spec** — added to existing `e2e/tests/<page>.spec.ts`:
- Adds test case(s) to the relevant existing spec file (not a new file)
- Uses helpers from `e2e/utils/helpers.ts`
- Follows project Playwright patterns (data-testid, i18n-aware matchers)

### Step 4: Close Bugs in DB

For each bug ID in the group, call:

```bash
curl -X POST http://localhost:3003/api/arch/bugs/update \
  -H "Authorization: Bearer $ARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "<bug-id>", "action": "close", "adminNotes": "Fixed in commit <sha>. Regression tests added."}'
```

### Step 5: Atomic Commit

Stage only files related to this group (fixed source + tests).

Commit message format:

```
fix: <group description>

Closes bug reports: <bug-id-1>, <bug-id-2>
Regression tests: <test files added/modified>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Move to next group.

## Post-Loop Summary

After all groups processed, print:

| Group | Status | Bugs Closed | Commit | Tests Added |
|-------|--------|-------------|--------|-------------|

## Edge Cases

- **Zero open bugs:** Exit with message, no action
- **Bug with no `currentUrl`:** Skip MCP browser verification, rely on unit test only
- **MCP browser verification fails:** Revert group changes, keep bugs open, log failure in summary
- **Type check fails after fix:** Diagnose and retry fix (max 2 attempts per group), then mark group as failed
- **Dev server not running:** Detect early via health check, warn user to start it
- **Unit test fails:** Fix the test or the code, re-run — must pass before closing bugs

## Existing Infrastructure Used

- **DB schema:** `bugReports` + `bugReportImages` tables (`src/db/schema.ts`)
- **Arch API:** CRUD at `/api/arch/bugs/` with Bearer auth
- **Playwright config:** Phased projects, auth state, helpers at `e2e/utils/helpers.ts`
- **Vitest config:** `src/__tests__/**/*.test.ts`, node environment, v8 coverage
- **E2e test data:** `e2e/fixtures/test-data.ts` (routes, test user, etc.)
