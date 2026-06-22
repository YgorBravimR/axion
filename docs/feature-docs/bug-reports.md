# Bug Reports

> In-app feedback with console / network capture and screenshots. Admin triage.

**Server actions:** `bug-reports.ts`
**Files:** report button surfaces in header / help menu; admin list elsewhere.

## Purpose

Capture friction the moment a trader hits it, with enough context (URL, user-agent, console errors, network errors, screenshots) that an engineer can reproduce without a follow-up call.

## What lives there

- Submit form: subject (200 chars), description, auto-captured currentUrl + userAgent + consoleLogs + networkErrors, up to 3 image uploads to S3.
- Admin list: paginated, with status + reporter + date.
- Admin triage: accept / reject / close + reason + notes.

## Inputs

Free-text subject + description; optional screenshots; auto-captured browser context.

## Outputs

- `bugReports` + `bugReportImages` rows.
- Status updates by admin (accept / reject / close).

## Cross-feature integrations

- **Auth** — tied to current session userId.
- **S3 uploads** — image storage.

## Where it fails

- **No status notifications to reporter.** Admin closes a report; reporter doesn't see it unless they revisit.
- **Console log capture is best-effort.** Some errors fire before the capture hook installs.
- **3-image limit is arbitrary.** Multi-step bugs sometimes need 5–6 captures.
- **No "duplicate of" link.** Two reports about the same bug aren't merged.

## Power combos

1. **Bug → fix-bugs skill loop.** Submit reports during the W1 audit walk → `/fix-bugs` skill clusters them by feature → fixes shipped in batches.
2. **Console + network capture.** Auto-attached context cuts back-and-forth. Pair with a screenshot showing the visual symptom.
