# Daily Bias Screen Labels Don't Invert When Bias is Short

**Date:** 2026-06-10
**Severity:** Medium (UI misalignment; labels assume long bias regardless of user selection)
**Affected Area:** `src/components/hawks/daily-bias-form.tsx`

## Symptom

On the `/en/command-center` Daily Bias form, when a user selects **Short** bias, the 5 screen-check row labels remain unchanged from their default bullish wording:

- "Renko close **above** 60min" (should be "below")
- "MACD slope **up**" (should be "down")
- "EMA stack **bullish**" (should be "bearish")
- "Price **above** VWAP" (should be "below")
- "Ajuste **respected**" (should be "broken")

The hint text also remains bullish, confusing traders entering a short-bias day. The checkbox values themselves are stored correctly (the data layer works), but the UI labels are static.

## Root Cause

The `screenRows` array was hard-coded to always fetch i18n keys for bullish labels:

```tsx
const screenRows = [
	{ key: "renko60", label: t("screenRenko60"), hint: t("screenRenko60Hint") },
	{ key: "macd", label: t("screenMacd"), hint: t("screenMacdHint") },
	// ... etc
]
```

The array was computed once at component render time and never re-evaluated when the `bias` state changed. React would render the new bias selection in the segmented toggle, but the cached `screenRows` labels remained bullish.

This is a classic state-dependency bug: a derived value (`screenRows`) that depends on `bias` but isn't re-calculated when `bias` changes.

## Why it Surfaced

The Daily Bias form was initially designed with a single "long bias" mental model. Neutral and short options were added later as feature enhancements, but the screen-check labels were not parameterized. The bug sat dormant until the first user toggled to short and noticed the labels didn't update.

## Solution

Introduced a helper function `getScreenLabel(key, bias, t)` that returns the correct label + hint based on the current bias:

```ts
const getScreenLabel = (
	key: ScreenLabel["key"],
	bias: Bias,
	t: (key: string) => string
): ScreenLabel => {
	const baseKey = { renko60: "screenRenko60" /* ... */ }[key]
	const hintKey = `${baseKey}Hint`

	if (bias === "short") {
		return {
			key,
			label: t(`${baseKey}Short`), // e.g., t("screenRenko60Short")
			hint: t(`${hintKey}Short`),
		}
	}

	return {
		key,
		label: t(baseKey),
		hint: t(hintKey),
	}
}
```

The `screenRows` array is now computed fresh on every render:

```ts
const screenRows: ReadonlyArray<ScreenLabel> = [
	getScreenLabel("renko60", bias, t),
	getScreenLabel("macd", bias, t),
	// ...
]
```

Since `bias` is in the dependency chain, the array is re-created whenever `bias` changes, and React re-renders the labels correctly.

## I18n Changes

Added 10 new keys to both `messages/en.json` and `messages/pt-BR.json`:

**English:**

- `screenRenko60Short`: "Renko close below 60min"
- `screenMacdShort`: "MACD slope down"
- `screenEmaStackShort`: "EMA stack bearish"
- `screenVwapShort`: "Price below VWAP"
- `screenAjusteShort`: "Ajuste broken"
- (+ 5 corresponding `*Hint*Short` keys)

**Portuguese:**

- `screenRenko60Short`: "Renko fechou abaixo do 60min"
- `screenMacdShort`: "Inclinação do MACD negativa"
- `screenEmaStackShort`: "Stack de EMAs bearish"
- `screenVwapShort`: "Preço abaixo da VWAP"
- `screenAjusteShort`: "Ajuste quebrado"
- (+ 5 corresponding `*HintShort` keys)

Verified i18n parity with `pnpm exec tsx scripts/check-i18n-keys.ts` (0 gaps).

## Testing

1. **Unit tests** (`src/__tests__/components/daily-bias-form.test.ts`): 13 tests covering:
   - Long bias → bullish labels for all 5 screens
   - Short bias → bearish labels for all 5 screens
   - Neutral bias → defaults to bullish
   - Correct key assignment for each screen type

2. **E2E tests** (`e2e/tests/command-center.spec.ts`):
   - "should invert screen labels when bias is changed to short"
   - "should return to bullish labels when switched back to long"

## Verification

- `pnpm tsc --noEmit`: no type errors
- `pnpm lint`: 0 errors (1 pre-existing unused-var warning in utility is legitimate and exportable)
- `pnpm exec tsx scripts/check-i18n-keys.ts`: 0 gaps, 5434 keys in both locales
- `pnpm vitest run src/__tests__/components/daily-bias-form.test.ts`: 13/13 pass

## Prevention

1. **State-dependent derived values must re-compute with state changes.** If a component derives values from state (like labels from `bias`), either use a helper function (as here) or a useMemo with the state in the dependency array. Never cache derived values across renders when they depend on state.

2. **Label parameterization early.** When adding directional bias options (long/short), identify immediately which labels need variants and create i18n keys + helper logic in the same PR. Don't add options without ensuring labels adapt.

3. **UI label tests.** Include E2E or component tests that verify labels change when the underlying state changes. This catches render-stale bugs that unit tests of the underlying data might miss.

## Files Modified

- `src/lib/hawks/get-screen-label.ts` (new)
- `src/components/hawks/daily-bias-form.tsx` (updated)
- `src/__tests__/components/daily-bias-form.test.ts` (new)
- `e2e/tests/command-center.spec.ts` (updated)
- `messages/en.json` (added 10 keys)
- `messages/pt-BR.json` (added 10 keys)

---
