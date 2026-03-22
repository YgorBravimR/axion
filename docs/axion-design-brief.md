# Axion — Visual Identity Design Brief

## 1. Brand Context

**Product:** Axion — a premium trading journal platform for Brazilian and international traders.
**Company:** Bravo (parent company, umbrella brand).
**Tagline:** "Your trading source of truth"
**Name origin:** From "axiom" (fundamental truth) + axion (theoretical physics particle — something invisible that explains everything). The first two letters "Ax" are central to the brand identity.

**Brand personality:**
- Scientific, precise, truth-seeking
- Premium but not flashy — quiet confidence
- Minimalist, geometric, modern
- Cold and sharp (contrasts with Bravo's warm gold energy)
- Think: Bloomberg terminal meets luxury Swiss watch

**What Axion is NOT:**
- Not aggressive/warrior/military
- Not playful/casual/startup-bubbly
- Not crypto/Web3 aesthetic
- Not a generic SaaS with rounded corners and gradients

---

## 2. Color Palette

All assets must use ONLY these colors. No gradients unless specified.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Violet Plasma (primary) | Deep violet | #8B5CF6 | Primary mark color, interactive elements |
| Violet Deep | Darker violet | #7C3AED | Hover states, depth |
| Violet Glow | Light violet | #A78BFA | Highlights, glows, light accents |
| Bravo Gold (heritage) | Metallic gold | #D4AF37 | Secondary accent, "by Bravo" elements, premium badges |
| Background Dark | Near-black | #08090A | Primary dark background |
| Surface Dark | Dark charcoal | #0F1114 | Card/surface background |
| Border Dark | Navy edge | #252A33 | Subtle borders and structure |
| Text Primary | Crisp white | #F0F2F5 | Primary text on dark |
| Text Muted | Silver gray | #8C96A5 | Secondary text |
| Pure White | White | #FFFFFF | Wordmark on dark, primary-foreground |
| Pure Black | Black | #000000 | Wordmark on light backgrounds |

---

## 3. Logo Mark Concept — "The Ax"

**IMPORTANT:** The logo mark is built around "Ax" — the first two letters of Axion. This is NOT a standalone "X" shape (which would conflict with Twitter/X's branding). The mark must clearly reference "Ax" through one of these approaches:

### Primary Direction: A+X Ligature
The letters A and X sharing a common stroke — the right leg of A becomes the left leg of X. A typographic monogram constructed with geometric precision. Not an illustration, not a drawing — an engineered letterform.

### Alternative Directions (explore alongside the primary):

1. **Abstract Axe Head** — A minimal geometric blade shape. Angular, sharp, no handle. Just the cutting wedge as a single geometric form. An axe is a tool of precision — one clean strike. Think: a tilted parallelogram with one sharp vertex.

2. **Minimal Axe Silhouette** — Ultra-simplified side profile of an axe. One continuous geometric outline. No detail, no texture, just the iconic shape reduced to its essence. Like a Scandinavian premium tool brand mark.

3. **Angular A with Strike** — The letter A constructed with sharp geometric lines, where the crossbar extends outward like an axe blade or a decisive strike mark.

4. **AX Negative Space** — The shape of an axe blade formed by negative space between two geometric forms. You see the blade in what's NOT there.

### Mark Requirements:
- Flat vector, single color, no gradients, no shadows, no 3D
- Geometric and angular — no curves, no organic shapes
- Must be legible and recognizable at 16x16px (favicon size)
- Must look premium at 512x512px
- Swiss design influence — engineered, not drawn
- Must NOT look like Twitter/X's logo

### Mark Variations Needed:
1. Violet (#8B5CF6) mark on transparent background
2. White (#FFFFFF) mark on transparent background
3. Black (#000000) mark on transparent background
4. Mark on near-black (#08090A) square background (for app icon)

### Mark Sizes:
SVG (vector), 512x512 PNG, 192x192 PNG, 64x64 PNG, 32x32 PNG, 16x16 PNG

---

## 4. Typography & Wordmark

**Wordmark font characteristics:**
- Clean geometric sans-serif (reference: Inter, Public Sans, DM Sans, or Eurostile)
- Medium to semi-bold weight
- Wide letter-spacing (tracking 0.15em–0.2em)
- All uppercase: A X I O N
- No decorative serifs, no rounded terminals

**The "AX" in the wordmark** must integrate with the mark:
- If using the A+X ligature mark: the first two letters of the wordmark ARE the mark, seamlessly flowing into "ION"
- If using an abstract/axe mark: the standalone mark sits to the left, and the wordmark spells "AXION" in full, with the X subtly echoing the mark's proportions
- A viewer should read "AXION" naturally — never "A[logo]ION" or "[symbol] ION"

**Wordmark Variations Needed:**
1. White wordmark on transparent (for dark backgrounds) — PRIMARY
2. Black wordmark on transparent (for light backgrounds)
3. Violet (#8B5CF6) wordmark on transparent
4. Gold (#D4AF37) wordmark on transparent (for Bravo-context usage)

---

## 5. Full Lockup (Mark + Wordmark)

**Layout:** Horizontal lockup — mark on the left, wordmark on the right, vertically centered.
**Spacing:** Clear space between mark and wordmark = width of the letter "I" in AXION.
**Note:** If the A+X ligature direction is chosen, the lockup may be the wordmark itself (where the AX portion IS the mark). In that case, no separate icon-left layout is needed — the wordmark is the lockup.

**Variations Needed:**
1. Violet (#8B5CF6) mark + white (#FFFFFF) wordmark on transparent — PRIMARY dark mode
2. Violet (#8B5CF6) mark + black (#000000) wordmark on transparent — PRIMARY light mode
3. All white on transparent — monochrome dark mode
4. All black on transparent — monochrome light mode

**Size Constraints:**
- Sidebar collapsed: only the mark shows (32x32)
- Sidebar expanded: full lockup at ~140x40
- Hero/landing page: full lockup at ~300x80

**Include:** A safe zone diagram showing minimum clear space around the lockup (equal to mark height on all sides).

---

## 6. App Icon / Favicon

**The Axion mark centered on a filled background.**

**Specifications:**
- Near-black (#08090A) rounded-square background (iOS app icon radius)
- Violet (#8B5CF6) mark centered
- Mark occupies approximately 55-60% of the icon area
- Optional: very subtle violet ambient glow behind the mark (max 8% opacity) — only if it improves the look, skip if it makes it feel cheap
- Must pass the "squint test" — recognizable when blurred or tiny

**Variations:**
1. Square with rounded corners — 1024x1024 (master), 512x512, 192x192
2. Circle crop variant at 256x256 (for avatars, profile pictures)
3. Favicon 32x32 (mark only, transparent background, white mark)
4. Favicon 16x16 (mark only, transparent background, white mark — verify readability)
5. PWA icons — 192x192, 512x512

---

## 7. "Powered by Bravo" Badge

**A small horizontal badge for footer usage.**

**Layout options (generate both):**
- A. Text only: "by" in muted gray (#8C96A5) + "BRAVO" in gold (#D4AF37), spaced uppercase
- B. Small 4-point diamond star in gold + "BRAVO" in gold, horizontally aligned

**Requirements:**
- This sits in the app footer — subtle maker's mark, not a co-brand
- Display height: approximately 16-20px in actual usage
- Must work on both dark (#08090A) and light (#F5F4F2) backgrounds

**Variations:**
1. Gold on transparent (for dark backgrounds)
2. Dark gray on transparent (for light backgrounds)
3. 50% opacity muted variant on transparent (unobtrusive footer)

---

## 8. Social / OG Image

**Open Graph preview image for link sharing (Twitter/X, LinkedIn, Slack, iMessage).**

**Specifications:**
- Exactly 1200x630 pixels
- Near-black (#08090A) background
- Very subtle geometric dot grid pattern at 5% opacity maximum (like faint graph paper)
- Center: Axion full lockup (violet mark + white wordmark) at ~40% of image width
- Below lockup (24px gap): "Your trading source of truth" in muted gray (#8C96A5), regular weight, smaller size
- Bottom-right corner: "by Bravo" badge in gold (#D4AF37) at small size
- Generous negative space on all sides — the image should breathe
- No busy backgrounds, no illustrations, no stock photography

---

## 9. Brand Pattern / Texture (Optional, Low Priority)

**A subtle geometric pattern for backgrounds, loading screens, and marketing materials.**

**Direction:**
- Thin intersecting lines referencing chart grids and the Ax mark geometry
- Or: subtle dot grid (like graph paper — scientific, precise)
- Lines in white at 3-5% opacity on transparent background
- Must tile seamlessly in both directions
- Grid spacing: approximately 40-60px between intersections
- Line weight: 1px or thinner

**Deliver:**
1. Single tile at 200x200px, PNG with transparency
2. Tiled preview on near-black (#08090A) at 1200x800
3. Tiled preview on light (#F5F4F2) (lines in black at 3-5% opacity)

---

## 10. Style Rules

### DO:
- Keep everything geometric and angular
- Use flat colors — no gradients except subtle ambient glows where specified
- Maintain generous whitespace / negative space
- Every element should feel precise and intentional
- The mark should look like it was engineered, not drawn
- Think Dieter Rams, Swiss design, Scandinavian tool brands

### DON'T:
- No 3D effects, drop shadows, or bevels on mark or wordmark
- No rounded/bubbly shapes
- No literal trading imagery (candles, charts, bulls, bears) in the logo
- No gradients in the mark or wordmark
- No more than 2 colors in any single asset
- No textures or patterns ON the mark itself
- No similarity to Twitter/X's logo — the mark is "Ax", not "X"
- No cursive, script, or decorative typefaces

---

## 11. File Delivery Format

For each asset:
- **SVG** (vector, scalable) — primary deliverable
- **PNG** with transparent background — all specified sizes
- **PNG** on solid backgrounds where specified
- **ICO** for favicon (multi-resolution: 16, 32, 48)

---

## 12. Relationship to Existing Bravo Brand

The Bravo parent brand uses:
- A geometric/low-poly golden lion as its mark
- Metallic gold (#D4AF37) as primary color
- Navy slate backgrounds
- No secondary symbol or icon
- Spaced uppercase wordmark "B R A V O" in gold

**How Axion connects to Bravo:**
- Same construction language: geometric, angular, precision-engineered forms
- Same letter-spacing philosophy in wordmarks (wide, uppercase)
- Same premium tier and attention to negative space
- Gold appears in Axion as heritage accent (never primary, always supporting)

**How Axion differs from Bravo:**
- Bravo is warm (gold). Axion is cold (violet).
- Bravo uses an illustrative mark (lion). Axion uses a typographic/abstract mark (Ax).
- Bravo feels authoritative and established. Axion feels scientific and precise.
- They share the same skeleton (geometry, spacing) but different skin.

---

## 13. Evaluation Criteria

A successful Axion visual identity will:

1. Be instantly recognizable at favicon size (16x16)
2. Read as "Ax" — not as Twitter's "X", not as a generic symbol
3. Feel premium and scientific — not generic SaaS
4. Work flawlessly on both near-black and white backgrounds
5. Look like it belongs next to Bloomberg, Linear, or Vercel — not next to Canva templates
6. Connect subtly to Bravo without depending on it
7. Make a Brazilian trader think "this is serious software" within 2 seconds
8. Make Tradezella, Trademetria, and Edgewonk look dated by comparison

---

## 14. Production Order

Generate assets in this sequence — each step depends on the previous:

1. **Mark first** — this is the foundation. Get 5 variations. Approve before proceeding.
2. **Wordmark second** — integrates the chosen mark into "AXION" lettering.
3. **Full lockup third** — combines mark + wordmark.
4. **App icon / favicon fourth** — uses approved mark.
5. **"Powered by Bravo" badge fifth** — standalone, quick.
6. **OG social image sixth** — uses approved lockup.
7. **Brand pattern last** — bonus, lowest priority.
