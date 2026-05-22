# Impeccable sweep — Wave 7 Auth (rows #24-28)

**Date:** 2026-05-12
**Wave:** 7 / Auth
**Routes covered:**

- Row #24 — `src/app/[locale]/(auth)/login/page.tsx`
- Row #25 — `src/app/[locale]/(auth)/register/page.tsx`
- Row #26 — `src/app/[locale]/(auth)/forgot-password/page.tsx`
- Row #27 — `src/app/[locale]/(auth)/verify-email/page.tsx`
- Row #28 — `src/app/[locale]/(auth)/select-account/page.tsx`

Combined doc per Wave 4/5/6 precedent: all five rows render through the same `(auth)/layout.tsx` shell, mount sibling components from `src/components/auth/*`, and share the same token vocabulary. Separate scans would duplicate 90% of content.

---

## Phase 0 — Orchestrator inventory

`(auth)/layout.tsx` is the shell — calls `await connection()` (dynamic opt-in), renders a centered `<main>` with skip-to-content link and a fixed BRAVO footer. Each route is a short async server component that calls `auth()`, redirects on session-present, and forwards to the matching client form:

| Row | Page                                    | Mounts                   | Client component                                                                  |
| --- | --------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| #24 | `(auth)/login/page.tsx` (21L)           | `<LoginForm />`          | `src/components/auth/login-form.tsx` (420L, multi-step)                           |
| #25 | `(auth)/register/page.tsx` (16L)        | `<RegisterForm />`       | `src/components/auth/register-form.tsx` (287L)                                    |
| #26 | `(auth)/forgot-password/page.tsx` (16L) | `<ForgotPasswordForm />` | `src/components/auth/forgot-password-form.tsx` (457L, 3-step OTP)                 |
| #27 | `(auth)/verify-email/page.tsx` (16L)    | `<VerifyEmailForm />`    | `src/components/auth/verify-email-form.tsx` (241L)                                |
| #28 | `(auth)/select-account/page.tsx` (38L)  | inline back-link         | `<AccountPicker />` is mounted from `login-form.tsx` step 2 (not the page itself) |

`<AccountPicker />` (`src/components/auth/account-picker.tsx`, 134L) appears unused by the route shells — `login-form.tsx` inlines its own account-selection step rather than mounting it. Likely legacy. Flagging for the cleanup backlog, not the sweep.

---

## Phase 1a — Token-discipline scan

### Trade-color hijacks: none

`grep -rn "text-trade-buy|text-trade-sell" src/components/auth/ src/app/[locale]/(auth)/` returns zero matches. The auth surface paints status purely with the verdict triad:

- Error banners: `bg-fb-error/10 text-fb-error` — `login-form.tsx` L176, L293 · `register-form.tsx` L108 · `forgot-password-form.tsx` L169, L252, L351 · `verify-email-form.tsx` L169
- Password-requirement satisfied: `text-fb-success` — `register-form.tsx` L201
- Recovery / verify success: `text-fb-success` — `forgot-password-form.tsx` L337, `verify-email-form.tsx` L131

This is the cleanest token-discipline surface in the project. Documenting as canonical.

### System-level finding: `brand-*` / `acc-*` duplication

`grep -n "brand-\|acc-100\|acc-200" src/app/globals.css` reveals:

| Token               | Light hex | Dark hex  |
| ------------------- | --------- | --------- |
| `--color-acc-100`   | `#8c6e40` | `#c29d6a` |
| `--color-brand-500` | `#8c6e40` | `#c29d6a` |

`acc-100` and `brand-500` resolve to **identical hex literals in both themes**. They are duplicate tokens. The auth surface consistently reaches for `text-brand-500 hover:text-brand-400` for link styling and `bg-brand-500/10 border-brand-500` for selected card chrome. The rest of the app uses `text-acc-100` for the same visual role.

`grep -rn "text-brand-" src/` shows 15 call sites in two pockets:

- All five auth components + `select-account/page.tsx` (the auth surface itself)
- `src/components/journal/trade-mode-selector.tsx` L35/L53 and `src/components/journal/scaled-trade-form.tsx` L1005 (leaked from auth conventions during a copy)

This is a system-level token-discipline issue that touches 11 files across two surfaces. Out of scope for a single-route sweep but **high-priority backlog** — see Phase 4. Picking either `acc-*` or `brand-*` as canonical and migrating the other matters because, today, "what bronze should I reach for?" has two equally-correct answers and the next contributor will pick the wrong one half the time.

### Bronze (`acc-100`) usage in layout

`(auth)/layout.tsx` L16: the skip-to-content link uses `focus:bg-acc-100 focus:text-bg-100`. Correct: this is a primary-affordance moment surfaced only on keyboard focus, exactly the kind of high-signal use bronze is reserved for.

---

## Phase 1b — Accessibility scan

### Decorative icons missing `aria-hidden`

Wave 7's a11y misses cluster in four patterns: spinners (`<Loader2 />`), back-link icons (`<ArrowLeft />`), info icons next to inline labels (`<Mail />`, `<CheckCircle2 />`), and decorative type icons inside selectable rows (`<Building2 />`, `<User />`).

**`src/app/[locale]/(auth)/select-account/page.tsx`**

- L31 `<ArrowLeft />` — inside `<Link>` with text "backToLoginButton"

**`src/components/auth/login-form.tsx`**

- L245 `<Loader2 />` — account-selection continue spinner
- L259 `<ArrowLeft />` — back-to-credentials button (parent has `aria-label`)
- L302 `<Mail />` — decorative inline icon next to "notVerifiedError" label
- L318 `<Loader2 />` — resend-verification spinner
- L401 `<Loader2 />` — credentials submit spinner

**`src/components/auth/register-form.tsx`**

- L268 `<Loader2 />` — submit spinner

**`src/components/auth/forgot-password-form.tsx`**

- L206 `<Loader2 />` — send-code spinner
- L217 `<ArrowLeft />` — back-to-login link icon
- L283 `<Loader2 />` — OTP verifying spinner (standalone, no parent button label)
- L314 `<ArrowLeft />` — back-to-email button icon
- L337 `<CheckCircle2 />` — decorative success icon above step-3 heading
- L450 `<Loader2 />` — reset-password submit spinner

**`src/components/auth/verify-email-form.tsx`**

- L131 `<CheckCircle2 />` — success-state heading decoration
- L207 `<Loader2 />` — verify submit spinner
- L233 `<ArrowLeft />` — back-to-login link icon

**`src/components/auth/account-picker.tsx`**

- L85 `<Building2 />` — prop-account row type icon
- L87 `<User />` — personal-account row type icon
- L128 `<Loader2 />` — continue spinner

### Already-compliant a11y

`login-form.tsx` already wires `aria-hidden` on the embedded account-picker icons (L206, L208), eye/eye-off toggles (L377, L379). `register-form.tsx` already has `aria-hidden` on Check/X password-rule icons (L205, L207) and eye toggles. `forgot-password-form.tsx` already has `aria-hidden` on eye toggles. Each form sets `role="alert"` / `aria-live` on error banners. Skip-to-content link is wired in layout. `account-picker.tsx` has `role="radiogroup"` and `aria-checked`. **This sweep is the long-tail polish, not a remediation.**

### Standalone Loader2 in `forgot-password-form.tsx` L283

This spinner is unique — it's _not_ inside a button with a text label. It sits in its own `<div>` to indicate verifying state for the OTP input above. Adding `aria-hidden` is correct because the form already has `aria-live` regions for state announcement and the spinner is decorative.

---

## Themes

1. **Auth is the cleanest surface in the project for token discipline.** Zero trade-color hijacks, verdict triad applied correctly across all status states. The discipline likely flowed from the fact that monetary state has no meaning in pre-login flows — there's no `trade-buy/sell` temptation when there's no trade to color.
2. **System-level token duplication outweighs any local issue.** `brand-*` and `acc-*` resolving to identical hex is the kind of finding only a cross-surface read can produce. The auth-surface convention is internally consistent, so this isn't a remediation for Wave 7 itself, but flagging it loud is the highest-leverage thing the sweep can do.
3. **Spinners and back-links dominate the a11y miss list.** Both follow predictable patterns: `<Loader2 />` always paired with a text label in a button; `<ArrowLeft />` always paired with a "back" label in a link. Both are mechanically `aria-hidden="true"`. The fix is a single-pass sweep, and the patterns are common enough that a shared `<Spinner>` and `<BackLink>` primitive would prevent the next contributor from drifting back.

---

## Phase 3 — Edits applied

Pure a11y additions — no token rewrites. Seventeen decorative icons receive `aria-hidden="true"`.

### `src/app/[locale]/(auth)/select-account/page.tsx`

- L31 `<ArrowLeft />` → +`aria-hidden="true"`

### `src/components/auth/login-form.tsx`

- L245 `<Loader2 />`, L259 `<ArrowLeft />`, L302 `<Mail />`, L318 `<Loader2 />`, L401 `<Loader2 />` → +`aria-hidden="true"` each

### `src/components/auth/register-form.tsx`

- L268 `<Loader2 />` → +`aria-hidden="true"`

### `src/components/auth/forgot-password-form.tsx`

- L206 `<Loader2 />`, L217 `<ArrowLeft />`, L283 `<Loader2 />`, L314 `<ArrowLeft />`, L337 `<CheckCircle2 />`, L450 `<Loader2 />` → +`aria-hidden="true"` each

### `src/components/auth/verify-email-form.tsx`

- L131 `<CheckCircle2 />`, L207 `<Loader2 />`, L233 `<ArrowLeft />` → +`aria-hidden="true"` each

### `src/components/auth/account-picker.tsx`

- L85 `<Building2 />`, L87 `<User />`, L128 `<Loader2 />` → +`aria-hidden="true"` each

---

## Phase 4 — Deferred to backlog

- **Consolidate `brand-*` and `acc-*` into a single bronze scale.** Both resolve to identical hex in both themes; the duplication exists in `src/app/globals.css` and propagates to 11 call sites (5 auth components + `select-account/page.tsx` + `journal/trade-mode-selector.tsx` + `journal/scaled-trade-form.tsx`). Pick a canonical scale (recommend `acc-100`, since it's the documented "metallic gold accent" and used outside auth), retire the other, and migrate call sites in one pass. **High priority** — every new auth-adjacent surface today silently forks the question.
- **Extract shared `<Spinner aria-hidden />` and `<BackLink>` primitives.** Nine `<Loader2 className="animate-spin" />` and four `<ArrowLeft />`+text patterns repeat across auth components. Pull into `@/components/ui/spinner` and `@/components/ui/back-link` so future callers inherit the `aria-hidden` and motion-reduce defaults. The Wave 7 sweep just normalized 17 sites; preventing drift back is the next step.
- **Delete or merge `src/components/auth/account-picker.tsx`.** The standalone `<AccountPicker />` component is unused — `login-form.tsx` inlines its own account-selection step (L149-265) rather than importing it. Either replace the inline step with `<AccountPicker />` and consolidate the implementations, or delete the standalone file.
- **Add a "verdict triad applied" annotation to DESIGN.md auth section.** Wave 7 confirms the auth surface as the canonical example of correct verdict-triad usage. Document it so future status-surface designs (auth toasts, signup banners, etc.) inherit the convention.

---

## Sign-off

- `pnpm lint` — clean (0 errors)
- `pnpm exec tsc --noEmit` — clean
- Runbook rows #24-28 marked done
- Backlog updated with 4 items above
