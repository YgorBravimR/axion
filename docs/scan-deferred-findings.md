# Scan Deferred Findings

Issues identified during `/scan` passes that were intentionally deferred for dedicated refactor sessions.

## Layout — Architectural Refactors (deferred 2026-03-25)

### Client-side data fetching → Server-resolved props

**Files**: `user-menu.tsx`, `account-switcher.tsx`

Both components fetch data client-side via `useEffect` + `Promise.all`, causing a loading spinner flash on every page navigation. Per CLAUDE.md: "Every piece of data should come as ready-to-use JSON from a server component/API."

**Recommended fix**: Resolve user/account data in the server layout (`src/app/[locale]/(app)/layout.tsx`) and pass it down as props to `UserMenu` and `AccountSwitcher`. This eliminates the client-side waterfall and removes the need for loading states in navigation chrome.

**Complexity**: Medium — requires changing component signatures, moving data fetching to the layout, and updating all consumers.

### DRY duplication in collapsed/expanded variants

**Files**: `user-menu.tsx`, `account-switcher.tsx`

Both components have substantial duplicated JSX blocks between their collapsed (icon-only sidebar) and expanded (full sidebar) render paths. The dropdown content (menu items, labels, actions) is nearly identical in both branches.

**Recommended fix**: Extract the shared dropdown content into a sub-component or variable, and only vary the trigger button between collapsed/expanded states.

**Complexity**: Medium — requires careful refactoring to ensure the DropdownMenu portal behavior and sizing still work correctly in both modes.

## Providers — PostHog Lazy Loading (deferred 2026-03-25)

### Eager module-level PostHog initialization

**File**: `posthog-provider.tsx`

`posthog.init()` runs at module evaluation time (top-level `if` block, lines 11-26). This means the full PostHog SDK is eagerly loaded into the initial client bundle. Per the `bundle-defer-third-party` best practice, analytics libraries should be loaded after hydration.

**Recommended fix**: Wrap `PostHogProvider` in `next/dynamic` with `{ ssr: false }`, or move `posthog.init()` inside a `useEffect` to defer initialization until after hydration. This is the pattern recommended by the `bundle-defer-third-party` rule.

**Complexity**: Medium — requires verifying that PostHog's `identify`, `capture`, and pageview tracking still work correctly with deferred initialization.

## Command Center — Architectural Refactors (deferred 2026-03-25)

### Native inputs → UI components in MiniCalculator

**File**: `live-trading-status-panel.tsx`

The MiniCalculator section uses raw HTML `<select>` and `<input>` elements with hand-rolled Tailwind classes instead of the project's `Select`/`Input` UI components. This creates inconsistent styling (especially Safari mobile select rendering) and missing focus rings (WCAG 2.4.7).

**Recommended fix**: Replace native elements with `<Select>` and `<Input>` from `@/components/ui`. Also add proper focus ring styles.

**Complexity**: Low-Medium — straightforward component swap but needs testing with the calculator logic.

### useEffect state sync → Derived state

**Files**: `pre-market-notes.tsx`, `post-market-notes.tsx`

Both components use two `useEffect` hooks to sync form state from props and track `hasChanges`. The `hasChanges` value can be computed inline during render instead of synced via effect.

**Recommended fix**: Remove the tracking `useEffect` and derive `hasChanges` inline: `const hasChanges = postMarketNotes !== (notes?.postMarketNotes || "")`.

**Complexity**: Low — simple refactor, but should test that save/refresh cycle still works correctly.

---

*Add new deferred findings below as more scans are completed.*
