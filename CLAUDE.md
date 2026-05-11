# Code Conventions

# Agent Conventions — Axion

## Package manager

**Use `pnpm` only. Never use `bun` or `bunx` in this project.**

- Install: `pnpm install`
- Run script: `pnpm <script>` (e.g. `pnpm dev`, `pnpm test`)
- One-shot binary: `pnpm exec <bin>` (e.g. `pnpm exec tsc --noEmit`)
- Add dep: `pnpm add <pkg>` / `pnpm add -D <pkg>`

This applies to every command issued by an agent: typecheck, tests, codegen, migrations, lint, dev server, anything.

## General

Never use `window.confirm()`, `window.alert()`, or `confirm()` for any user-facing confirmations or messages.

**Why:** Native browser dialogs are ugly, unthemed, inaccessible, and break the brand experience. The project has a proper `AlertDialog` component (`src/components/ui/alert-dialog.tsx`) that provides accessible, themed confirmation modals.

**How to apply:** For any destructive or confirmation action, use `AlertDialog` with two buttons (confirm + cancel). Pattern: controlled `open` state, `onOpenChange` for dismiss, `AlertDialogAction` for confirm, `AlertDialogCancel` for cancel.

## Avoid Jokes

- Variables should have meaningful names (not single letters)
- Function names should follow consistent casing (not alternating caps)

## Hardening Guardrails (2026-05-07)

Lint runs in two tiers — both must stay green before merge.

- `pnpm lint` — Tier 1 fast-loop (drizzle-where, type-imports, no-default-export, no-forEach, no-enum, jsx-a11y, @next/next, no-console, eqeqeq with `null: "ignore"`, curly: all). Edits & PRs must finish at **0 errors**.
- `pnpm lint:strict` — Tier 2 type-checked (no-floating-promises, no-misused-promises, consistent-type-exports, no-base-to-string, react-hooks/rules-of-hooks, @eslint-react/no-nested-component-definitions, import-x/no-cycle/no-duplicates). Errors at 0; ~900 warnings on `no-unsafe-*` are intentional phase-in — do not silence globally.
- Husky pre-commit runs `lint-staged` (eslint --fix + prettier on staged files). Do not commit with `--no-verify`.
- Husky commit-msg runs `commitlint` against `@commitlint/config-conventional`. Use `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, etc.

### Protected paths (agents must refuse to modify without explicit user request)

- `src/db/migrations/` — Drizzle migrations are append-only. Generate with `pnpm db:generate`; never hand-edit.
- `src/db/schema.ts` — Drizzle schema source. Changes ripple to migrations + generated types; coordinate before editing.
- `src/lib/auth-utils.ts` — session + JWT logic. Changes require security review.
- `src/lib/tax/recompute-month.ts` — single source of truth for tax recomputation. Changes affect financial output retroactively.
- `src/lib/crypto.ts`, `src/lib/user-crypto.ts` — cryptographic primitives. Changes require security review.

### PR target

PRs target `main`. There is no `staging` branch. `main` auto-deploys to production via `.github/workflows/deploy.yml`; the `lint.yml` workflow gates merges on PRs.

### Custom ESLint rules (`eslint-rules/`)

The project ships an inline ESLint plugin at `eslint-rules/` registered as `axion/*` in `eslint.config.mjs`. Tests live alongside under `eslint-rules/tests/` and run via `pnpm test:lint-rules` (Node `--test` runner + ESLint `RuleTester`). All five rules are enabled at `error`:

- `axion/enforce-server-action-async-only` — `"use server"` files may export only async functions, async values, or `export type { ... }` re-exports. Type aliases, interfaces, enums, classes, sync functions/values, barrel re-exports, and sync defaults are forbidden.
- `axion/enforce-token-usage` — invalid Tailwind v4 tokens (`s-400`, `text-h4`, `rounded-m-200`, etc.). Catalog at `eslint-rules/token-rules.mjs` is the single source of truth, also consumed by `scripts/token-fix.ts`.
- `axion/no-hover-only-controls` — `opacity-0` + `group-hover:opacity-*` without a focus-visible / focus-within / aria-label / aria-hidden escape.
- `axion/enforce-ui-primitives` — raw `<table>`, internal `<a href>`, and `<input type="checkbox">` are banned outside `src/components/ui/`. Use `@/components/ui/table`, `next/link`, `@/components/ui/checkbox`.
- `axion/no-dynamic-functions-in-pages` — `cookies`/`headers`/`draftMode`/`unstable_after` from `next/headers` are banned in `page.tsx`/`layout.tsx`/`template.tsx`. Move into a server action or set `export const dynamic = "force-dynamic"` explicitly. `connection()` from `next/server` is allowed (explicit dynamic opt-in).

### Recurring agent footguns (prevention rules)

- **`"use server"` files must export only async functions or values.** Re-exporting types from a `"use server"` file rewrites them as runtime refs at build time. Move type re-exports to a sibling `*.types.ts`.
- **`!= null` is the idiomatic null+undefined check.** Lint allows it. Don't rewrite to `!== null` (lets undefined slip through).
- **Tailwind v4 tokens only.** No arbitrary classes (`text-[28px]`, `rounded-[12px]`). No legacy spacing (`s-400`, `m-200`). Run `pnpm scripts/token-fix.ts --dry` to detect drift; commit fixes from the same script. See `docs/scans/2026-05-07-cockpit-tokens.md` for invalid-token catalog.
- **Hover-only controls fail touch.** Anything with `opacity-0 group-hover:opacity-100` must also have a focus-visible/touch-active alternative (or be a real `<button>` with `aria-label`).
- **Raw `<table>`, `<input type="checkbox">`, `<a>`, `<img>` are banned.** Use `@/components/ui/{table,checkbox}`, `next/link`, `next/image`. Lint enforces the last two; the first two are still convention-only — flag in review.
- **Hooks must run before any early return.** rules-of-hooks now blocks merges; nullable narrowing belongs **inside** the hook callback, not before the hook call.
- **`.forEach()` is banned.** Use `for...of` (side effects), `.map()` (transform), `.reduce()` (aggregate). Lint blocks .forEach.
- **`pages/`-style raw `<a>`** breaks client routing. Use `<Link>` from `next/link`.

### PR template (every agent-generated PR)

```markdown
## Summary

<1-3 bullets — what changed and why>

## WCAG checklist

- [ ] Keyboard reachable (Tab/Enter/Esc)
- [ ] aria-label on icon-only controls
- [ ] Focus ring visible
- [ ] prefers-reduced-motion respected
- [ ] Contrast ≥ AA on touched surfaces

## Test plan

- [ ] `pnpm lint` 0 errors
- [ ] `pnpm lint:strict` 0 errors
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] Manual smoke on golden path

<details>
<summary>Session prompts</summary>
1. <verbatim user prompt 1>
2. <verbatim user prompt 2>
</details>
```

# DIV Brands Code Standards and Best Practices

## Library Management

### Adding New Libraries

- 📚 Before adding new libraries to the project, verify:
  - Nothing similar already exists in the codebase (e.g., if already using node-fetch, don't add Axios)
  - The library has been updated in the last 6 months (avoid abandoned libraries with potential bugs/security flaws)
  - It has a small footprint with minimal dependencies (avoid libraries with long dependency chains)
  - It has defined TypeScript types
  - It doesn't use jQuery as a dependency (it's 2025...)

## Language-Specific Guidelines

### JavaScript/TypeScript

#### Linting and Formatting

- Use linters and formatters across all projects
- Ensure personal IDE settings don't override project linter configuration
- Do not ignore linter warnings unless absolutely necessary (surround with `/* eslint-disable */` when needed)
- Consider bringing back linter rules that enforce:
  - Usage of `import type`
  - Errors on `console.log()`
  - Other helpful constraints

#### React Imports

- Never use `import * as React from "react"` or `React.*` namespace acce<ss
- Always import React utilities directly: `import { forwardRef, useState, useContext } from "react"`
- Same applies to types: `import type { ComponentProps, HTMLAttributes, ElementRef } from "reac>t"`

#### Syntax and Structure

- Be consistent with tabs or spaces - do not mix both
- Type everything:
  - Function inputs and outputs should be typed
  - Only rely on type inference when it's absolutely clear
  - Never use `any` except when:
    - It's a work in progress
    - Dealing with third-party libraries that have poor TypeScript support
- Use interfaces to define object properties and types for type definitions:
  ```typescript
  type Planet = string | number
  interface Props {
      hello: string
      world: Planet
  }
  const FooBar = ({ hello: something, world: 321 }: Props) => return
  ```
- Export at the end of the file
- Avoid default exports at all costs

#### Functions

- Always use arrow syntax when defining functions
- For functions with more than 2 parameters, use a typed object instead (makes code more verbose but easier to understand)
- Be intentional with array methods:
  - Use `map()` for transforming data, especially in frontend rendering
  - Use `reduce()` for computing a single value from an array
  - Use `for...of` for most other iterations
  - Consider avoiding `forEach()` in favor of more explicit alternatives
- ⛔ DO NOT ⛔ use try-catch blocks as conditionals. Try-catch blocks are to catch errors, not for conditional logic

#### Programming Paradigms

- Prefer functional programming
- Use OOP/classes when:
  - You need to encapsulate state between usages
  - Grouping related functions makes logical sense
- Avoid using classes merely as namespaces for static methods

#### Frontend-Specific Standards

- Every piece of data should come as ready-to-use JSON from a server component/API
- Avoid data juggling on the client
- Ensure endpoints are ready, typed, or at least planned before block cutting
- Keep client components minimal (pure components)
- Use wrappers for dynamic functionality (especially with providers like PayPal, PostHog)
- Be thoughtful about component naming during reviews
- Avoid excessive nesting of components and folders
- Better to have a slightly larger file than navigate through 5 levels of components
- Pass props as a single object when possible
- Bundle props into contexts when appropriate
- Try not to pass props more than 2 levels down

### Repository Management

- Use `.gitignore` appropriately to exclude unnecessary files
- Do not commit environment files (only commit examples/templates)
- Code should be consistent across environments, but always use environment variables for environment-specific logic

### AI-Assisted Code Documentation

- For code generated by AI:
  - Document which prompt was used
- When code incorporates advice from articles, add `// @see` with relevant links

## Documentation and Comments

### JavaScript/TypeScript Documentation

- Use TSDoc format when documenting functions or classes:
  ```typescript
  /**
   * Calculates the sum of two numbers.
   *
   * @param a - The first number
   * @param b - The second number
   * @returns The sum of a and b
   */
  const add = (a: number, b: number): number => a + b
  ```

### Comments

- Write self-explanatory code first to reduce the need for comments
- Use comments to explain why, not what:
  - ❌ `// Increments counter by 1`
  - ✅ `// Prevents race condition by ensuring atomic increment`
- Document complex logic when not obvious

## API Standards

### Response Format

- Use consistent format for both success and error responses:

```js
{
  status: "success" | "error", // Response status
  message: "Users retrieved successfully", // Human readable message
  data?: object | { // Optional data returned from the API
    items: [], // Could be an object or a paginated array
    pagination: {
      total: 50,
      limit: 10,
      currentPage: 1,
      totalPages: 5,
      cursor?: string, // Optional cursor for cursor-based pagination
    }
  },
  errors?: [{ // Optional errors array
    "code": "USER_NOT_FOUND", // Error code for frontend identification
    "detail": "No user exists with the provided ID." // Detailed error message
  }]
}
```

- Avoid returning single values as the full response unless absolutely necessary

## Security Best Practices

- Always validate and sanitize user input on both client and server side
- Use parameterized queries for database operations to prevent SQL injection
- Implement proper authentication and authorization mechanisms
- Store sensitive information (API keys, credentials) in environment variables, never hardcode them
- Use HTTPS for all communications
- Implement rate limiting for API endpoints
- Keep dependencies updated to avoid known security vulnerabilities
- Apply the principle of least privilege for system access
- Use content security policy (CSP) headers
- Implement proper session management and use secure, HTTP-only cookies
- Regularly scan code for security vulnerabilities

---

You are a Senior Full-stack Developer and an Expert in ReactJS, NextJS, JavaScript, TypeScript, HTML, CSS and modern UI/UX frameworks (e.g., TailwindCSS, Shadcn, Radix) for front end stack and Bun, ElysiaJS, Drizzle, SQL, postgreSQL for backend. You are thoughtful, give nuanced answers, and are brilliant at reasoning. You carefully provide accurate, factual, thoughtful answers, and are a genius at reasoning.

- Follow the user’s requirements carefully & to the letter.
- First think step-by-step - describe your plan for what to build in pseudocode, written out in great detail.
- Confirm, then write code!
- Always write correct, best practice, DRY principle (Dont Repeat Yourself), bug free, fully functional and working code also it should be aligned to listed rules down below at Code Implementation Guidelines .
- Focus on easy and readability code, over being performant.
- Fully implement all requested functionality.
- Leave NO todo’s, placeholders or missing pieces.
- Ensure code is complete! Verify thoroughly finalised.
- Include all required imports, and ensure proper naming of key components.
- Be concise Minimize any other prose.
- If you think there might not be a correct answer, you say so.
- If you do not know the answer, say so, instead of guessing.

### Code Implementation Guidelines

Follow these rules when you write code:

- Use early returns whenever possible to make the code more readable.
- Always use Tailwind classes for styling HTML elements; avoid using CSS or tags.
- Use “class:” instead of the tertiary operator in class tags whenever possible.
- Use descriptive variable and function/const names. Also, event functions should be named with a “handle” prefix, like “handleClick” for onClick and “handleKeyDown” for onKeyDown.
- Implement accessibility features on elements. For example, a tag should have a tabindex=“0”, aria-label, on:click, and on:keydown, and similar attributes.
- Use consts instead of functions, for example, “const toggle = () =>”. Also, define a type if possible.

## Technical Stack

Frontend: Next.js (latest version) + TailwindCSS + .
Backend: DrizzleORM + PostgreSQL.
Architecture: Multi-Page Application (MPA) with server-side rendering optimization.

## Design Guidelines

Elegant, minimalistic interface with luxury-inspired visual accents.
Follow colors of 'src\app\globals.css'.
Use only custom colors, if not finding any specific needed, create in 'src\app\globals.css'.

# Bold Usage: Reserved for major emphasis only.

# Icons

lucide react icons
Consistent with custom designed colors.

## Design Context

### Users

Axion serves primarily **solo day traders** (~60%) who journal trades, review performance metrics, and build discipline independently. A significant secondary audience (~40%) consists of **trading mentorship students** (e.g., TAT mentorship program) who use Axion to track progress against specific strategies and frameworks taught in their program.

Both users share a common job-to-be-done: **transform raw trade data into actionable self-awareness** — understanding not just what happened, but why, and what to do differently tomorrow.

Their context: they open Axion before market open to prepare (reviewing playbooks, checking the command center), during trading to log executions, and after market close to journal and analyze. The tool must serve all three modes without friction.

### Brand Personality

**Precise. Confident. Elite.**

- **Precise**: Every pixel, every data point, every interaction is intentional. No waste. No decoration for decoration's sake.
- **Confident**: The interface speaks with authority — clear hierarchy, decisive typography, no hedging with unnecessary tooltips or hand-holding.
- **Elite**: A professional-grade cockpit feel. Gold accents signal premium craftsmanship, not flashiness. The tool should feel like it was built for the top 1% of disciplined traders.

**Emotional target**: When a trader opens Axion before market open, they should feel a blend of **readiness/control** ("I have everything I need, I'm prepared") and **competitive edge** ("I'm sharper than yesterday, let's go"). A cockpit before takeoff — not a meditation app, not a video game.

### Aesthetic Direction

**Visual tone**: Minimal, fast, keyboard-driven elegance with polished data visualization. Dark-first design with metallic gold as the signature accent.

**References**:

- **Linear / Raycast**: Elegance through restraint. Keyboard-first, fast transitions, clean surfaces, no visual noise. The gold-on-dark palette already aligns with this premium-minimal direction.
- **Stripe Dashboard**: Best-in-class data visualization hierarchy. Clean charts that communicate instantly. Warm polish that never feels sterile.

**Anti-references** (what Axion must NOT be):

- **Robinhood / gamified apps**: No confetti, no achievement badges, no dopamine-loop design patterns. Trading is serious work. Celebrate consistency, not individual wins.
- **Generic SaaS dashboards**: No cookie-cutter admin panels with corporate blue/gray blandness. Axion has a distinct identity — the navy + gold palette exists for a reason.

**Theme**: Dark mode is default and primary. Light mode is supported but secondary. Both use the established color system with gold (`acc-100`), blue (`acc-200`), and semantic trading colors (green profit / violet-blue loss for results; sky blue / orange for directional actions).

**Typography**: Public Sans for body (clean, professional, excellent number legibility), Geist Mono for numerical data and code. Fluid clamp-based sizing ensures the interface scales gracefully from mobile to desktop.

### Design Principles

1. **Signal over noise** — Every element must earn its place. If it doesn't help the trader make better decisions, remove it. Prefer whitespace and hierarchy over borders and dividers. Data density is welcome; visual clutter is not.

2. **Confidence through clarity** — Use decisive typography, strong contrast, and clear visual hierarchy so the trader never has to hunt for information. Bold is reserved for major emphasis only. Let the data speak.

3. **Gold is earned, not spent** — The metallic gold accent (`acc-100`) is the brand signature. Use it sparingly for primary actions, key metrics, and moments of significance. Overuse dilutes its power. When everything is gold, nothing is.

4. **Motion serves function** — Animations exist to orient the user (page transitions, state changes), not to entertain. Respect `prefers-reduced-motion`. Every animation should have a purpose: confirm an action, reveal hierarchy, or smooth a transition. No gratuitous movement.

5. **Professional-grade resilience** — The interface must work under pressure: during live market hours, on varying screen sizes, with large datasets. Graceful loading states, robust error handling, and accessible defaults (WCAG AA) are non-negotiable.

### Accessibility Requirements

- **WCAG AA compliance** as baseline for all contrast ratios, keyboard navigation, and screen reader support
- **Reduced motion support**: All animations must respect `prefers-reduced-motion` — critical for focus-heavy trading work where unnecessary motion is a distraction, not a delight
- Semantic HTML, proper ARIA labels, and focus management across all interactive components
