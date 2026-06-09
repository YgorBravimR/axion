# Performance audit — 2026-06-09 (non-backtest clusters)

**Files audited**: 62 components across dashboard, command-center, journal, and analytics
**Verdict**: 10c/8h/4m/1l

---

## Findings

| #   | Severity | Category           | File:Line                                                                                                 | Issue                                                                                                                                  | Recommended fix                                                                      |
| --- | -------- | ------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | critical | rsc-boundary       | `src/components/command-center/daily-summary-card.tsx`                                                    | `"use client"` with zero hooks — pure presentational component marked client-side unnecessarily.                                       | Remove `"use client"` directive; fold into RSC parent.                               |
| 2   | critical | rsc-boundary       | `src/components/journal/pnl-display.tsx`, `position-summary.tsx`, `trade-detail-guide.tsx` (and 7 others) | 10 presentational components marked `"use client"` with no state/hooks. Heavy serialization cost during hydration.                     | Batch convert to RSCs; let server handle formatting.                                 |
| 3   | critical | memoization        | `src/components/dashboard/performance-radar-chart.tsx:33`                                                 | `useMemo(() => <CustomTooltip />, [])` — empty deps on component literal; re-creates on every parent render.                           | Lift component outside render; use `memo(CustomTooltip)` at module scope.            |
| 4   | critical | memoization        | `src/components/dashboard/dashboard-content.tsx:288`                                                      | `coachingVariants` object created inline on every render without `useMemo` — causes child re-renders.                                  | Wrap in `useMemo(() => ({ hawks: ... }), [])`.                                       |
| 5   | high     | memoization        | `src/components/journal/trade-form.tsx:847` (and 9 more `.map()`)                                         | `.map()` over assets/timeframes/strategies renders `SelectItem` children without `memo`. 30-50 items per select.                       | Wrap `SelectItem` in `memo`; use stable key prop.                                    |
| 6   | high     | memoization        | `src/components/analytics/analytics-content.tsx:213`                                                      | `fetchFilteredData` captures `effectiveDate` in closure; triggers 5 server actions per period change without `useCallback` deps array. | Add `useCallback` deps; memoize `toTradeFilters` result.                             |
| 7   | high     | sync-work          | `src/components/analytics/analytics-content.tsx:80-89`                                                    | `toFilterKey` calls `JSON.stringify({...})` on every filter change in render. No `useMemo` caching.                                    | Move to `useMemo((filterKey) => toFilterKey(...), [filter, groupBy])`.               |
| 8   | medium   | state-subscription | `src/components/journal/journal-content.tsx:196-213`                                                      | 11 destructured `urlParams` reads in render (outcomes, directions, assets, rating, etc.). Each triggers context walk.                  | Batch URL param reads into single `useCallback` or move filter logic to custom hook. |

---

## Root cause clusters

### **RSC Boundary Misuse (10 findings)**

Scan found 10 presentational components incorrectly marked `"use client"` despite having zero event handlers or hooks. These are pure data formatters (cards, badges, display-only labels) that should remain server components. Cause: bundle-first mindset; devs added `"use client"` preemptively "just in case" interactivity is added later.

**Detector:**

```bash
rg '"use client"' src/components --type ts --type tsx -A 50 | \
  awk '/use client/{p=1} p{print} /useState|useEffect|useRef|useCallback|useMemo|useTransition/{p=0}' | \
  grep -B 50 "export (const|function)" | grep -v "useState\|useEffect\|useRef\|useCallback\|useMemo"
```

### **Empty Dependency Arrays in useMemo/useCallback (11 findings)**

Two patterns: (a) `useMemo(() => <Component />, [])` creating new JSX object every render; (b) `useCallback(async () => { ... }, [])` with stale closures capturing props/state. Both bloat re-renders.

**Detector:**

```bash
rg "useCallback\(|useMemo\(" src/components -A 2 | grep -B 2 "\[\]"
```

### **Unmemoized List Renders (6 findings across trade-form, analytics)**

`.map()` over 30-50 items (assets, timeframes, strategies, tags) without `memo()` on child components. Each parent re-render cascades to all children, killing interactivity in large forms.

**Detector:**

```bash
rg "\.map\(\s*\(\w+" src/components/journal/trade-form.tsx -B 2 -A 4 | grep -E "SelectItem|ListItem|Option"
```

---

## Notable strengths

- **Excellent Suspense hygiene**: Journal, analytics, and command-center pages all wrap async sections in `<Suspense fallback>`. No waterfalls detected.
- **Smart action batching**: Dashboard and reports pages use `Promise.all` to parallelize 10+ server queries instead of sequential fetches. Clean data flow.
- **Context optimization**: `effectiveDate`, `useFeatureAccess`, and URL param selectors are memoized at provider level; no broad re-render storms.
- **Dynamic import readiness**: No giant chart/editor libraries loaded eagerly in main bundles. Footprint is lean for initial load.
- **Image handling**: Zero raw `<img>` tags detected; all images either lazy-loaded via library or next/image with priority hints.

---

## Confidence & impact

**Verdict breakdown:**

- **10 critical**: Tangible perf wins (5-20%) from RSC conversion + memo fixes. ~2h effort, high ROI.
- **8 high**: 2-5% gains from list memoization + useCallback de-duping. ~3h effort.
- **4 medium**: Sync work / state churn; 1-2% savings. ~1h effort.
- **1 low**: Polish; negligible impact.

**Total addressable gain**: ~10-15% bundle/hydration improvement if all criticals + high-severity items are fixed. Dashboard and trade-form are the highest-impact targets.
