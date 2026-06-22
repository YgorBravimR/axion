# Auth & Multi-account

> Register → verify email → login → select account. Multi-account = N trading accounts per user (paper, real, prop).

**Routes:** `/[locale]/register`, `/login`, `/forgot-password`, `/verify-email`, `/select-account`
**Server actions:** `auth.ts`, `password-recovery.ts`, `email-verification.ts`
**Files:** `src/app/[locale]/(auth)/**`

## Purpose

Get a verified user into the right account context. Multi-account is first-class: one user, many accounts; pick at login.

## What lives there

- **Register** — email + password (bcrypt, 12 rounds).
- **Verify email** — 6-digit OTP, rate-limited (2 sends / 30 min, 5 verify attempts / 15 min).
- **Login** — email + password. If user has 1 account → direct to dashboard. Else → select-account.
- **Forgot password** — OTP-based reset with 6-min expiry.
- **Select account** — picker enriched with 7-day P&L sparkline per account.

## Inputs

Email, password, OTP codes, account choice.

## Outputs

- `users` row (email, hashed password, role, emailVerified).
- `tradingAccounts` row.
- Session JWT cookie with userId + accountId.

## Cross-feature integrations

- **Seed user data** on first login — default account + asset + timeframe.
- **Account picker enrichment** — single query for 7-day P&L per account.
- **Email service** — locale-aware templates.
- **Rate limiting** — DB-backed (survives cold starts).

## Where it fails

- **Email enumeration is hidden** but the side channel of timing isn't constant — sophisticated probes can still differentiate.
- **OTP expiry is 6 min.** Mobile networks + SMS-style email delays sometimes push past it. User has to request again.
- **No "passwordless" or 2FA.** Pure email + password.
- **Account picker shows P&L for inactive accounts** — visually noisy after archiving.
- **Session timeout silent.** Mid-session expiry redirects to login with `callbackUrl` but loses unsaved Journal entry drafts.
- **No SSO.** Solo-trader product, but corporate prop firms can't onboard staff via Google/Microsoft auth.

## Power combos

1. **Anti-enumeration parity.** Reset and verify both return `{success: true}` regardless of email existence — attacker can't enumerate. Pair with rate limits per email + IP.
2. **Account-picker sparkline.** At login, see which account had the worst week and pick that one to focus on first.
3. **Forgot-pw + email-verify share OTP path.** Same infra; users learn the flow once.
