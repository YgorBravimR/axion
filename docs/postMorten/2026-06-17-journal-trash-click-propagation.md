# Event Propagation Fix: Trade Delete Button Navigation

---

> **[FIX-2026-06-17]** `Severity: Medium` — **Affected:** `/src/components/journal/trade-row.tsx:61–83`
> **Report:** Clicking the trash (delete) icon on a trade row in the journal navigated to the trade detail page instead of opening the delete confirmation UI. The button's click event was propagating to the parent `<Link>` component despite `e.stopPropagation()` being called.
> **Fix:** Added `e.preventDefault()` to all three delete-related event handlers (`handleDeleteClick`, `handleConfirmClick`, `handleCancelClick`) in addition to the existing `e.stopPropagation()` call. This ensures that when a button inside a `<Link>` is clicked, neither event propagation nor default link navigation occurs.
> **Root Cause:** When a button with `onClick` handler sits inside a Next.js `<Link>` component, calling `stopPropagation()` alone is insufficient to prevent navigation. The `preventDefault()` call is also needed to block the default anchor-link behavior.

## Changed Lines

- **Line 62–64:** `handleDeleteClick` — Added `e.preventDefault()` before `e.stopPropagation()`
- **Line 70–73:** `handleConfirmClick` — Added `e.preventDefault()` before `e.stopPropagation()`
- **Line 78–81:** `handleCancelClick` — Added `e.preventDefault()` before `e.stopPropagation()`

## Prevention

When placing interactive elements (buttons, inputs, clickable divs) inside a Next.js `<Link>` component:

1. Always call both `e.preventDefault()` **and** `e.stopPropagation()` in the handler
2. Consider restructuring: wrap the Link around only the text/label portion and place action buttons outside the link (allows keyboard tabbing without nav collision)
3. Alternatively, use a `<div role="button">` with manual `onClick` handler instead of a `<Link>` when the row has mixed interactive regions
