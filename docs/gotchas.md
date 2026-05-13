# Gotchas — Mid-Session Discoveries Log

This file is the canonical home for **non-obvious project gotchas** discovered while working: API quirks, framework version traps, repo-specific conventions, recurring agent footguns, "we tried X and it bit us" learnings.

## Why this file exists

Gotchas get rediscovered every session unless they're written down somewhere agents read. Inline `// HACK`, `// WARNING`, or scattered comments rot — by the time the gotcha matters again, the comment is in a deleted file or buried in a stale branch. This file consolidates them so:

- Future sessions don't re-pay the cost of the same discovery.
- Subagents (bug-fixer, feature-dev, code-reviewer) start with the same prior knowledge as the human.
- We can see clusters of pain (e.g. "Drizzle keeps biting us in 3 different ways") and decide when to systematize via lint/codegen.

This is **distinct from**:

- **`docs/postMorten/`** — bug fixes after they break production. Gotchas live here _before_ they cause a bug, ideally.
- **`docs/backlog.md`** — work to do later. Gotchas are facts we learned, not work items.
- **`CLAUDE.md`** — mandatory rules. Gotchas inform rules but aren't rules themselves until they're promoted (see below).

## Conventions

- **Every entry has a date** (ISO `YYYY-MM-DD`) and a **Source** line linking back to the file/PR/issue/session where it surfaced.
- **Title is a one-liner the agent will recognize** — frame it as the wrong assumption ("`cookies()` is sync"), not the right answer.
- **Body explains _what bit us_ and _what to do instead_.** Two short paragraphs max. No essay.
- **Group by topic** (Next.js, Drizzle, Auth, Lint, etc.), not by date.
- **Mark items obsolete by deleting them** — the git log is the audit trail. If a gotcha is fixed upstream (e.g. lint rule added, library upgraded), delete the entry in the same PR.
- **Promote to a rule when it's load-bearing.** If a gotcha is causing repeat pain across multiple sessions/PRs, promote it: add a lint rule, add a check in `CLAUDE.md`'s mandatory section, or build it into a custom `axion/*` ESLint rule. Then delete from this file.

## Discovery protocol (for agents)

Every agent — including subagents — must follow this when they hit a gotcha mid-task:

1. **Recognize**: "I just learned something non-obvious that future me / another agent would also miss."
2. **Append, don't comment**: write the entry here. Do not leave a `// TODO: future agents beware…` comment in source.
3. **Be specific**: name the file, the version, the symptom, and the workaround.
4. **Surface it**: mention it in the session summary so the user sees it was logged.

When unsure whether something qualifies, log it. A one-liner here costs ~30 seconds and saves the next session 30 minutes.

---

## Next.js / App Router

### `cookies()` / `headers()` / `draftMode()` are banned in pages

- **What**: Calling these from `next/headers` inside `page.tsx`/`layout.tsx`/`template.tsx` forces full dynamic rendering implicitly and breaks static analysis.
- **What to do**: Move into a server action, or set `export const dynamic = "force-dynamic"` explicitly. `connection()` from `next/server` is the allowed explicit opt-in.
- **Enforced by**: `axion/no-dynamic-functions-in-pages` (error).
- **Source**: `eslint-rules/no-dynamic-functions-in-pages.mjs`.
- **Date logged**: 2026-05-07.

### Raw `<a>` breaks client routing

- **What**: `pages/`-style `<a href="…">` for internal links does a full reload, killing the SPA feel.
- **What to do**: `<Link>` from `next/link` for every internal URL. Lint catches it via `axion/enforce-ui-primitives`.
- **Source**: `eslint-rules/enforce-ui-primitives.mjs`.
- **Date logged**: 2026-05-07.

---

## React

### Hooks must run before any early return

- **What**: An early `if (!user) return null` before a `useEffect`/`useMemo` violates rules-of-hooks. CI blocks merge.
- **What to do**: Move nullable narrowing **inside** the hook callback, not before the hook call. If the component genuinely can't render without the value, lift the guard to the parent.
- **Enforced by**: `react-hooks/rules-of-hooks` (error in `pnpm lint:strict`).
- **Date logged**: 2026-05-07.

### `import * as React` is banned

- **What**: `React.useState` / `React.forwardRef` clutters bundles and breaks tree-shaking in some setups.
- **What to do**: Always `import { useState, forwardRef } from "react"`. Same for types: `import type { ComponentProps, HTMLAttributes } from "react"`.
- **Date logged**: 2026-05-07.

---

## Server Actions

### `"use server"` files can only export async functions or values

- **What**: Re-exporting types from a `"use server"` file rewrites them as **runtime refs** at build time — the types vanish and you get cryptic build errors. Type aliases, interfaces, enums, classes, sync functions, barrel re-exports, and sync defaults are all forbidden.
- **What to do**: Move type re-exports to a sibling `*.types.ts` file. Server action files contain async functions only.
- **Enforced by**: `axion/enforce-server-action-async-only` (error).
- **Source**: `eslint-rules/enforce-server-action-async-only.mjs`.
- **Date logged**: 2026-05-07.

---

## TypeScript / Lint

### `!= null` is the idiomatic null+undefined check

- **What**: `!== null` lets `undefined` slip through. The project lint is configured with `eqeqeq` rule `null: "ignore"`, so `!= null` is intentionally allowed and is the **preferred** form.
- **What to do**: Don't "fix" `!= null` to `!== null`. It's correct.
- **Date logged**: 2026-05-07.

### `.forEach()` is banned

- **What**: `.forEach` makes flow analysis harder and offers no upside over `for...of`.
- **What to do**: `for...of` (side effects), `.map()` (transform), `.reduce()` (aggregate). Lint blocks `.forEach`.
- **Date logged**: 2026-05-07.

### Tailwind v4 tokens only — no arbitrary classes

- **What**: `text-[28px]`, `rounded-[12px]`, `s-400`, `m-200` are all invalid in this repo. Legacy spacing tokens were removed in the 2026-05-07 token sweep.
- **What to do**: Use the design tokens defined in `src/app/globals.css`. Run `pnpm scripts/token-fix.ts --dry` to detect drift; commit fixes from the same script.
- **Enforced by**: `axion/enforce-token-usage` (error). Catalog: `eslint-rules/token-rules.mjs`. Invalid-token reference: `docs/scans/2026-05-07-cockpit-tokens.md`.
- **Date logged**: 2026-05-07.

---

## Accessibility

### Hover-only controls fail touch + keyboard

- **What**: `opacity-0 group-hover:opacity-100` patterns hide controls from touch users and keyboard users entirely.
- **What to do**: Add a focus-visible/focus-within escape, **or** make it a real `<button>` with `aria-label`, **or** add `aria-hidden` if the control is decorative.
- **Enforced by**: `axion/no-hover-only-controls` (error).
- **Date logged**: 2026-05-07.

### Banned raw primitives

- **What**: `<table>`, `<input type="checkbox">`, `<a href>`, `<img>` outside `src/components/ui/` lose the project's a11y + theming guarantees.
- **What to do**: `@/components/ui/table`, `@/components/ui/checkbox`, `next/link`, `next/image`.
- **Enforced by**: `axion/enforce-ui-primitives` (error) for table/checkbox/`<a>`; native lint for `<img>`.
- **Date logged**: 2026-05-07.

---

## UI Patterns

### Never use `window.confirm()` / `window.alert()`

- **What**: Native browser dialogs are unthemed, inaccessible, and break the cockpit aesthetic.
- **What to do**: Use `@/components/ui/alert-dialog` — controlled `open` state, `onOpenChange` for dismiss, `AlertDialogAction` for confirm, `AlertDialogCancel` for cancel.
- **Date logged**: 2026-05-07.

### `text-trade-buy` / `text-profit` are not "good", `text-trade-sell` / `text-loss` are not "bad"

- **What**: The trade colors signal **signed money polarity** (long vs short, profit vs loss). They are reserved for that. Painting any non-money signal with them is a category error: a boolean "is active" state, an operation outcome ("save succeeded"), a "this row is filled" indicator, a status badge — none of those are signed money. Wave 6 cleaned this hijack up across 4 settings widgets (toggle indicators) and 2 recalc-result messages; Wave 9 caught HAWKS reintroducing it in `HawksSettings` (`text-profit` for HAWKS-active boolean) and retired `text-trade-buy` from `required-indicator.tsx` (filled-`*` across every required form field).
- **What to do**: For verdict-good / verdict-bad signals (operation outcome, "this thing is in the right state"), use the verdict triad: `text-fb-success` for good, `text-fb-error` for bad. Both exist in `globals.css` with light + dark tones. For neutral category states ("this row is enabled"), use `text-txt-200` or a non-colored icon-state distinction (filled vs outline).
- **Recognise it**: when you reach for `text-trade-buy`, ask: "am I painting an amount of money the user could have made or lost?". If no, you want the verdict triad.
- **Source**: `docs/scans/2026-05-12-impeccable-settings-wave6.md` (Pattern A + B); `docs/scans/2026-05-13-impeccable-settings-hawks.md` (Phase 3d).
- **Date logged**: 2026-05-13.
