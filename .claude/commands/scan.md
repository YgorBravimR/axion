---
description: Scan a page/feature for code quality, design, and UX issues — then fix them. Full diagnose→fix pipeline.
allowed-tools: Agent, Read, Glob, Grep, Edit, Write, Bash(pnpm tsc:*), Bash(pnpm build:*), Bash(git diff:*)
---

# Scan & Fix

Systematically scan a target area for issues across code quality, design, and UX — then fix everything in a coordinated sequence.

## Prerequisites

Check if `.impeccable.md` exists at the project root. If it does NOT exist, STOP and tell the user to run `/teach-impeccable` first — all design skills depend on it.

## Target

$ARGUMENTS

If no target is specified, ask the user which page or feature to scan. Do NOT scan the entire codebase at once — scope to a specific route, page, or feature area.

## Phase 1: Diagnose (parallel agents)

Launch these two agents IN PARALLEL to analyze the target:

### Agent 1: Code Quality Audit
Spawn a general-purpose agent with this task:
> Read the target files. Check against:
> 1. `CLAUDE.md` — code conventions (arrow functions, no default exports, no `any`, `import type`, typed functions, early returns, etc.)
> 2. `.claude/skills/react-best-practices/SKILL.md` and scan the key rules in `.claude/skills/react-best-practices/rules/` — React performance patterns
> 3. Check for hardcoded strings that should be in translation files (`messages/*.json`)
>
> Output a markdown report with: file, line, issue, severity (critical/high/medium/low), and which guideline it violates. Do NOT fix anything — report only.

### Agent 2: Design & UX Audit
Spawn a general-purpose agent with this task:
> Read `.impeccable.md` for design context, then read `.claude/skills/frontend-design/SKILL.md` for anti-patterns and design principles. Read the target files and check against:
> 1. `.claude/skills/audit/SKILL.md` — accessibility, performance, theming, responsive issues
> 2. `.claude/skills/critique/SKILL.md` — visual hierarchy, information architecture, emotional resonance
> 3. Check color usage, spacing consistency, typography hierarchy, animation opportunities
>
> Output a markdown report with: component/area, issue, severity, category (a11y/perf/theming/responsive/design), and recommended fix skill (`/arrange`, `/colorize`, `/typeset`, `/clarify`, `/harden`, `/animate`, etc.). Do NOT fix anything — report only.

## Phase 2: Review & Prioritize

After both agents complete:
1. Combine their findings into a single prioritized list
2. Present the combined report to the user as a table:
   | # | Severity | Category | File/Area | Issue | Fix |
3. Group by severity: Critical → High → Medium → Low
4. Ask the user: **"Fix all? Fix critical+high only? Or pick specific items?"**

## Phase 3: Fix (sequential, by category)

After user approval, apply fixes in this order (each step builds on the previous):

1. **Code conventions** — Fix `any` types, missing `import type`, default exports, function syntax
2. **Normalize** — Align to design system tokens (colors, spacing, typography from globals.css)
3. **Arrange** — Fix spacing, visual rhythm, hierarchy issues
4. **Typeset** — Fix typography hierarchy, sizing, weight
5. **Colorize** — Fix color usage, semantic color, contrast
6. **Clarify** — Fix UX copy, error messages, labels
7. **Harden** — Fix edge cases, overflow, error handling
8. **Accessibility** — Fix ARIA, keyboard nav, contrast, semantic HTML
9. **Animate** — Add purposeful motion where the audit identified opportunities
10. **i18n** — Extract any remaining hardcoded strings

For each category, read the corresponding skill SKILL.md for instructions before making changes.

## Phase 4: Verify

After all fixes:
1. Run `bunx tsc --noEmit --pretty false` to verify TypeScript compilation (this repo uses bun, not pnpm)
2. Run `git diff --stat` to summarize all changes
3. Present a summary of what was fixed, organized by category

Do NOT commit — let the user decide when to commit.

## Phase 5: Write post-mortem & prevention rules (REQUIRED — never skip)

After verification, persist findings so the same class of bug never ships again. Mirror the bug-fixer agent's post-mortem discipline.

### 5a. Project audit log

Write `docs/scans/YYYY-MM-DD-<slug>.md` (create `docs/scans/` if missing). `<slug>` = short kebab-case target name (e.g. `tax-yearly-reports`, `command-center-redesign`).

Required sections:

```markdown
# Scan: <target> — <YYYY-MM-DD>

**Branch**: <git branch>
**Base**: <git base ref> (e.g. `origin/main`)
**Files audited**: <N source files>
**Verdict**: <X critical, Y high, Z medium, W low>

## Findings (full table)
| # | Severity | Category | File:Line | Issue | Rule violated | Status |
| ... |

(Status = `fixed` | `wontfix` | `deferred` — every row must have one. Items not in fix scope = `deferred`.)

## Root causes
For every CRITICAL and every HIGH that shares a root cause with another, write 1 paragraph:
- What the bug class is
- Why it slipped past review (write/build/runtime — explain WHEN it manifests)
- Concrete anti-pattern signature (regex / grep that catches it)

## Prevention rules
For each root cause, write a one-line rule + a one-line detector (grep or rg one-liner).
Format:
- **Rule**: <imperative statement>
  **Detector**: `rg -n '<pattern>' src/`
  **Auto-fix**: <skill name or "manual">

## Fix log
List of commits or edit groups produced by this scan, in fix-order. Reference Phase 3 categories.

## Still armed
Any DEFERRED items that are known-armed bombs but not fixed in this pass — flag for next scan.
```

### 5b. Global memory append

Append to `~/.claude/memory.md` under a section `## Axion Anti-Pattern Catalog` (create if missing). Each entry:

```
- [YYYY-MM-DD] **<short bug name>**: <one-sentence rule>. Detector: `<grep>`. First seen: <commit/branch>. Fix recipe: <skill or steps>.
```

Only add entries for patterns that:
- Have shipped at least once on a feature branch, AND
- Will silently re-ship without an explicit detector

Skip one-off mistakes. Skip nits. Only catalogue **recurring class bugs** (e.g. "use server" type-export footgun, broken Tailwind tokens that compile to nothing, TZ-naive `Date` against `timestamptz`).

### 5c. Suggest a future-scan pre-flight

If the catalog now has ≥3 entries that are all greppable, suggest in the closing message that the next `/scan` invocation should add a Phase 0 step that runs every detector before launching diagnose agents — fast, mechanical, catches recurring bombs before they reach the LLM.

## Important Rules

- **Never skip Phase 2** — the user must approve before fixes are applied
- **Never skip Phase 5** — the post-mortem is the whole point; without it the same bug ships again
- **Fix one category at a time** — don't mix spacing fixes with color fixes in the same pass
- **Read the skill before fixing** — each category has specific patterns and anti-patterns
- **Preserve functionality** — fixes should improve quality without changing behavior
- **Check TypeScript after each category** — catch issues early, not at the end
