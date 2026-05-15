# PR Template

Every agent-generated PR uses this template. Copy verbatim into the PR body.

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
- [ ] Page guide entry added/updated for new or significantly changed surfaces (or N/A)

<details>
<summary>Session prompts</summary>
1. <verbatim user prompt 1>
2. <verbatim user prompt 2>
</details>
```
