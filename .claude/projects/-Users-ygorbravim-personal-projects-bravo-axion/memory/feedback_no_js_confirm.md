---
name: No JavaScript alert/confirm
description: Never use window.confirm() or window.alert() — always use the AlertDialog component for confirmations
type: feedback
---

Never use `window.confirm()`, `window.alert()`, or `confirm()` for any user-facing confirmations or messages.

**Why:** Native browser dialogs are ugly, unthemed, inaccessible, and break the brand experience. The project has a proper `AlertDialog` component (`src/components/ui/alert-dialog.tsx`) that provides accessible, themed confirmation modals.

**How to apply:** For any destructive or confirmation action, use `AlertDialog` with two buttons (confirm + cancel). Pattern: controlled `open` state, `onOpenChange` for dismiss, `AlertDialogAction` for confirm, `AlertDialogCancel` for cancel.
