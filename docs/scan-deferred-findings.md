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

---

*Add new deferred findings below as more scans are completed.*
