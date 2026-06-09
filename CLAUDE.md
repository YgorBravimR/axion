# Axion — Agent Operating Rules

This file is a **router**. Read it fully every session. Only mandatory rules and pointers live here. Detailed guidance lives in the linked files — fetch them on demand when the rule below says to.

---

## Mandatory rules (non-negotiable)

1. **No feature duplication.** Before creating a new feature, search for existing equivalents. If something related exists, surface it explicitly and propose merge or override — never silently re-build. All new feature work comes only after a review of what's already shipped.

2. **Discovery logging.** When you discover a non-obvious gotcha mid-task (API quirk, framework version trap, repo-specific convention, recurring footgun, "we tried X and it bit us"), **append it to [`docs/gotchas.md`](docs/gotchas.md) before closing the session.** Format and conventions are in that file's header. Do **not** scatter the discovery as inline `// HACK` / `// WARNING` comments — they rot. Surface the logged entry in your end-of-session summary so the user sees it.

3. **Bug fixes get post-mortems.** Every bug fix is written up in [`docs/postMorten/`](docs/postMorten/) per the `bug-fixer` agent contract. Do not skip the write-up — that file is how we avoid failing twice on the same thing.

4. **Deferred work is centralized.** Ideas, follow-ups, and "for later" notes go in [`docs/backlog.md`](docs/backlog.md) — never scattered as `// TODO`s. Remove the entry in the same PR that picks it up.

5. **Package manager: `pnpm` only.** Never `bun` / `bunx`. Applies to every command — install, scripts, codegen, migrations, lint, dev. Use `pnpm exec <bin>` for one-shot binaries. Use `pnpm add` / `pnpm add -D` to add deps.

6. **Lint must be green.** `pnpm lint` (Tier 1, fast-loop) and `pnpm lint:strict` (Tier 2, type-checked) both at **0 errors** before commit. ~900 `no-unsafe-*` warnings in Tier 2 are intentional phase-in — do not silence globally. Husky pre-commit runs `lint-staged`; **never bypass with `--no-verify`**. Commit messages follow `@commitlint/config-conventional` (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).

7. **PR target is `main`.** No staging branch. `main` auto-deploys to production via `.github/workflows/deploy.yml`; `lint.yml` gates merges. Use the PR template in [`docs/pr-template.md`](docs/pr-template.md) verbatim.

8. **No native browser dialogs.** Never use `window.confirm()` / `window.alert()` / `confirm()`. Use `@/components/ui/alert-dialog` for any destructive or confirmation action.

9. **Confidence gate — verify before acting.** This rule applies to any action that **mutates state**: editing files, writing files, running migrations, destructive Bash commands, git operations beyond read-only inspection, deploys. Read-only research (Read, Grep, Glob, exploration) is exempt — explore freely.

   Before a mutating action, you must be able to answer **yes** to all five:
   1. Do I know which **files** will change and have I read each of them fully?
   2. Do I know the **inputs, outputs, and call sites** of the function/component I'm touching?
   3. Have I disambiguated every term in the request that could mean two things?
   4. Do I know how I would **verify** the change worked (lint, test, manual smoke)?
   5. If this fails in production, do I know the **blast radius** and how to roll back? (`main` auto-deploys — there is no second chance.)

   If any answer is "no" or "I'd be guessing", **do not proceed**. Pick one:
   - **Investigate** — read more files, trace the data flow, run a probe. Re-check the five.
   - **Ask** — surface 1–3 specific questions. Frame each as a concrete dichotomy: _"I see two interpretations of X — A means [...], B means [...] — which do you want?"_ Never ask a vague _"what should I do?"_.
   - **Stop and report** — if the task is unclear at the spec level, say so: _"I don't have enough information to do this confidently. Here's what I know, here's what I'd need."_ This is a desirable response, not a failure.

   Saying _"I don't know"_ / _"I'd be guessing"_ is always preferred over a confident-sounding wrong action. The cost of one clarifying question is small; the cost of a wrong write to `main` is large.

10. **Delegate by default — orchestrator stays expensive, work stays cheap.** When a task fits an available subagent's description, **invoke the subagent** via the Agent tool rather than doing the work yourself. The orchestrator's job is routing, planning, and synthesis — not bulk reads, bulk edits, or mechanical transforms.

    Default delegation targets:
    - Bulk file reads / codebase search → `Explore` (Haiku)
    - Mechanical string replacement, i18n extraction → `i18n-translator` (Haiku)
    - Test writing → `test-architect` (Sonnet)
    - Theming / token work → `theme-designer` (Sonnet)
    - Bug investigation + fix → `bug-fixer` (Sonnet, self-escalates to Opus if needed)
    - Animation work → `react-animation-specialist` (Sonnet)
    - Code simplification / lint cleanup → run `pnpm lint --fix` first; for non-lint refactors, invoke the `/simplify` skill
    - Commit creation → `git-commit-helper` (Sonnet, Axion project-override — no emojis, commitlint-compliant)
    - Multi-axis research that can run in parallel → spawn concurrent subagents in a single message

    Do work in the orchestrator yourself only when: (a) no subagent fits, (b) the task needs full conversation context a subagent can't see, or (c) it's a 1-shot edit faster to do than to delegate (rule of thumb: under ~3 file touches).

    When delegating, always pass a **self-contained prompt** — subagents start with no conversation context. State the goal, the relevant files/symbols, the constraints, and what "done" looks like.

11. **Never touch working-tree or branch state from inside a subagent.** Subagents (and the orchestrator) must never run any command that discards or rewrites uncommitted work or moves the branch. Forbidden commands — refuse to run them, no exceptions:
    - `git restore`, `git restore --staged`, `git checkout -- <path>`, `git checkout .`
    - `git stash`, `git stash pop`, `git stash drop`
    - `git reset` (any mode), `git clean`
    - `git checkout <branch>`, `git switch`, `git rebase`, `git merge`, `git pull`, `git fetch`
    - `git commit`, `git push`, `git tag`, `git branch -D`
    - any `rm` / `mv` of files under version control that isn't part of the user's explicit task
    - any tool that wipes node_modules / regenerates lockfiles unprompted

    Read-only git is fine: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git blame`, `git branch` (no flags).

    **Why:** when subagents run in parallel, each one's "tidy up first" reflex can silently destroy a sibling agent's unstaged work. `git restore .` and `git checkout -- .` leave **no reflog trail**, so the loss is undiagnosable after the fact. We lost a wave of perf fixes this way on 2026-06-09; see `docs/postMorten/`.

    **What to do instead** when you see an unexpected working-tree state:
    - **Stop**, do not "clean up".
    - **Report** the surprise back to the orchestrator (or user): list the unexpected files and ask whether they should be kept.
    - If your scope genuinely requires a clean slate, **say so in your report and refuse to start** — let the orchestrator decide whether to commit, stash, or proceed despite the dirty tree.

    The orchestrator is responsible for committing/branching between waves of parallel subagents. Subagents only do file edits inside their scope.

---

## Protected paths (refuse to modify without explicit user request)

- `src/db/migrations/` — Drizzle migrations are append-only. Generate with `pnpm db:generate`; never hand-edit.
- `src/db/schema.ts` — Drizzle schema source. Changes ripple to migrations + generated types; coordinate before editing.
- `src/lib/auth-utils.ts` — session + JWT logic. Changes require security review.
- `src/lib/tax/recompute-month.ts` — single source of truth for tax recomputation. Changes affect financial output retroactively.
- `src/lib/crypto.ts`, `src/lib/user-crypto.ts` — cryptographic primitives. Changes require security review.

---

## Routing — where things live

| When you need…                                                       | Read                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Project gotchas, recurring footguns, version traps**               | **[`docs/gotchas.md`](docs/gotchas.md)**                           |
| Past bug fixes (don't fail twice on the same thing)                  | [`docs/postMorten/`](docs/postMorten/)                             |
| Code conventions (TS, React, comments, API shape, security baseline) | [`docs/code-conventions.md`](docs/code-conventions.md)             |
| Design system (audience, brand, principles, canonical patterns)      | [`docs/DESIGN.md`](docs/DESIGN.md)                                 |
| Theming tokens (colors, spacing, typography)                         | [`docs/theming.md`](docs/theming.md) + `src/app/globals.css`       |
| Component architecture (RSC boundaries, layering)                    | [`docs/component-architecture.md`](docs/component-architecture.md) |
| Database schema reference                                            | [`docs/database-schema.md`](docs/database-schema.md)               |
| Server actions + API conventions                                     | [`docs/api-actions.md`](docs/api-actions.md)                       |
| Audit scans (a11y, perf, schema, tokens, etc.)                       | [`docs/scans/`](docs/scans/)                                       |
| Deferred work / "for later" ideas                                    | [`docs/backlog.md`](docs/backlog.md)                               |
| Full skill catalog                                                   | [`docs/skill-index.md`](docs/skill-index.md)                       |
| PR template                                                          | [`docs/pr-template.md`](docs/pr-template.md)                       |

---

## Skill routing

When the user's request matches an available skill, invoke it via the `Skill` tool. When in doubt, invoke the skill. Full catalog in [`docs/skill-index.md`](docs/skill-index.md).

- Product ideas / brainstorming → `/office-hours`
- Strategy / scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs / errors → `/investigate`
- QA / site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`
- Save progress → `/context-save`
- Resume context → `/context-restore`
