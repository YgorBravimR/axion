# Axion — Visual Identity Design Brief

## 1. Brand Context

**Product:** Axion — premium trading journal for Brazilian/international traders.
**Company:** Bravo (parent). **Tagline:** "Your trading source of truth"
**Name origin:** "axiom" (fundamental truth) + axion (physics particle). "Ax" is central to brand identity.

**Personality:** Scientific, precise, truth-seeking | Premium, quiet confidence | Minimalist, geometric, modern | Cold/sharp (contrasts Bravo's warm gold). Think: Bloomberg terminal meets luxury Swiss watch.

**NOT:** aggressive/military | playful/startup-bubbly | crypto/Web3 | generic SaaS rounded-corners

---

## 2. Color Palette

All assets: ONLY these colors. No gradients unless specified. Live tokens in `src/app/globals.css` under `[data-brand="axion"]` (dark) and `[data-brand="axion"][data-theme="light"]`; see `docs/theming.md`.

| Role                    | Color         | Hex     | Usage                                                    |
| ----------------------- | ------------- | ------- | -------------------------------------------------------- |
| Violet Plasma (primary) | Deep violet   | #8B5CF6 | Primary mark, interactive elements                       |
| Violet Deep             | Darker violet | #7C3AED | Hover states, depth                                      |
| Violet Glow             | Light violet  | #A78BFA | Highlights, glows, accents                               |
| Bravo Gold (heritage)   | Metallic gold | #D4AF37 | Secondary accent, "by Bravo" elements                    |
| Background Dark         | Near-black    | #0C0E0F | Primary dark bg (`--color-bg-100`)                       |
| Surface Dark            | Dark slate    | #171A1D | Card/surface bg (`--color-bg-200`)                       |
| Border Dark             | Navy edge     | #252A33 | Subtle borders                                           |
| Text Primary            | Crisp white   | #EFF1F4 | Primary text on dark (`--color-txt-100`)                 |
| Text Muted              | Silver gray   | #A5AFBE | Secondary text (`--color-txt-200`); #7A8592 for tertiary |
| Pure White              | White         | #FFFFFF | Wordmark on dark                                         |
| Pure Black              | Black         | #000000 | Wordmark on light                                        |

### Light Mode

| Role         | Hex     | Token             |
| ------------ | ------- | ----------------- |
| Background   | #F5F4F2 | `--color-bg-100`  |
| Surface      | #E6E3DD | `--color-bg-200`  |
| Border       | #CFCBC4 | `--color-bg-300`  |
| Text Primary | #1A1818 | `--color-txt-100` |
| Text Muted   | #4A4744 | `--color-txt-200` |
| Violet       | #7C3AED | `--color-acc-100` |
| Gold         | #B8941F | `--color-acc-200` |

---

## 3. Logo Mark — "The Ax"

Mark built around "Ax" (first two letters). NOT standalone "X" (conflicts with Twitter/X).

**Primary:** A+X ligature — A and X share common stroke; right leg of A = left leg of X. Typographic monogram, geometric precision. Not an illustration — an engineered letterform.

**Alternates:** (1) Abstract axe head — minimal geometric blade, no handle, tilted parallelogram with sharp vertex. (2) Minimal axe silhouette — ultra-simplified side profile, one continuous outline. (3) Angular A with strike — A with crossbar extending like axe blade. (4) AX negative space — blade formed by negative space between two forms.

**Requirements:** Flat vector, single color, no gradients/shadows/3D | Geometric/angular, no curves | Legible at 16×16px | Premium at 512×512px | Swiss design influence | Must NOT resemble Twitter/X

**Variations:** Violet (#8B5CF6) | White | Black | Mark on near-black (#08090A) square (app icon)
**Sizes:** SVG, 512/192/64/32/16px PNG

---

## 4. Typography & Wordmark

**Font:** Clean geometric sans-serif (Inter/Public Sans/DM Sans/Eurostile) | Medium–semi-bold | Tracking 0.15–0.2em | All uppercase: A X I O N | No serifs, no rounded terminals.

**AX integration:** If A+X ligature: first two letters ARE the mark, flowing into "ION". If abstract mark: standalone mark left, wordmark spells "AXION" full.

**Variations needed:** White on transparent (PRIMARY) | Black on transparent | Violet (#8B5CF6) | Gold (#D4AF37)

---

## 5. Full Lockup

Horizontal: mark left, wordmark right, vertically centered. Clear space between = width of "I" in AXION.

**Variations:** Violet mark + white wordmark on transparent (PRIMARY dark) | Violet + black (PRIMARY light) | All white | All black

**Sizes:** Collapsed sidebar: mark only (32×32) | Expanded sidebar: ~140×40 | Hero: ~300×80

---

## 6. App Icon / Favicon

Near-black (#08090A) rounded-square bg | Violet mark centered (~55–60% of icon area) | Optional: very subtle violet glow (max 8% opacity).

**Variations:** Square rounded — 1024/512/192px | Circle 256px | Favicon 32px (transparent, white mark) | Favicon 16px | PWA 192/512px

---

## 7. "Powered by Bravo" Badge

Footer badge. **Options:** (A) "by" muted gray + "BRAVO" gold spaced uppercase | (B) Small 4-point diamond star gold + "BRAVO" gold.

**Variations:** Gold on transparent (dark bgs) | Dark gray on transparent (light bgs) | 50% opacity muted variant

---

## 8. Social / OG Image

1200×630px | Near-black (#08090A) bg | Subtle dot grid at max 5% opacity | Center: full lockup (~40% width) | Below: tagline in muted gray (#8C96A5) | Bottom-right: "by Bravo" badge gold | Generous negative space.

---

## 9. Brand Pattern (Optional, Low Priority)

Thin intersecting lines referencing chart grids + Ax geometry, OR dot grid. White at 3–5% opacity on transparent. Seamless tile, ~40–60px grid spacing, 1px line weight.

**Deliver:** 200×200px tile | Tiled preview on dark 1200×800 | Tiled preview on light

---

## 10. Style Rules

**DO:** Geometric/angular | Flat colors | Generous negative space | Precise/intentional | Engineered look (Dieter Rams, Swiss, Scandinavian)

**DON'T:** 3D/shadows/bevels | Rounded shapes | Literal trading imagery | Gradients in mark/wordmark | >2 colors per asset | Twitter/X resemblance | Cursive/script typefaces

---

## 11. File Delivery

Per asset: SVG (primary) | PNG transparent (all specified sizes) | PNG on solid bgs where specified | ICO for favicon (16/32/48px)

---

## 12. Bravo Relationship

**Bravo brand:** Geometric gold lion mark | Gold (#D4AF37) primary | Navy slate bgs | Uppercase "B R A V O" wordmark in gold.

**Shared:** Same construction language (geometric, angular, precision) | Wide uppercase wordmarks | Premium tier, negative space | Gold appears as heritage accent (never primary) in Axion.

**Differs:** Bravo = warm (gold); Axion = cold (violet) | Bravo = illustrative mark; Axion = typographic/abstract | Bravo = authoritative; Axion = scientific/precise.

---

## 13. Evaluation Criteria

Successful identity: (1) Recognizable at 16×16px | (2) Reads as "Ax" not Twitter "X" | (3) Feels premium/scientific | (4) Works on near-black and white | (5) Belongs next to Bloomberg/Linear/Vercel | (6) Connects subtly to Bravo | (7) Brazilian trader thinks "serious software" in 2s | (8) Makes Tradezella/Trademetria/Edgewonk look dated.

---

## 14. Production Order

1. Mark → 5 variations, approve before proceeding
2. Wordmark → integrates chosen mark into "AXION"
3. Full lockup → mark + wordmark
4. App icon / favicon → uses approved mark
5. "Powered by Bravo" badge → standalone
6. OG social image → uses approved lockup
7. Brand pattern → bonus, lowest priority
