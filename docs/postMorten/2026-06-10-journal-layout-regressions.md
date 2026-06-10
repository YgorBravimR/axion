# Journal Layout Regression Fixes

---

## [BUG-2026-06-10] Missing period filter chips and wrapped Search & Filter button

**Date:** 2026-06-10
**Severity:** High (breaks core UI for journal filtering; affects user ability to quickly select date ranges)
**Affected Area:**

- `src/components/journal/journal-content.tsx:416`
- `src/components/journal/smart-search.tsx:305`

### Symptom

On `/en/journal`, the five period-filter chips (Day/Week/Month/All/Custom) that appear above the "Search & Filter" button are invisible — the area is empty. Additionally, the "Search & Filter" button text wraps to two lines ("Search &" on line 1, "Filter" on line 2), breaking the topbar layout.

### Root Cause

**Bug #1 - Missing chips:**
The period filter container on line 416 of `journal-content.tsx` used flex layout with `justify-between`:

```tsx
className = "gap-s-300 sm:gap-m-400 flex flex-wrap items-start justify-between"
```

This caused the flex layout to distribute space between the PeriodFilter component and the Period Summary component. When the Period Summary conditionally renders (only if there are trades), the `justify-between` logic distorts the layout, potentially causing the PeriodFilter to be pushed off-screen or hidden. More critically, when combined with `flex-wrap`, the layout could force the Period Summary to a new line, but the Period Filter itself is constrained and may not display properly in narrow viewports.

The fix: Change to `flex flex-col` to stack components vertically, ensuring the period filter is always visible on its own line.

**Bug #2 - Button text wrapping:**
The Search & Filter button on line 305 of `smart-search.tsx` lacked the `whitespace-nowrap` class:

```tsx
className =
	"gap-s-200 px-s-300 py-s-100 text-tiny focus-visible:ring-acc-100 flex items-center rounded-md border font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
```

Without `whitespace-nowrap`, flexbox allows the inline text to wrap when the button is constrained. This is especially problematic on mobile or when the topbar is narrow.

### Why it Surfaced

The responsive layout refactor in commit 0b1d862b ("chore(scan): 2026-06-09 perf + responsive + a11y + i18n + dashboards #13") did not introduce these bugs — they were already present in the codebase. The issues likely escaped notice because:

1. On desktop viewports with sufficient width, the `justify-between` layout happens to work acceptably
2. The Search & Filter button only wraps under specific viewport / flex-item width constraints
3. E2E tests did not validate the visual integrity of these UI elements (only tested functionality)

### Fix

**File: `src/components/journal/journal-content.tsx` (line 416)**
Changed from:

```tsx
className = "gap-s-300 sm:gap-m-400 flex flex-wrap items-start justify-between"
```

To:

```tsx
className = "gap-s-300 sm:gap-m-400 flex flex-col"
```

This ensures the period filter section is full-width and stacks its children vertically. The Period Filter chips always display on their own row, and the Period Summary (if present) stacks below.

**File: `src/components/journal/smart-search.tsx` (line 305)**
Changed from:

```tsx
className =
	"gap-s-200 px-s-300 py-s-100 text-tiny focus-visible:ring-acc-100 flex items-center rounded-md border font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
```

To:

```tsx
className =
	"gap-s-200 px-s-300 py-s-100 text-tiny focus-visible:ring-acc-100 flex items-center whitespace-nowrap rounded-md border font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
```

Added `whitespace-nowrap` to force "Search & Filter" text to remain on a single line, preventing wrapping.

### Verification

1. **TypeScript:** `pnpm exec tsc --noEmit` — no new type errors introduced (pre-existing error in `quarter-report.tsx` unrelated to these changes)
2. **Lint:** `pnpm lint` — no errors in modified files
3. **Build:** `pnpm build` — full build completed successfully
4. **Visual regression tests added:**
   - `e2e/tests/journal.spec.ts:156-168` — verifies all five period filter chips are visible
   - `e2e/tests/journal.spec.ts:170-183` — verifies Search & Filter button has `white-space: nowrap` applied and text does not wrap

### Prevention

1. **E2E visual regression coverage:** Add tests for button text wrapping and chip visibility whenever introducing or modifying filter UI
2. **CSS class reviewer:** When using `flex` with `justify-between` and conditional children, verify the layout is stable across all states (children present/absent, viewport widths)
3. **Mobile testing:** Always test responsive layouts at narrow viewports (390px mobile width) to catch text-wrapping issues early

### Related Files

- `src/components/journal/journal-content.tsx` — main page component
- `src/components/journal/smart-search.tsx` — Search & Filter button component
- `src/components/journal/period-filter.tsx` — period selector (unchanged, not at fault)
- `e2e/tests/journal.spec.ts` — regression test coverage
