# CSS Mastery — Complete Deep Reference

> A practical, implementation-ready guide. Every concept includes real code, real problems, and real solutions. Responsive patterns prioritize desktop-first design that works flawlessly on mobile.

---

## Subjects

### 1. The Rendering Engine & Visual Formatting Model

Every pixel you see on screen is the result of a multi-stage pipeline the browser runs on your CSS and HTML. Understanding this pipeline is the difference between "it works but I don't know why" and "I control every pixel."

#### 1.1 The Box Model

Every element in CSS generates a rectangular box. This box has four areas stacked like an onion:

```
┌─────────────────────────── margin ───────────────────────────┐
│  ┌──────────────────────── border ────────────────────────┐  │
│  │  ┌───────────────────── padding ────────────────────┐  │  │
│  │  │                                                  │  │  │
│  │  │               content area                       │  │  │
│  │  │          (width × height live here)              │  │  │
│  │  │                                                  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**`box-sizing` — the single most important declaration:**

```css
/* content-box (default): width = content only. Padding and border ADD to it. */
.box-content {
  box-sizing: content-box;
  width: 300px;
  padding: 20px;
  border: 2px solid;
  /* Actual rendered width: 300 + 20 + 20 + 2 + 2 = 344px */
}

/* border-box: width = content + padding + border. What you set is what you get. */
.box-border {
  box-sizing: border-box;
  width: 300px;
  padding: 20px;
  border: 2px solid;
  /* Actual rendered width: 300px. Content shrinks to 256px. */
}
```

**The universal reset every project needs:**

```css
*, *::before, *::after {
  box-sizing: border-box;
}
```

Without this, every element with padding or borders will overflow its stated width — the #1 cause of unexpected horizontal scrollbars on mobile.

**Intrinsic vs. Extrinsic sizing:**

- **Extrinsic**: You set the size — `width: 300px`, `height: 50vh`. The element obeys regardless of content.
- **Intrinsic**: The content determines the size — `width: min-content`, `width: max-content`, `width: fit-content`.

```css
/* Extrinsic — dangerous on small screens, content can overflow */
.card { width: 400px; }

/* Intrinsic — safe, adapts to content */
.tag {
  width: fit-content;       /* Shrinks to content, but won't exceed parent */
  max-width: 100%;          /* Safety net for mobile */
  padding: 4px 12px;
}
```

**Real-world problem solved:** A sidebar with `width: 300px` breaks on 320px mobile screens. The fix is not a media query — it's intrinsic sizing:

```css
.sidebar {
  width: min(300px, 100%);  /* 300px on desktop, 100% on small screens */
}
```

#### 1.2 Margin Collapse

Margin collapse is CSS's most misunderstood behavior. It only happens on **vertical** margins in **block** formatting contexts.

**The rules:**

1. Adjacent sibling margins collapse — the larger margin wins.
2. Parent-child margins collapse — if no border, padding, or BFC boundary exists between them.
3. Empty block margins collapse — top and bottom margins of an empty element merge.

```html
<div class="parent">
  <div class="child">Hello</div>
</div>
```

```css
/* BUG: The child's margin-top "leaks" out of the parent */
.parent { background: gray; }
.child  { margin-top: 40px; }
/* Result: The PARENT moves down 40px. The child has 0px gap from parent top. */
```

**Solutions to prevent margin collapse:**

```css
/* Solution 1: Add a border or padding to the parent */
.parent {
  padding-top: 1px; /* even 1px blocks collapse */
}

/* Solution 2: Create a BFC on the parent */
.parent {
  display: flow-root; /* modern, clean BFC trigger */
}

/* Solution 3: Use flexbox or grid (they don't collapse margins) */
.parent {
  display: flex;
  flex-direction: column;
}
```

**When margins DON'T collapse:**

- Inside flex containers (`display: flex`)
- Inside grid containers (`display: grid`)
- Floated elements
- Absolutely positioned elements
- Elements with `overflow` other than `visible`
- Elements with `display: flow-root`

#### 1.3 Display Types

Every element has an **outer** display type (how it participates in its parent's layout) and an **inner** display type (how it lays out its children).

```css
/* Modern two-value syntax (CSS Display Level 3): */
display: block flow;         /* same as: display: block */
display: block flex;         /* same as: display: flex */
display: inline flex;        /* same as: display: inline-flex */
display: block grid;         /* same as: display: grid */
display: inline grid;        /* same as: display: inline-grid */
```

| Display Value    | Outer     | Inner     | Takes Full Width? | Respects width/height? |
|------------------|-----------|-----------|-------------------|------------------------|
| `block`          | block     | flow      | Yes               | Yes                    |
| `inline`         | inline    | flow      | No                | No                     |
| `inline-block`   | inline    | flow-root | No                | Yes                    |
| `flex`           | block     | flex      | Yes               | Yes                    |
| `inline-flex`    | inline    | flex      | No                | Yes                    |
| `grid`           | block     | grid      | Yes               | Yes                    |
| `none`           | —         | —         | Removed from flow | —                      |

**Real-world problem solved:** You want a badge to sit inline with text but have padding and dimensions:

```css
/* BAD: <span> is inline — padding overlaps adjacent lines */
.badge { padding: 4px 8px; background: red; }

/* GOOD: inline-block respects padding without breaking to a new line */
.badge {
  display: inline-block;
  padding: 4px 8px;
  background: red;
  border-radius: 4px;
  vertical-align: middle;
}
```

#### 1.4 Formatting Contexts

A **formatting context** defines the rules by which child elements are laid out. The most important ones:

**Block Formatting Context (BFC):**

A BFC is an isolated layout environment. Elements inside a BFC do not affect elements outside it. This is critical for:

- Preventing margin collapse
- Containing floated children
- Preventing text wrapping around floats

```css
/* Ways to create a BFC: */
.bfc-1 { display: flow-root; }       /* Cleanest way — no side effects */
.bfc-2 { overflow: hidden; }          /* Works but clips overflow */
.bfc-3 { overflow: auto; }            /* Works but may show scrollbars */
.bfc-4 { display: flex; }             /* Creates a flex formatting context */
.bfc-5 { display: grid; }             /* Creates a grid formatting context */
.bfc-6 { contain: layout; }           /* Modern containment */
```

**Real-world problem solved:** A float-based layout where the parent collapses to zero height:

```css
.clearfix-parent {
  display: flow-root; /* Parent now contains its floated children */
}
```

#### 1.5 Stacking Contexts

A stacking context is a three-dimensional conceptualization of HTML elements along an imaginary z-axis relative to the user. Within a stacking context, child elements are stacked according to rules, and **their z-index values only compete with siblings in the same context**.

**What creates a stacking context:**

```css
/* Any of these properties trigger a new stacking context: */
.creates-context {
  position: relative; z-index: 1;  /* positioned + z-index != auto */
  opacity: 0.99;                    /* any value < 1 */
  transform: translateZ(0);         /* any transform value */
  filter: blur(0);                  /* any filter value */
  isolation: isolate;               /* explicit isolation */
  mix-blend-mode: multiply;         /* any value except normal */
  will-change: transform;           /* specifying certain properties */
  contain: layout;                  /* or paint */
  /* Also: position: fixed, position: sticky always create one */
}
```

**The stacking order within a context (back to front):**

```
1. Background and borders of the context element
2. Negative z-index children (z-index: -1, -2, ...)
3. Non-positioned, non-floated block children (normal flow)
4. Non-positioned floated children
5. Non-positioned inline children
6. Positioned children with z-index: 0 or auto
7. Positive z-index children (z-index: 1, 2, 3, ...)
```

**Real-world problem solved:** A modal with `z-index: 9999` appears BEHIND a header with `z-index: 10`:

```css
/* THE PROBLEM: */
.header {
  position: relative;
  z-index: 10;  /* Creates stacking context A */
}

.card {
  position: relative;
  z-index: 1;   /* Creates stacking context B */
}

/* Modal is INSIDE .card */
.card .modal {
  position: fixed;
  z-index: 9999; /* 9999 only competes within context B (z-index: 1) */
  /* Context B (1) < Context A (10), so modal is behind header */
}

/* THE FIX: Move the modal outside nested contexts, or use isolation */
.header {
  position: relative;
  z-index: 10;
  isolation: isolate; /* Contains its own children, doesn't affect siblings */
}
```

**The z-index scale pattern — preventing "z-index wars":**

```css
:root {
  --z-dropdown:  100;
  --z-sticky:    200;
  --z-overlay:   300;
  --z-modal:     400;
  --z-popover:   500;
  --z-toast:     600;
  --z-tooltip:   700;
}

.modal   { z-index: var(--z-modal); }
.tooltip { z-index: var(--z-tooltip); }
```

**Debugging tool:** Install the [CSS Stacking Context Inspector](https://chromewebstore.google.com/detail/css-stacking-context-insp/apjeljpachdcjkgnamgppgfkmddadcki) Chrome extension — it visualizes every stacking context on the page.

#### 1.6 Containing Blocks

An element's **containing block** determines the reference frame for percentage-based values and positioned elements.

| Position Value | Containing Block Is... |
|----------------|------------------------|
| `static` / `relative` | Nearest **block-level** ancestor's content edge |
| `absolute` | Nearest ancestor with `position` other than `static` (padding edge) |
| `fixed` | The **viewport** (or nearest ancestor with `transform`, `filter`, or `will-change`) |
| `sticky` | Nearest **scrollable** ancestor |

**Real-world problem solved:** `position: fixed` modal unexpectedly scrolls with the page:

```css
/* BUG: A parent has transform, which "captures" fixed positioning */
.page-wrapper {
  transform: translateX(0); /* This makes .page-wrapper the containing block for fixed children */
}
.page-wrapper .modal {
  position: fixed; /* NO LONGER fixed to viewport — fixed to .page-wrapper */
}

/* FIX: Move the modal outside the transformed ancestor in the DOM,
   or remove the unnecessary transform */
```

#### 1.7 The Pixel Pipeline

Every frame the browser paints goes through this pipeline:

```
JavaScript → Style Calculation → Layout (Reflow) → Paint → Composite
```

| Stage | What It Does | Cost |
|-------|-------------|------|
| **Style** | Match selectors, compute final values | Low |
| **Layout** | Calculate sizes and positions of every box | HIGH |
| **Paint** | Fill pixels — colors, shadows, text, images | Medium-High |
| **Composite** | Combine painted layers, apply transforms/opacity | LOW (GPU) |

**The key insight:** Properties that only trigger **Composite** are nearly free to animate:

```css
/* CHEAP — composite-only (GPU accelerated): */
.animate-cheap {
  transform: translateX(100px);  /* composite */
  opacity: 0.5;                   /* composite */
}

/* EXPENSIVE — triggers layout + paint + composite: */
.animate-expensive {
  left: 100px;      /* layout */
  width: 200px;     /* layout */
  margin-top: 20px; /* layout */
  box-shadow: 0 4px 8px black; /* paint */
}
```

**Rule for animations:** Only animate `transform` and `opacity` for 60fps performance. Everything else causes jank.

#### 1.8 CSS Containment

The `contain` property tells the browser that an element's subtree is independent from the rest of the page, allowing rendering optimizations.

```css
.widget {
  contain: layout;   /* Size/position changes inside won't trigger parent reflow */
  contain: paint;    /* Nothing inside paints outside the element's bounds */
  contain: size;     /* Element's size is independent of its children */
  contain: style;    /* Counters and quotes are scoped */
  contain: strict;   /* All of the above */
  contain: content;  /* layout + paint + style (most common) */
}
```

**Real-world problem solved:** A dashboard with 50 widgets where editing one causes the entire page to reflow:

```css
.dashboard-widget {
  contain: content;
  /* Now changes inside this widget can't trigger reflow in other widgets */
}
```

---

### 2. Layout Systems & Algorithms

#### 2.1 Block & Inline Layout (Normal Flow)

Normal flow is the default layout mode. Block elements stack vertically; inline elements flow horizontally and wrap.

```css
/* Block elements: take full width, stack vertically */
div, p, h1, section, article, header, footer { display: block; }

/* Inline elements: flow with text, wrap at line boundaries */
span, a, strong, em, code { display: inline; }
```

**Critical inline rules:**
- `width` and `height` are **ignored** on inline elements
- Vertical `padding` and `margin` don't push other lines away (they overlap)
- `line-height` controls the inline box height

```css
/* This does NOTHING visible for spacing: */
span { margin-top: 20px; padding-top: 20px; } /* overlaps, doesn't push */

/* Use inline-block or change display to get vertical spacing: */
span { display: inline-block; margin-top: 20px; } /* now it works */
```

#### 2.2 Flexbox — The Complete Mental Model

Flexbox works on two axes: **main axis** (direction items flow) and **cross axis** (perpendicular).

```css
.flex-container {
  display: flex;

  /* Main axis direction */
  flex-direction: row;           /* → left to right (default) */
  flex-direction: row-reverse;   /* ← right to left */
  flex-direction: column;        /* ↓ top to bottom */
  flex-direction: column-reverse;/* ↑ bottom to top */

  /* Wrapping */
  flex-wrap: nowrap;  /* default — items shrink to fit */
  flex-wrap: wrap;    /* items wrap to next line */

  /* Main axis alignment */
  justify-content: flex-start;    /* pack to start */
  justify-content: center;        /* center items */
  justify-content: space-between; /* equal space BETWEEN items */
  justify-content: space-around;  /* equal space AROUND items */
  justify-content: space-evenly;  /* equal space everywhere */

  /* Cross axis alignment */
  align-items: stretch;    /* default — items stretch to fill */
  align-items: flex-start; /* align to cross-start */
  align-items: center;     /* center on cross axis */
  align-items: baseline;   /* align text baselines */

  /* Gap between items */
  gap: 16px;         /* equal gap */
  gap: 16px 24px;    /* row-gap column-gap */
}
```

**The flex shorthand — understanding the math:**

```css
.item {
  /* flex: grow shrink basis */
  flex: 0 1 auto;  /* DEFAULT: don't grow, can shrink, size from content */
  flex: 1 1 0;     /* Grow equally, basis 0 = all items same width */
  flex: 1;         /* Shorthand for: flex: 1 1 0 */
  flex: none;      /* Shorthand for: flex: 0 0 auto (rigid) */
  flex: auto;      /* Shorthand for: flex: 1 1 auto (grow from content size) */
}
```

**The flex-grow math:**

```
Available Space = Container Width - Sum of all flex-basis values
Each item gets:  (item's flex-grow / total flex-grow) × Available Space
```

```css
/* Container: 900px */
.a { flex: 2 1 100px; } /* basis 100 + (2/5 × 500) = 100 + 200 = 300px */
.b { flex: 1 1 100px; } /* basis 100 + (1/5 × 500) = 100 + 100 = 200px */
.c { flex: 2 1 100px; } /* basis 100 + (2/5 × 500) = 100 + 200 = 300px */
/* Total basis: 300. Available: 600. Total grow: 5. Each "share": 120px */
```

**Real-world responsive pattern — desktop row to mobile column:**

```css
.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.card {
  flex: 1 1 320px;    /* Grow to fill, but minimum 320px before wrapping */
  max-width: 100%;     /* Never overflow on mobile */
}
/* Result: 3 cards per row on 1200px, 2 on 800px, 1 on 400px. No media queries. */
```

**Preventing flex items from overflowing (the `min-width: auto` trap):**

```css
/* BUG: Flex items with long text/content refuse to shrink below content size */
.flex-item {
  /* flex items have min-width: auto by default, meaning they won't shrink
     below their content's intrinsic minimum width */
}

/* FIX: Override the minimum */
.flex-item {
  min-width: 0;       /* Allow shrinking below content width */
  overflow: hidden;    /* Clip overflowing content */
}

/* For text specifically: */
.flex-item-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

#### 2.3 CSS Grid — The Complete Mental Model

Grid gives you two-dimensional control (rows AND columns simultaneously).

```css
.grid {
  display: grid;

  /* Define columns */
  grid-template-columns: 200px 1fr 200px;       /* fixed-flexible-fixed */
  grid-template-columns: repeat(3, 1fr);          /* 3 equal columns */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); /* responsive */
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));  /* responsive */

  /* Define rows */
  grid-template-rows: auto 1fr auto;  /* header-content-footer */

  /* Named areas */
  grid-template-areas:
    "header  header  header"
    "sidebar content aside"
    "footer  footer  footer";

  /* Gaps */
  gap: 24px;
  row-gap: 16px;
  column-gap: 24px;
}
```

**`auto-fill` vs `auto-fit` — the critical difference:**

```css
/* auto-fill: Creates as many tracks as fit, leaving EMPTY tracks */
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
/* 3 items in 1200px = 3 items × 200-400px, empty tracks remain */

/* auto-fit: Creates as many tracks as fit, then COLLAPSES empty tracks */
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
/* 3 items in 1200px = 3 items stretch to fill ALL space */
```

**When to use which:**
- `auto-fit`: Items should stretch to fill available space (most common)
- `auto-fill`: You want consistent column widths even with few items

**Grid placement:**

```css
.item {
  grid-column: 1 / 3;        /* span columns 1 and 2 */
  grid-column: 1 / -1;       /* span ALL columns */
  grid-column: span 2;       /* span 2 columns from auto-placement */
  grid-row: 1 / 3;           /* span rows 1 and 2 */
  grid-area: header;          /* place in named area "header" */
}
```

**The holy grail layout — responsive without media queries:**

```css
.page {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(0, 3fr) minmax(200px, 1fr);
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header  header  header"
    "nav     main    aside"
    "footer  footer  footer";
  min-height: 100dvh;
}

/* On smaller screens, stack everything: */
@media (max-width: 768px) {
  .page {
    grid-template-columns: 1fr;
    grid-template-areas:
      "header"
      "nav"
      "main"
      "aside"
      "footer";
  }
}
```

#### 2.4 Subgrid

Subgrid solves the alignment problem where child grids need to inherit their parent grid's tracks.

**Browser support:** 97%+ globally (Chrome 117+, Firefox 71+, Safari 16+, Edge 117+).

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.card {
  display: grid;
  grid-template-rows: subgrid;  /* Inherit parent's row tracks */
  grid-row: span 3;              /* Card spans 3 row tracks: image, title, text */
}
```

**Real-world problem solved:** Card grids where titles and buttons misalign because cards have different content heights:

```css
/* WITHOUT subgrid — titles, descriptions, and buttons are all at different heights */
.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  grid-template-rows: repeat(auto, auto 1fr auto); /* Won't work as hoped */
  gap: 24px;
}

/* WITH subgrid — every card's internal rows align with siblings */
.card-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, auto); /* 3 rows: image, content, action */
  gap: 24px;
}

.card {
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid; /* NOW: image row aligns, title aligns, button aligns */
  gap: 0;
}

.card img    { grid-row: 1; object-fit: cover; width: 100%; height: 200px; }
.card h3     { grid-row: 2; align-self: start; }
.card button { grid-row: 3; align-self: end; }
```

#### 2.5 Positioning

```css
/* Static — default, no positioning offsets apply */
.static { position: static; }

/* Relative — offset from its normal position, space is preserved */
.relative {
  position: relative;
  top: 10px; left: 20px; /* Shifts visually, layout space stays at origin */
}

/* Absolute — removed from flow, positioned relative to nearest positioned ancestor */
.absolute {
  position: absolute;
  top: 0; right: 0; /* Top-right corner of containing block */
}

/* Fixed — removed from flow, positioned relative to viewport */
.fixed {
  position: fixed;
  top: 0; left: 0; right: 0; /* Full-width sticky header */
}

/* Sticky — hybrid: flows normally until scroll threshold, then "sticks" */
.sticky {
  position: sticky;
  top: 0; /* Sticks when it reaches 0px from viewport top */
}
```

**The `position: sticky` requirements (all must be true):**

1. Must have a `top`, `bottom`, `left`, or `right` value set
2. No ancestor can have `overflow: hidden`, `overflow: auto`, or `overflow: scroll` (unless that ancestor IS the scroll container)
3. The sticky element must have room to scroll within its parent

```css
/* BUG: Sticky doesn't work */
.wrapper {
  overflow: hidden; /* THIS kills sticky for all descendants */
}
.wrapper .sticky-header {
  position: sticky;
  top: 0; /* Won't stick — overflow: hidden on ancestor */
}

/* FIX: Remove overflow: hidden, or restructure the DOM */
.wrapper {
  overflow: visible; /* or just remove the overflow property */
}
```

#### 2.6 Logical Properties

Logical properties abstract away physical directions (`left`, `right`, `top`, `bottom`) in favor of flow-relative directions. This makes layouts work automatically in RTL languages (Arabic, Hebrew) and vertical writing modes (Japanese, Chinese).

```css
/* Physical (old) → Logical (new) */
margin-left        → margin-inline-start
margin-right       → margin-inline-end
margin-top         → margin-block-start
margin-bottom      → margin-block-end
padding-left       → padding-inline-start
width              → inline-size
height             → block-size
min-width          → min-inline-size
border-top         → border-block-start
top                → inset-block-start
left               → inset-inline-start
border-radius: 8px 0 0 8px → border-start-start-radius: 8px; border-end-start-radius: 8px;

/* Shorthand: */
margin-inline: 20px;          /* left + right */
margin-block: 10px 20px;      /* top bottom */
padding-inline: 16px;
inset-inline: 0;               /* left: 0; right: 0; */
inset: 0;                      /* top: 0; right: 0; bottom: 0; left: 0; */
```

**Real-world problem solved:** A sidebar layout that breaks in Arabic (RTL):

```css
/* BAD: Hardcoded left position breaks in RTL */
.sidebar {
  position: fixed;
  left: 0;
  width: 250px;
}

/* GOOD: Works automatically in both LTR and RTL */
.sidebar {
  position: fixed;
  inset-inline-start: 0;
  inline-size: 250px;
}
```

#### 2.7 Anchor Positioning API

The Anchor Positioning API (Chrome 125+, Edge 125+, Safari behind flag as of 2026) eliminates the need for JavaScript libraries like Popper.js or Floating UI for tooltips, dropdowns, and popovers.

```css
/* Step 1: Define an anchor */
.trigger-button {
  anchor-name: --my-anchor;
}

/* Step 2: Position an element relative to the anchor */
.tooltip {
  position: fixed;
  position-anchor: --my-anchor;

  /* Position the tooltip below the button with an 8px gap */
  top: calc(anchor(bottom) + 8px);
  left: anchor(center);
  translate: -50% 0; /* Center horizontally */
}

/* Step 3 (optional): Auto-flip when near viewport edge */
.tooltip {
  position-try-fallbacks: flip-block; /* Flip above if no space below */
}
```

**Real-world problem solved:** Dropdown menus that overflow the viewport on mobile:

```css
.dropdown-menu {
  position: fixed;
  position-anchor: --dropdown-trigger;

  /* Try below first, then above, then to the right */
  position-try-fallbacks: flip-block, flip-inline;

  inset-area: block-end span-inline-end;
  margin-block-start: 4px;
  max-height: 300px;
  overflow-y: auto;
}
```

> **Note:** For browsers without anchor positioning support, fall back to JavaScript positioning or use `@supports`:
> ```css
> @supports not (anchor-name: --a) {
>   .tooltip { /* JS-based fallback positioning */ }
> }
> ```

---

### 3. The Cascade & Scope Logic

The cascade is CSS's conflict resolution algorithm. When multiple rules target the same element, the cascade determines which one wins.

#### 3.1 Cascade Resolution Order

The cascade resolves conflicts in this order (highest priority first):

```
1. Relevance (does the rule apply to this media/context?)
2. Origin & Importance:
   ┌──────────────────────────────────────────────────┐
   │ 1. User-Agent !important    (browser defaults)   │  ← highest
   │ 2. User !important          (user stylesheets)   │
   │ 3. Author !important        (your CSS)           │
   │ 4. @keyframe styles                              │
   │ 5. Author normal            (your CSS)           │
   │ 6. User normal                                   │
   │ 7. User-Agent normal                             │  ← lowest
   └──────────────────────────────────────────────────┘
3. Cascade Layers (within the same origin)
4. Specificity
5. Scope proximity
6. Source order (last wins)
```

#### 3.2 Specificity

Specificity is a weight system calculated as three components: **(ID, CLASS, ELEMENT)**.

```
*                    → (0, 0, 0)
div                  → (0, 0, 1)
div.card             → (0, 1, 1)
div.card.active      → (0, 2, 1)
#header              → (1, 0, 0)
#header .nav a       → (1, 1, 1)
#header .nav a:hover → (1, 2, 1)
style="..."          → inline (always wins over selectors)
!important           → trumps everything in same origin
```

**Specificity rules:**
- `:is()` and `:not()` take the specificity of their **most specific argument**
- `:where()` has **zero specificity** (great for defaults)
- `:has()` takes the specificity of its argument

```css
/* :is() takes highest specificity from its arguments */
:is(#id, .class, div) { color: red; }
/* Specificity: (1, 0, 0) — because #id is the most specific */

/* :where() always has zero specificity */
:where(#id, .class, div) { color: blue; }
/* Specificity: (0, 0, 0) — overridable by ANYTHING */

/* Practical use: low-specificity defaults */
:where(.btn) {
  padding: 8px 16px;
  border-radius: 4px;
}
/* Easy to override without specificity wars */
.special-btn {
  padding: 12px 24px; /* wins easily */
}
```

#### 3.3 Inheritance

Some CSS properties inherit from parent to child by default. Others don't.

**Properties that inherit:** `color`, `font-*`, `text-align`, `text-indent`, `line-height`, `letter-spacing`, `word-spacing`, `visibility`, `cursor`, `list-style`, `direction`, `writing-mode`.

**Properties that DON'T inherit:** `margin`, `padding`, `border`, `background`, `width`, `height`, `display`, `position`, `overflow`, `box-shadow`, `opacity`, `transform`.

```css
/* Controlling inheritance explicitly: */
.child {
  color: inherit;    /* Force inherit from parent */
  margin: initial;   /* Reset to browser default */
  padding: unset;    /* inherit if inheritable, initial if not */
  all: revert;       /* Reset to user-agent stylesheet */
}
```

**Real-world problem solved:** A dark-themed section where nested links should inherit the section's light text color:

```css
.dark-section {
  color: #e2e8f0;
  background: #1a202c;
}
/* Links inside won't inherit color because <a> has UA styles */
.dark-section a {
  color: inherit; /* Now inherits #e2e8f0 */
}
/* Or use the universal inheriting pattern: */
.dark-section :where(a) {
  color: inherit; /* Zero specificity, easily overridable */
}
```

#### 3.4 Cascade Layers (`@layer`)

Layers let you control which groups of styles take priority, **independent of specificity**. A simple selector in a higher-priority layer beats a complex selector in a lower-priority layer.

**Browser support:** All modern browsers since 2022.

```css
/* Step 1: Declare layer order (first = lowest priority) */
@layer reset, base, components, utilities;

/* Step 2: Assign styles to layers */
@layer reset {
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

@layer base {
  body { font-family: system-ui; line-height: 1.6; color: #1a1a2e; }
  h1 { font-size: 2rem; }
  a { color: #3b82f6; }
}

@layer components {
  .btn { padding: 8px 16px; border-radius: 6px; }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; }
}

@layer utilities {
  .mt-4 { margin-top: 1rem; }
  .hidden { display: none; }
}
```

**Importing third-party CSS into a low-priority layer:**

```css
/* Bootstrap will NEVER override your custom styles, regardless of specificity */
@import url("bootstrap.min.css") layer(vendor);

@layer vendor, custom;

@layer custom {
  .btn { background: teal; } /* Wins over Bootstrap's .btn, always */
}
```

**Unlayered styles beat ALL layers:**

```css
@layer components {
  .card { background: white; }  /* Layer priority: components */
}

/* This unlayered style ALWAYS wins over any layer */
.card { background: #f0f0f0; }
```

#### 3.5 CSS `@scope`

`@scope` allows you to define style boundaries — both an upper bound (scoping root) and an optional lower bound (scoping limit), creating a "donut" scope.

```css
/* Styles only apply inside .card, but NOT inside .card .nested-card */
@scope (.card) to (.nested-card) {
  h2 { font-size: 1.25rem; }
  p  { color: #666; }
  /* These rules won't leak into nested cards */
}

/* Without a lower bound — simple scoping */
@scope (.sidebar) {
  nav a { color: white; }
  /* Only matches <a> elements inside .sidebar nav */
}
```

**Real-world problem solved:** A component library where card styles inside cards should reset:

```css
@scope (.card) to (.card) {
  /* Styles here affect .card content but stop at nested .card boundaries */
  .title { font-size: 1.5rem; }
  .body { padding: 16px; }
}
```

#### 3.6 `:has()` — The Parent Selector

`:has()` selects an element **based on its descendants, siblings, or state**. It's the most powerful selector in CSS history.

**Browser support:** 95%+ globally (Chrome, Firefox, Safari, Edge).

```css
/* Style a card differently if it contains an image */
.card:has(img) {
  grid-template-rows: 200px 1fr;
}

.card:not(:has(img)) {
  grid-template-rows: 1fr;
}

/* Style a form group when its input is focused */
.form-group:has(input:focus) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

/* Style a form group when its input is invalid and touched */
.form-group:has(input:invalid:not(:placeholder-shown)) {
  border-color: #ef4444;
}

/* Select previous siblings (impossible before :has()) */
/* Style all items BEFORE the hovered item */
.item:has(~ .item:hover) {
  opacity: 0.6;
}

/* Conditional page layout — if sidebar exists */
body:has(.sidebar) .main-content {
  max-width: calc(100% - 300px);
}

body:not(:has(.sidebar)) .main-content {
  max-width: 960px;
  margin-inline: auto;
}
```

**Real-world responsive problem solved:** A card that changes layout based on whether it has an image — responsive across all screen sizes:

```css
.card {
  display: grid;
  gap: 16px;
  padding: 16px;
  max-width: 100%;
}

/* Card WITH image: horizontal on desktop, vertical on mobile */
.card:has(> img) {
  grid-template-columns: 200px 1fr;
}

@media (max-width: 600px) {
  .card:has(> img) {
    grid-template-columns: 1fr;
  }
}

/* Card WITHOUT image: always single column */
.card:not(:has(> img)) {
  grid-template-columns: 1fr;
}
```

#### 3.7 CSS Nesting

Native CSS nesting (no preprocessor needed). Supported in all modern browsers.

```css
/* Before nesting — repetitive selectors */
.card { border: 1px solid #e2e8f0; }
.card .title { font-size: 1.25rem; }
.card .title:hover { color: blue; }
.card .body { padding: 16px; }

/* With native nesting — grouped and clean */
.card {
  border: 1px solid #e2e8f0;

  .title {
    font-size: 1.25rem;

    &:hover { color: blue; }
  }

  .body { padding: 16px; }

  /* Nest media queries too */
  @media (max-width: 768px) {
    padding: 12px;
  }
}
```

**Nesting with `&` (the nesting selector):**

```css
.btn {
  background: #3b82f6;

  &:hover { background: #2563eb; }       /* .btn:hover */
  &:focus-visible { outline-offset: 2px; } /* .btn:focus-visible */
  &.active { background: #1d4ed8; }       /* .btn.active */
  & + & { margin-left: 8px; }             /* .btn + .btn */

  .card & { width: 100%; }                /* .card .btn */
}
```

---

### 4. Sizing, Spacing & Units

#### 4.1 Units — Complete Reference

| Unit | Type | Relative To | When to Use |
|------|------|-------------|-------------|
| `px` | Absolute | — | Borders, shadows, fine-grained control |
| `%` | Relative | Parent's same property | Fluid widths inside parents |
| `em` | Relative | Element's font-size | Component-scoped scaling |
| `rem` | Relative | Root (`<html>`) font-size | Typography, spacing systems |
| `vw` | Viewport | 1% viewport width | Full-width elements, fluid text |
| `vh` | Viewport | 1% viewport height | **Avoid on mobile** (toolbar bug) |
| `dvh` | Dynamic VP | Dynamic viewport height | Full-height on mobile (adapts to toolbar) |
| `svh` | Small VP | Smallest viewport height | When toolbar is fully visible |
| `lvh` | Large VP | Largest viewport height | When toolbar is hidden |
| `ch` | Content | Width of "0" character | Input widths, monospace layouts |
| `ex` | Content | x-height of current font | Vertical alignment with text |
| `fr` | Grid | Fraction of available space | Grid track sizing only |
| `lh` | Content | Line-height of element | Vertical rhythm |
| `cap` | Content | Cap height of font | Precise text alignment |

**The `dvh/svh/lvh` units — solving the mobile viewport nightmare:**

```css
/* BAD: 100vh on mobile includes the hidden toolbar area */
.hero {
  height: 100vh; /* On mobile: content is taller than visible area */
}

/* GOOD: 100dvh adapts dynamically as toolbar appears/disappears */
.hero {
  height: 100dvh;
}

/* BETTER: Support older browsers with fallback */
.hero {
  height: 100vh;   /* Fallback for old browsers */
  height: 100dvh;  /* Modern browsers override */
}

/* Use svh for elements that must NEVER change size (prevents jank): */
.modal-overlay {
  height: 100svh; /* Based on smallest viewport — no resize jitter */
}

/* Use lvh for elements that maximize space when toolbar hides: */
.full-screen-media {
  height: 100lvh;
}
```

#### 4.2 Responsive Sizing Without Media Queries

```css
/* Fluid width that clamps between min and max */
.container {
  width: clamp(320px, 90%, 1200px);
  margin-inline: auto;
  padding-inline: 16px;
}

/* Fluid font size: 16px at 320px viewport, 24px at 1200px viewport */
.heading {
  font-size: clamp(1rem, 0.5rem + 2vw, 1.5rem);
}

/* min() — never wider than the available space */
.card {
  width: min(400px, 100%);
}

/* max() — never narrower than minimum readable width */
.text-column {
  width: max(300px, 50%);
}
```

**The responsive spacing scale:**

```css
:root {
  --space-xs: clamp(0.25rem, 0.2rem + 0.25vw, 0.5rem);
  --space-sm: clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem);
  --space-md: clamp(0.75rem, 0.6rem + 0.75vw, 1.25rem);
  --space-lg: clamp(1rem, 0.8rem + 1vw, 2rem);
  --space-xl: clamp(1.5rem, 1rem + 2vw, 3rem);
}

.section { padding: var(--space-xl); }
.card    { padding: var(--space-md); gap: var(--space-sm); }
```

#### 4.3 Aspect Ratio

```css
/* Fixed aspect ratio — great for responsive images and video containers */
.video-wrapper {
  aspect-ratio: 16 / 9;
  width: 100%;
  /* Height is automatically calculated from width */
}

.square-avatar {
  aspect-ratio: 1;  /* shorthand for 1/1 */
  width: 48px;
  border-radius: 50%;
  object-fit: cover;
}

/* Responsive card image that maintains ratio */
.card-image {
  aspect-ratio: 4 / 3;
  width: 100%;
  object-fit: cover;
}
```

**Real-world problem solved:** Preventing CLS (layout shift) when images load:

```css
/* Without aspect-ratio: image loads → page jumps → CLS score bad */
img {
  width: 100%;
  /* Height unknown until image loads → layout shift */
}

/* With aspect-ratio: space is reserved before image loads */
img {
  width: 100%;
  aspect-ratio: attr(width) / attr(height); /* Use HTML width/height attributes */
  object-fit: cover;
}

/* Or set explicit ratios per context: */
.hero-img { aspect-ratio: 21 / 9; width: 100%; object-fit: cover; }
.thumb-img { aspect-ratio: 1; width: 100%; object-fit: cover; }
```

---

### 5. Mathematical Functions & Logic

#### 5.1 `calc()` — Arithmetic in CSS

```css
/* Mix units freely */
.sidebar-offset {
  width: calc(100% - 250px);  /* Full width minus sidebar */
}

/* Nested calc for complex expressions */
.element {
  padding: calc(var(--base-spacing) * 2);
  margin-top: calc(var(--header-height) + 16px);
}

/* Centering a fixed-width element without transform: */
.centered {
  position: absolute;
  left: calc(50% - 150px); /* Half parent minus half self (300px wide) */
  width: 300px;
}
```

#### 5.2 `clamp()`, `min()`, `max()`

```css
/* clamp(minimum, preferred, maximum) */
/* The preferred value scales, but never below min or above max */

/* Fluid typography — scales smoothly from 375px to 1440px viewport */
h1 { font-size: clamp(1.75rem, 1.2rem + 2.5vw, 3rem); }
h2 { font-size: clamp(1.25rem, 1rem + 1.5vw, 2rem); }
p  { font-size: clamp(0.875rem, 0.8rem + 0.3vw, 1.125rem); }

/* Fluid container */
.container {
  width: min(1200px, 100% - 32px);
  margin-inline: auto;
}

/* Minimum touch target size (48px minimum per WCAG) */
.button {
  min-height: max(48px, 2.5rem);
  padding: max(8px, 0.5rem) max(16px, 1rem);
}
```

#### 5.3 Stepped Value Functions

```css
/* round(strategy, value, interval) */
/* Snap values to a grid */
.grid-snapped {
  width: round(nearest, 33.3%, 25%);  /* Rounds to 25% */
}

/* mod() — remainder after division */
/* Useful for alternating patterns */
.item:nth-child(3n) {
  /* could also use mod() in calc contexts */
}

/* rem() — CSS remainder function (not the unit) */
/* rem(dividend, divisor) */
```

#### 5.4 Trigonometric Functions

Trigonometric functions enable circular layouts and complex animations without JavaScript.

```css
/* Place items in a circle */
.circle-layout {
  position: relative;
  width: 300px;
  height: 300px;
}

/* 8 items evenly spaced on a circle */
.circle-item {
  --total: 8;
  --radius: 130px;
  --angle: calc(360deg / var(--total) * var(--i));

  position: absolute;
  top:  calc(50% + var(--radius) * sin(var(--angle)) - 20px);
  left: calc(50% + var(--radius) * cos(var(--angle)) - 20px);
  width: 40px;
  height: 40px;
}

.circle-item:nth-child(1) { --i: 0; }
.circle-item:nth-child(2) { --i: 1; }
.circle-item:nth-child(3) { --i: 2; }
/* ...etc */
```

#### 5.5 `@property` — Typed Custom Properties

`@property` registers a custom property with a type, initial value, and inheritance behavior. This enables CSS to **animate** custom properties (which is impossible with regular `--variables`).

**Browser support:** Universal (Chrome, Firefox 128+, Safari, Edge).

```css
/* Register a typed custom property */
@property --gradient-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* Now you can ANIMATE it — impossible with regular custom properties */
.gradient-box {
  --gradient-angle: 0deg;
  background: linear-gradient(var(--gradient-angle), #3b82f6, #8b5cf6);
  transition: --gradient-angle 0.6s ease;
}

.gradient-box:hover {
  --gradient-angle: 180deg;
  /* The gradient smoothly rotates! Regular --vars would snap instantly. */
}
```

**Animating a gradient (the most popular `@property` use case):**

```css
@property --color-stop {
  syntax: "<percentage>";
  initial-value: 0%;
  inherits: false;
}

.loading-bar {
  --color-stop: 0%;
  background: linear-gradient(90deg, #3b82f6 var(--color-stop), transparent var(--color-stop));
  animation: fill 2s ease forwards;
}

@keyframes fill {
  to { --color-stop: 100%; }
}
```

**Type-safe custom properties:**

```css
@property --spacing {
  syntax: "<length>";
  initial-value: 16px;
  inherits: true;
}

/* The browser will reject invalid values: */
.element {
  --spacing: 24px;    /* Valid */
  --spacing: red;     /* REJECTED — not a <length> */
  --spacing: 1.5rem;  /* Valid */
}
```

Available syntax values: `<length>`, `<number>`, `<percentage>`, `<color>`, `<angle>`, `<time>`, `<resolution>`, `<image>`, `<transform-function>`, `<custom-ident>`, and combinations with `|` and `+`.

---

### 6. Color Science & Typography

#### 6.1 Color Spaces — From sRGB to OKLCH

**The problem with HSL:** HSL looks intuitive but is **perceptually non-uniform**. An HSL color with lightness `50%` looks different depending on the hue — yellow at L:50% looks far brighter than blue at L:50%.

**OKLCH solves this.** It's a perceptually uniform color space where `L: 0.7` looks equally bright for ANY hue.

```css
/* OKLCH syntax: oklch(Lightness Chroma Hue / Alpha) */
/* L: 0 (black) to 1 (white) */
/* C: 0 (gray) to ~0.4 (maximum saturation) */
/* H: 0 to 360 (hue angle on color wheel) */

:root {
  --primary:     oklch(0.55 0.25 250);    /* vivid blue */
  --primary-hover: oklch(0.45 0.25 250);  /* darker, same chroma & hue */
  --primary-light: oklch(0.85 0.10 250);  /* light, desaturated version */

  /* Creating a palette with CONSISTENT perceived brightness: */
  --red:    oklch(0.65 0.25 25);
  --orange: oklch(0.65 0.20 55);
  --yellow: oklch(0.65 0.18 90);
  --green:  oklch(0.65 0.20 150);
  --blue:   oklch(0.65 0.25 250);
  --purple: oklch(0.65 0.25 300);
  /* All these colors look equally "bright" — impossible with HSL */
}
```

#### 6.2 `color-mix()`

Blend two colors in any color space:

```css
/* Syntax: color-mix(in <color-space>, <color1> <percentage>, <color2>) */

.hover-darken {
  --base: #3b82f6;
  background: var(--base);
}
.hover-darken:hover {
  background: color-mix(in oklch, var(--base) 70%, black);
  /* 70% base + 30% black = darkened version */
}

/* Creating opacity variations without alpha: */
.surface {
  background: color-mix(in srgb, var(--primary) 10%, white);
  /* 10% of primary mixed into white = very light tint */
}

/* Automatic dark mode color generation: */
:root {
  --text: oklch(0.2 0.02 250);
  --bg: oklch(0.98 0.005 250);
}
@media (prefers-color-scheme: dark) {
  :root {
    --text: oklch(0.9 0.02 250);
    --bg: oklch(0.15 0.02 250);
  }
}
```

#### 6.3 Relative Color Syntax

Transform an existing color by modifying its components:

```css
/* Syntax: color-function(from <origin-color> component-modifications) */

.element {
  --base: #3b82f6;

  /* Lighten by increasing L in OKLCH */
  color: oklch(from var(--base) calc(l + 0.2) c h);

  /* Desaturate by reducing chroma */
  background: oklch(from var(--base) l calc(c * 0.5) h);

  /* Shift hue by 30 degrees (complementary-ish) */
  border-color: oklch(from var(--base) l c calc(h + 30));

  /* Make semi-transparent */
  box-shadow: 0 4px 16px oklch(from var(--base) l c h / 0.3);
}
```

**Real-world problem solved:** Dynamic button hover states from a single color variable:

```css
.btn {
  --btn-color: oklch(0.55 0.25 250);
  background: var(--btn-color);
  color: oklch(from var(--btn-color) 0.98 0.01 h); /* near-white, same hue */
}
.btn:hover {
  background: oklch(from var(--btn-color) calc(l - 0.1) c h); /* darken */
}
.btn:active {
  background: oklch(from var(--btn-color) calc(l - 0.15) calc(c * 0.8) h); /* darker + desaturated */
}
```

#### 6.4 Gradients — Complete Reference

```css
/* Linear gradient */
.linear {
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
}

/* Radial gradient */
.radial {
  background: radial-gradient(circle at 30% 30%, #fbbf24, transparent 60%);
}

/* Conic gradient (pie-chart, color wheel) */
.conic {
  background: conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #ef4444);
  border-radius: 50%;
}

/* Repeating gradient (stripes) */
.stripes {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    #e2e8f0 10px,
    #e2e8f0 20px
  );
}

/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}
```

#### 6.5 Font Loading & Variable Fonts

```css
/* @font-face with display strategy */
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;     /* Variable font weight range */
  font-display: swap;        /* Show fallback immediately, swap when loaded */
}

/* font-display strategies: */
/* swap — text visible immediately with fallback, swaps when font loads (best for body text) */
/* optional — browser may skip the font if it's slow (best for non-critical fonts) */
/* fallback — short invisible period, then fallback (compromise) */
/* block — text invisible until font loads (only for icon fonts) */
```

**Variable fonts — one file, infinite weights:**

```css
/* Instead of loading 4 separate font files: */
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

/* Now use ANY weight: */
body     { font-weight: 400; }
strong   { font-weight: 600; }
h1       { font-weight: 750; } /* Not possible with static fonts! */
.light   { font-weight: 300; }
```

**Preventing CLS from font loading with `ascent-override`:**

```css
/* The problem: when a web font loads, it has different metrics than the fallback,
   causing text to shift and layout to jump (CLS). */

/* The fix: Override the fallback font metrics to match the web font: */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
  size-adjust: 107%;
}

body {
  font-family: "Inter", "Inter Fallback", sans-serif;
  /* Fallback now has nearly identical metrics — minimal CLS */
}
```

#### 6.6 Typography Fluid Scale

```css
/* A complete fluid type scale — no breakpoints needed */
:root {
  /* Base: 16px at 375px viewport → 18px at 1440px viewport */
  --text-xs:  clamp(0.75rem,  0.7rem + 0.2vw,  0.875rem);
  --text-sm:  clamp(0.8125rem, 0.76rem + 0.25vw, 0.9375rem);
  --text-base: clamp(1rem,    0.93rem + 0.33vw, 1.125rem);
  --text-lg:  clamp(1.125rem, 1rem + 0.5vw,    1.375rem);
  --text-xl:  clamp(1.25rem,  1.05rem + 1vw,   1.75rem);
  --text-2xl: clamp(1.5rem,   1.15rem + 1.5vw, 2.25rem);
  --text-3xl: clamp(1.875rem, 1.3rem + 2.5vw,  3rem);
  --text-4xl: clamp(2.25rem,  1.5rem + 3.5vw,  4rem);
}

body { font-size: var(--text-base); }
h1   { font-size: var(--text-4xl); }
h2   { font-size: var(--text-3xl); }
h3   { font-size: var(--text-2xl); }
```

---

### 7. Visual Decoration & Media

#### 7.1 Backgrounds

```css
.element {
  /* Multiple backgrounds — first listed is on top */
  background:
    url("overlay.svg") center/contain no-repeat,
    linear-gradient(135deg, #3b82f6, #8b5cf6);

  /* Background sizing */
  background-size: cover;      /* Fill container, may crop */
  background-size: contain;    /* Fit inside container, may letterbox */
  background-size: 200px auto; /* Explicit width, proportional height */

  /* Fixed background (parallax-like effect) */
  background-attachment: fixed; /* Caution: poor mobile performance */
}
```

#### 7.2 Borders & Outline

```css
/* Border radius — individual corners */
.card {
  border-radius: 16px;                          /* all corners */
  border-radius: 16px 16px 0 0;                 /* top only */
  border-radius: 50%;                             /* circle/ellipse */
  border-radius: 16px 16px 4px 4px;              /* top rounded, bottom subtle */
}

/* Outline vs Border: */
/* Border takes up layout space. Outline does NOT. */
.focus-ring {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;  /* Gap between element and outline */
  /* Outline doesn't change element size or trigger reflow */
}
```

#### 7.3 Shadows

```css
/* Box shadow: offset-x | offset-y | blur | spread | color */
.card {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);  /* Subtle elevation */
}

/* Layered shadows for realistic depth (common pattern): */
.card-elevated {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 12px 24px rgba(0, 0, 0, 0.03);
}

/* Inset shadow for pressed/sunken effect: */
.input {
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

/* Text shadow for readability over images: */
.hero-title {
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
```

#### 7.4 Object-fit & Object-position

```css
/* object-fit controls how replaced elements (img, video) fill their box */
.avatar {
  width: 64px;
  height: 64px;
  object-fit: cover;    /* Crops to fill, maintains aspect ratio */
  border-radius: 50%;
}

.product-img {
  width: 100%;
  height: 300px;
  object-fit: contain;  /* Letterboxed, never crops */
}

/* object-position controls the crop focus point */
.hero-image {
  width: 100%;
  height: 400px;
  object-fit: cover;
  object-position: center 20%; /* Focus on upper portion (face in photo) */
}

/* Responsive hero that works on all screen sizes: */
.responsive-hero-img {
  width: 100%;
  height: clamp(250px, 40vw, 600px); /* Fluid height */
  object-fit: cover;
  object-position: center center;
}
```

#### 7.5 Filters & Effects

```css
/* filter — applied to the element itself */
.blurred   { filter: blur(4px); }
.grayscale { filter: grayscale(100%); }
.bright    { filter: brightness(1.2); }
.shadow    { filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2)); }
/* drop-shadow follows the SHAPE, box-shadow follows the BOX */

/* Multiple filters chain left-to-right: */
.combined {
  filter: contrast(1.1) saturate(1.2) brightness(1.05);
}

/* backdrop-filter — applies to what's BEHIND the element */
.glass-panel {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px) saturate(1.5);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}

/* clip-path — custom element shapes */
.diagonal-section {
  clip-path: polygon(0 0, 100% 0, 100% 85%, 0 100%);
}

.circle-crop {
  clip-path: circle(50% at center);
}
```

**Real-world responsive glassmorphism card:**

```css
.glass-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(16px) saturate(1.8);
  -webkit-backdrop-filter: blur(16px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: clamp(16px, 3vw, 32px);
  max-width: min(500px, 100% - 32px);
}
```

---

### 8. Motion & Interactive APIs

#### 8.1 Transitions

Transitions animate a property change smoothly over time. They require a **trigger** (like `:hover` or a class change) and only animate between two states.

```css
.card {
  background: white;
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);

  /* Transition multiple properties with different timings */
  transition:
    transform 0.2s ease-out,
    box-shadow 0.2s ease-out,
    background 0.15s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  background: #fafafa;
}
```

**Timing functions — choosing the right one:**

```css
/* ease       — slow start, fast middle, slow end (default, good for most) */
/* ease-in    — slow start, accelerates (things leaving the screen) */
/* ease-out   — fast start, decelerates (things entering the screen) */
/* ease-in-out — slow both ends (symmetric motion) */
/* linear     — constant speed (progress bars, opacity fades) */

/* Custom cubic bezier for "spring-like" feel: */
.bouncy {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* Overshoots slightly, then settles — feels physical */
}
```

**Which properties can be transitioned?**

Animatable properties include: `opacity`, `transform`, `color`, `background-color`, `border-color`, `box-shadow`, `width`, `height`, `max-height`, `padding`, `margin`, `border-radius`, `font-size`, `letter-spacing`, `gap`, and more.

Non-animatable properties: `display`, `visibility` (only between visible/hidden — snaps), `grid-template-columns` (in most browsers), `content`.

```css
/* The "max-height" trick for animating to auto height: */
.accordion-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}
.accordion.open .accordion-content {
  max-height: 500px; /* Set larger than content will ever be */
}
/* Limitation: ease-out timing is based on 500px, not actual height */

/* Modern alternative: interpolate-size (Chrome 129+) */
.accordion-content {
  interpolate-size: allow-keywords;
  height: 0;
  overflow: hidden;
  transition: height 0.3s ease-out;
}
.accordion.open .accordion-content {
  height: auto; /* Now CSS can actually interpolate to auto! */
}
```

#### 8.2 Keyframe Animations

```css
@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.element {
  animation: slide-in-right 0.4s ease-out;
  /* Shorthand: name | duration | timing | delay | iteration | direction | fill | play-state */
}

/* Multi-step animation */
@keyframes pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.notification-dot {
  animation: pulse 2s ease-in-out infinite;
}

/* Fill modes: */
.element {
  animation-fill-mode: none;      /* Default: resets to original after animation */
  animation-fill-mode: forwards;  /* Keeps final keyframe state */
  animation-fill-mode: backwards; /* Applies first keyframe during delay */
  animation-fill-mode: both;      /* forwards + backwards */
}
```

**Staggered animation pattern (no JS needed):**

```css
.list-item {
  opacity: 0;
  transform: translateY(20px);
  animation: fade-in-up 0.4s ease-out forwards;
}

@keyframes fade-in-up {
  to { opacity: 1; transform: translateY(0); }
}

/* Stagger each item with custom property */
.list-item:nth-child(1)  { animation-delay: calc(0.05s * 1); }
.list-item:nth-child(2)  { animation-delay: calc(0.05s * 2); }
.list-item:nth-child(3)  { animation-delay: calc(0.05s * 3); }
.list-item:nth-child(4)  { animation-delay: calc(0.05s * 4); }
.list-item:nth-child(5)  { animation-delay: calc(0.05s * 5); }

/* Or use a CSS variable set inline for dynamic lists: */
/* HTML: <li style="--i: 0">, <li style="--i: 1">, etc. */
.list-item {
  animation-delay: calc(0.05s * var(--i, 0));
}
```

#### 8.3 Scroll-Driven Animations

Scroll-driven animations tie animation progress to scroll position instead of time. No JavaScript needed.

**Browser support:** Chrome 115+, Edge 115+, Safari 26+ (2026), Firefox behind flag.

**Two timeline types:**

```css
/* 1. Scroll Progress Timeline — tracks the scroll container's scroll position */
.progress-bar {
  position: fixed;
  top: 0; left: 0;
  width: 100%;
  height: 4px;
  background: #3b82f6;
  transform-origin: left;
  animation: grow-width linear;
  animation-timeline: scroll(root); /* Tied to page scroll */
}

@keyframes grow-width {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
/* Result: progress bar fills as you scroll the page. Zero JS. */

/* 2. View Progress Timeline — tracks an element's visibility in viewport */
.reveal-on-scroll {
  animation: fade-in-up linear both;
  animation-timeline: view();          /* Tied to element's viewport visibility */
  animation-range: entry 0% entry 100%; /* Animate during the "entering" phase */
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Animation ranges explained:**

```
┌──────────────────────────────────────────────┐ viewport
│                                              │
│   entry 0%    ─── element just enters        │
│   entry 100%  ─── element fully inside       │
│                                              │
│   contain 0%  ─── fully inside (start)       │
│   contain 100% ── fully inside (end)         │
│                                              │
│   exit 0%     ─── element starts leaving     │
│   exit 100%   ─── element fully gone         │
│                                              │
└──────────────────────────────────────────────┘
```

```css
/* Parallax effect — image moves slower than scroll */
.parallax-image {
  animation: parallax linear;
  animation-timeline: view();
  animation-range: cover 0% cover 100%;
}

@keyframes parallax {
  from { transform: translateY(-50px); }
  to   { transform: translateY(50px); }
}
```

**Progressive enhancement for unsupported browsers:**

```css
.reveal-on-scroll {
  /* Default: fully visible (for browsers without support) */
  opacity: 1;
  transform: translateY(0);
}

@supports (animation-timeline: view()) {
  .reveal-on-scroll {
    animation: fade-in-up linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 100%;
  }
}
```

#### 8.4 View Transitions API

View Transitions create smooth morph animations between DOM states. The browser captures a "before" screenshot, you update the DOM, then it animates from "before" to "after."

**Same-document transitions (SPA) — Chrome 111+, Firefox 133+, Safari 18+:**

```css
/* Step 1: Name elements that should morph */
.product-card img {
  view-transition-name: product-image;
}

.product-detail img {
  view-transition-name: product-image; /* Same name = browser morphs between them */
}

/* Step 2: Customize the transition animation */
::view-transition-old(product-image) {
  animation: fade-out 0.3s ease;
}

::view-transition-new(product-image) {
  animation: fade-in 0.3s ease;
}

/* Default crossfade for everything else */
::view-transition-old(root) {
  animation: fade-out 0.25s ease;
}

::view-transition-new(root) {
  animation: fade-in 0.25s ease;
}
```

```javascript
// Trigger the transition from JavaScript:
document.startViewTransition(() => {
  // Update DOM here — swap page content, toggle state, etc.
  updateContent();
});
```

**Cross-document transitions (MPA) — Chrome 126+, Safari 18.2+:**

```css
/* Add to BOTH source and destination pages: */
@view-transition {
  navigation: auto;
}

/* Named elements morph between pages automatically */
.hero-image {
  view-transition-name: hero;
}

.page-title {
  view-transition-name: title;
}
```

**Real-world problem solved:** A product list → product detail page transition where the thumbnail smoothly morphs into the full image:

```css
/* On the list page: */
.product-card-image {
  view-transition-name: product-hero; /* unique per card */
}

/* On the detail page: */
.product-hero-image {
  view-transition-name: product-hero; /* same name = morph */
}

/* For dynamic names (one per product): */
/* Set via inline style: style="view-transition-name: product-42" */
```

#### 8.5 Transform — Individual Properties

Modern CSS allows individual transform properties instead of the combined `transform` shorthand:

```css
/* Old way — all transforms in one property (hard to override individually) */
.old {
  transform: translateX(100px) rotate(45deg) scale(1.2);
}

/* New way — independent properties (composable, overridable) */
.new {
  translate: 100px 0;
  rotate: 45deg;
  scale: 1.2;
}

/* You can now transition them independently: */
.card {
  scale: 1;
  rotate: 0deg;
  translate: 0 0;
  transition:
    scale 0.2s ease,
    rotate 0.4s ease,    /* different timing! */
    translate 0.3s ease;
}

.card:hover {
  scale: 1.05;
  rotate: 2deg;
  translate: 0 -4px;
}
```

#### 8.6 `will-change` — Hardware Acceleration

```css
/* GOOD: Hint the browser before an animation starts */
.card:hover {
  will-change: transform; /* Promote to GPU layer BEFORE animating */
}
.card:hover .inner {
  transform: scale(1.1);
}

/* BAD: Applying to everything permanently */
* { will-change: transform, opacity; }
/* This creates a GPU layer for EVERY element = memory leak, worse performance */

/* RULE: Apply will-change only to elements that WILL animate,
   and remove it when the animation ends */
```

---

### 9. Responsive Design & Container Queries

#### 9.1 Desktop-First Responsive Strategy

Desktop-first means you write styles for the desktop layout by default, then use `max-width` media queries to adapt for smaller screens. This is the opposite of mobile-first (`min-width`).

```css
/* Desktop-first: default styles are for desktop */
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
}

/* Tablet */
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}

/* Mobile */
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

**Key breakpoints for a desktop-first approach:**

```css
/* Common desktop-first breakpoints: */
@media (max-width: 1280px) { /* Large desktop → Standard desktop */ }
@media (max-width: 1024px) { /* Desktop → Tablet landscape */ }
@media (max-width: 768px)  { /* Tablet → Tablet portrait / Large phone */ }
@media (max-width: 640px)  { /* Tablet portrait → Mobile */ }
@media (max-width: 480px)  { /* Mobile → Small mobile */ }
```

**The "no media query" strategy — let the content decide:**

```css
/* Instead of breakpoints, use intrinsic sizing: */
.responsive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: clamp(16px, 2vw, 32px);
}
/* This grid automatically goes from 4 columns to 1 column based on space.
   No breakpoints, no media queries, works on every screen size. */
```

#### 9.2 Media Queries — Complete Reference

```css
/* Width-based (the most common) */
@media (max-width: 768px) { /* styles for <= 768px */ }
@media (min-width: 769px) { /* styles for >= 769px */ }
@media (min-width: 769px) and (max-width: 1024px) { /* tablet only */ }

/* Orientation */
@media (orientation: portrait) { /* taller than wide */ }
@media (orientation: landscape) { /* wider than tall */ }

/* Resolution (for high-DPI screens) */
@media (min-resolution: 2dppx) { /* Retina/HiDPI screens */ }

/* Hover capability */
@media (hover: hover) { /* device has hover (mouse/trackpad) */ }
@media (hover: none)  { /* no hover (touch screens) */ }

/* Pointer precision */
@media (pointer: fine)   { /* mouse — small click targets OK */ }
@media (pointer: coarse) { /* touch — need larger targets */ }

/* User preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (prefers-color-scheme: dark) { /* user wants dark mode */ }
@media (prefers-contrast: more) { /* user wants higher contrast */ }
@media (forced-colors: active) { /* Windows High Contrast Mode */ }

/* Range syntax (modern — cleaner than min/max): */
@media (width <= 768px) { /* same as max-width: 768px */ }
@media (768px < width <= 1024px) { /* between 768 and 1024 */ }
@media (width >= 1025px) { /* desktop and above */ }
```

**Real-world responsive pattern — hover states only for hover-capable devices:**

```css
/* Desktop: show hover effects */
@media (hover: hover) {
  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
}

/* Touch devices: no hover, rely on active states */
@media (hover: none) {
  .card:active {
    transform: scale(0.98);
  }
}
```

#### 9.3 Container Queries

Container queries let components respond to their **container's size** instead of the viewport. This makes truly reusable, context-aware components.

**Browser support:** 95%+ global (Chrome 105+, Firefox 110+, Safari 16+).

```css
/* Step 1: Define a containment context on the parent */
.card-wrapper {
  container-type: inline-size;  /* Track width only (most common) */
  container-name: card-container; /* Optional name for specificity */
}

/* Shorthand: */
.card-wrapper {
  container: card-container / inline-size;
}

/* Step 2: Query the container */
@container card-container (min-width: 600px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 16px;
  }
}

@container card-container (max-width: 599px) {
  .card {
    display: flex;
    flex-direction: column;
  }
}
```

**Container query units:**

```css
/* cqw = 1% of container's width */
/* cqh = 1% of container's height */
/* cqi = 1% of container's inline size */
/* cqb = 1% of container's block size */
/* cqmin = smaller of cqi/cqb */
/* cqmax = larger of cqi/cqb */

.card-title {
  font-size: clamp(1rem, 3cqi, 1.5rem); /* Scales with container width */
}
```

**Real-world problem solved:** A sidebar card component that works identically in a narrow sidebar AND a wide main content area — without any context-specific classes:

```css
/* The card doesn't care about the VIEWPORT — it cares about ITS container */
.content-area { container-type: inline-size; }
.sidebar      { container-type: inline-size; }

.adaptive-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@container (min-width: 500px) {
  .adaptive-card {
    flex-direction: row;
    align-items: center;
  }
  .adaptive-card img {
    width: 200px;
    flex-shrink: 0;
  }
}

@container (min-width: 800px) {
  .adaptive-card {
    gap: 24px;
  }
  .adaptive-card img {
    width: 300px;
  }
}
```

**Container style queries (Chrome only, as of 2026):**

```css
/* Query custom property values on the container */
.theme-wrapper {
  container-type: inline-size;
  --theme: dark;
}

@container style(--theme: dark) {
  .card { background: #1a1a2e; color: white; }
}

@container style(--theme: light) {
  .card { background: white; color: #1a1a2e; }
}
```

#### 9.4 Feature Queries (`@supports`)

```css
/* Use modern features with graceful fallbacks: */
.grid-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

@supports (display: grid) {
  .grid-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
}

/* Check for specific property values: */
@supports (backdrop-filter: blur(10px)) {
  .glass { backdrop-filter: blur(10px); }
}

@supports not (backdrop-filter: blur(10px)) {
  .glass { background: rgba(255,255,255,0.9); }
}

/* Combine conditions: */
@supports (container-type: inline-size) and (animation-timeline: view()) {
  /* Both container queries AND scroll-driven animations available */
}
```

---

### 10. Performance & Accessibility Architecture

#### 10.1 Content Visibility

`content-visibility: auto` tells the browser to skip rendering off-screen elements until they're needed. This can yield **7x rendering performance boosts** on content-heavy pages.

**Browser support:** Baseline (Chrome, Firefox, Safari — September 2025).

```css
/* Apply to repeated sections that are likely off-screen */
.article-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 500px; /* Estimated height for scroll calculation */
}

/* For large lists or data tables: */
.table-row-group {
  content-visibility: auto;
  contain-intrinsic-size: auto 40px; /* Approximate row height */
}
```

**Why `contain-intrinsic-size` matters:** Without it, off-screen elements have zero height, making the scrollbar jump wildly as you scroll and elements render. The `auto` keyword lets the browser remember the actual size after first render.

```css
/* Full pattern for a long article page: */
article > section {
  content-visibility: auto;
  contain-intrinsic-size: auto 800px;
}

/* DON'T apply to above-the-fold content: */
article > section:first-child {
  content-visibility: visible; /* Always render the first section immediately */
}
```

**Real-world problem solved:** A dashboard with 50+ chart widgets that freezes on load:

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.widget {
  contain: content;                       /* Isolate layout/paint */
  content-visibility: auto;               /* Skip off-screen rendering */
  contain-intrinsic-size: auto 350px;     /* Estimated widget height */
}
```

#### 10.2 CLS (Cumulative Layout Shift) Prevention

CLS measures how much the page visually shifts during loading. A score below 0.1 is "good."

```css
/* CAUSE 1: Images without dimensions */
/* BAD: */
<img src="photo.jpg" alt="...">
/* Layout shifts when image loads because browser doesn't know the size */

/* GOOD: Always include width and height attributes: */
<img src="photo.jpg" alt="..." width="800" height="600">

/* And let CSS handle responsive sizing: */
img {
  max-width: 100%;
  height: auto;        /* Maintains aspect ratio */
  aspect-ratio: attr(width) / attr(height); /* Reserve space */
}

/* CAUSE 2: Web fonts changing text metrics */
/* Solution: font-display + metric overrides (see Section 6.5) */

/* CAUSE 3: Dynamic content injection (ads, embeds) */
/* Solution: Reserve space with min-height: */
.ad-slot {
  min-height: 250px;  /* Reserve space for the ad */
  background: #f3f4f6;
}

/* CAUSE 4: Lazy-loaded iframes */
iframe {
  aspect-ratio: 16 / 9;
  width: 100%;
  height: auto;
}
```

#### 10.3 Accessibility via CSS

```css
/* Visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Focus visible — keyboard users see it, mouse users don't */
:focus { outline: none; } /* Remove default */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Focus-within — highlight a form group when any child is focused */
.form-group:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

/* Minimum touch target sizes (WCAG 2.5.8) */
@media (pointer: coarse) {
  button, a, [role="button"], input, select {
    min-height: 44px;
    min-width: 44px;
  }
}

/* Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* High contrast mode support */
@media (forced-colors: active) {
  .custom-checkbox {
    border: 2px solid ButtonText;
  }
  .custom-checkbox:checked {
    background: Highlight;
  }
}

/* Styling based on ARIA states */
[aria-expanded="false"] + .dropdown-menu {
  display: none;
}
[aria-expanded="true"] + .dropdown-menu {
  display: block;
}

[aria-disabled="true"] {
  opacity: 0.5;
  pointer-events: none;
}

[aria-current="page"] {
  font-weight: 600;
  border-bottom: 2px solid currentColor;
}
```

---

### 11. Theming & Design Systems

#### 11.1 CSS Custom Properties Theming System

```css
/* Define your design tokens as CSS variables */
:root {
  /* Colors */
  --color-primary: oklch(0.55 0.25 250);
  --color-primary-hover: oklch(0.45 0.25 250);
  --color-primary-light: oklch(0.92 0.05 250);
  --color-surface: oklch(0.99 0.005 250);
  --color-surface-elevated: oklch(1 0 0);
  --color-text: oklch(0.15 0.02 250);
  --color-text-muted: oklch(0.45 0.02 250);
  --color-border: oklch(0.9 0.01 250);

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.1);
}
```

#### 11.2 Dark Mode

```css
/* Automatic dark mode via system preference: */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: oklch(0.7 0.2 250);
    --color-primary-hover: oklch(0.75 0.2 250);
    --color-primary-light: oklch(0.25 0.08 250);
    --color-surface: oklch(0.15 0.02 250);
    --color-surface-elevated: oklch(0.2 0.02 250);
    --color-text: oklch(0.92 0.01 250);
    --color-text-muted: oklch(0.65 0.02 250);
    --color-border: oklch(0.25 0.02 250);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 12px 32px rgba(0,0,0,0.5);
  }
}

/* Manual toggle with a data attribute: */
[data-theme="dark"] {
  --color-surface: oklch(0.15 0.02 250);
  --color-text: oklch(0.92 0.01 250);
  /* ...override all tokens */
}

/* Respect user preference, allow manual override: */
:root {
  color-scheme: light dark; /* Tell browser this site supports both */
}
```

**Common dark mode mistake — perceptual color issues:**

```css
/* BAD: Simply inverting lightness */
/* Light: --primary: oklch(0.55 0.25 250) */
/* Dark:  --primary: oklch(0.45 0.25 250)  ← TOO DARK, hard to read */

/* GOOD: Increase lightness AND slightly reduce chroma for dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: oklch(0.7 0.2 250);
    /* Lighter (0.7 vs 0.55) AND slightly less saturated (0.2 vs 0.25)
       because saturated colors on dark backgrounds appear to "glow" */
  }
}
```

#### 11.3 Design Token Pipeline

```css
/* Semantic layer over primitive tokens: */
:root {
  /* Primitive tokens (raw values) */
  --blue-500: oklch(0.55 0.25 250);
  --blue-600: oklch(0.45 0.25 250);
  --gray-100: oklch(0.96 0.005 250);
  --gray-900: oklch(0.15 0.02 250);

  /* Semantic tokens (meaning) */
  --color-action: var(--blue-500);
  --color-action-hover: var(--blue-600);
  --color-bg-primary: var(--gray-100);
  --color-text-primary: var(--gray-900);
}

/* Components only reference semantic tokens: */
.btn-primary {
  background: var(--color-action);
  color: white;
}
.btn-primary:hover {
  background: var(--color-action-hover);
}

/* Brand swap = change primitive → semantic mappings, no component changes */
[data-brand="luxury"] {
  --color-action: oklch(0.5 0.15 50); /* gold */
  --color-action-hover: oklch(0.4 0.15 50);
}
```

---

### 12. Architectural Patterns

#### 12.1 BEM (Block Element Modifier)

```css
/* Block: standalone component */
.card { }

/* Element: part of a block (double underscore) */
.card__title { }
.card__body { }
.card__footer { }

/* Modifier: variation of a block or element (double hyphen) */
.card--featured { }
.card__title--large { }
```

```html
<div class="card card--featured">
  <h2 class="card__title card__title--large">Title</h2>
  <div class="card__body">Content</div>
  <div class="card__footer">Actions</div>
</div>
```

**When BEM helps:** Large teams, long-lived projects, component libraries.
**When to skip BEM:** Utility-first CSS (Tailwind), CSS Modules, or CSS-in-JS handle scoping automatically.

#### 12.2 Utility-First CSS (Tailwind Pattern)

```css
/* Instead of semantic classes with unique styles: */
.card-fancy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

/* Utility-first composes from atomic classes: */
/* <div class="flex flex-col gap-4 p-6 rounded-xl shadow-md"> */
```

**Trade-offs:**
- Utility-first: Faster development, consistent spacing, no naming, but verbose HTML
- Semantic CSS: Readable HTML, reusable components, but naming is hard and styles grow unbounded
- **Best practice:** Use utilities for layout/spacing, semantic classes for complex component states

#### 12.3 CSS Modules

CSS Modules automatically scope class names to prevent global conflicts.

```css
/* Button.module.css */
.button {
  padding: 8px 16px;
  border-radius: 6px;
}
.primary {
  background: var(--color-action);
}
```

```tsx
import styles from "./Button.module.css";
// styles.button = "Button_button_x7k2" (auto-scoped)
// styles.primary = "Button_primary_a3f9"
```

#### 12.4 ITCSS (Inverted Triangle CSS)

Layer your CSS from most generic to most specific:

```
Settings    → Variables, tokens (no CSS output)
Tools       → Mixins, functions (no CSS output)
Generic     → Reset, normalize, box-sizing
Elements    → Bare HTML elements (h1, a, p)
Objects     → Layout primitives (container, grid)
Components  → UI components (card, button, modal)
Utilities   → Overrides (!important allowed here only)
```

Combine with `@layer` for modern enforcement:

```css
@layer settings, generic, elements, objects, components, utilities;
```

---

### 13. Cross-Browser, Tooling & Integration

#### 13.1 Reset vs Normalize

```css
/* Modern CSS Reset (minimal, opinionated): */
*, *::before, *::after {
  box-sizing: border-box;
}

* {
  margin: 0;
}

body {
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

input, button, textarea, select {
  font: inherit;
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}

#root, #__next {
  isolation: isolate; /* Creates a stacking context at the app root */
}
```

#### 13.2 Print Styles

```css
@media print {
  /* Hide non-essential UI */
  nav, footer, .sidebar, .no-print, button {
    display: none !important;
  }

  /* Reset backgrounds and colors for ink savings */
  * {
    background: transparent !important;
    color: black !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  /* Prevent page breaks inside elements */
  .card, img, table, pre {
    break-inside: avoid;
  }

  /* Force page breaks before major sections */
  h2, h3 {
    break-after: avoid; /* Don't leave a heading at the bottom of a page */
  }

  /* Show link URLs in print */
  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
    color: #666 !important;
  }

  body {
    font-size: 12pt;
    line-height: 1.4;
  }
}
```

#### 13.3 DevTools Debugging Techniques

Key CSS debugging strategies in modern browser DevTools:

- **Computed tab:** See the final value of any property after cascade resolution.
- **Layout panel:** Visualize flex/grid overlays directly on the page.
- **3D View (Edge):** Visualize stacking contexts and z-index layers.
- **CSS Overview (Chrome):** Audit colors, fonts, unused CSS, and media queries.
- **Animations panel:** Slow down, replay, and inspect keyframe animations.
- **Performance panel:** Record and identify layout thrashing, paint storms, and long tasks.

```css
/* Quick debug outline — visualize all boxes without affecting layout: */
* { outline: 1px solid rgba(255, 0, 0, 0.2); }

/* Debug specific layout issues: */
* { outline: 1px solid red; }                    /* all boxes */
*:nth-child(odd) { outline-color: blue; }        /* differentiate siblings */

/* Debug overflow: find the element causing horizontal scroll: */
* {
  outline: 1px solid red !important;
  /* Look for the element extending past the viewport */
}
```

#### 13.4 Vendor Prefixes (Still Needed in 2026)

Most modern CSS features don't need prefixes anymore, but some exceptions remain:

```css
/* backdrop-filter still needs -webkit- in some WebKit versions: */
.glass {
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

/* user-select: */
.no-select {
  -webkit-user-select: none;
  user-select: none;
}

/* appearance: */
.custom-select {
  -webkit-appearance: none;
  appearance: none;
}

/* text-size-adjust (prevents mobile font boosting): */
body {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
```

Use Autoprefixer in your build tooling to handle these automatically.

#### 13.5 Framework Integration Patterns

```css
/* Next.js with CSS Modules: */
/* components/Card.module.css */
.wrapper {
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

/* Global styles in app/globals.css */
/* Design tokens, resets, base typography */

/* Tailwind + custom CSS: */
/* Use Tailwind for layout/spacing utilities */
/* Use custom CSS (via Modules or globals) for complex component states */
@layer components {
  .btn-primary {
    @apply px-4 py-2 rounded-lg font-medium;
    background: var(--color-action);
    transition: background 0.15s ease;
  }
}
```

---
---

## Common Bugs

> These are not trivial styling issues. They are the rendering engine's behaviors that most developers "fix" with hacks or JavaScript. A CSS specialist solves them by understanding the underlying mechanics.

### 1. Stacking Context & Z-Index Collapse

#### The "Z-Index War"

**Symptom:** You set `z-index: 9999` on a modal, but it still appears behind a header with `z-index: 10`.

**Root cause:** The modal is inside a parent that creates a stacking context with a lower z-index than the header's stacking context. `z-index` only competes within the SAME stacking context.

```css
/* THE BUG: */
.header {
  position: relative;
  z-index: 10;  /* Stacking context A */
}

.content {
  position: relative;
  z-index: 1;   /* Stacking context B — lower than A */
}

.content .modal {
  position: fixed;
  z-index: 9999; /* Competes within context B only */
  /* Context B (z-index:1) vs Context A (z-index:10) → header wins */
}

/* THE FIX — Option 1: Move modal outside the low-context parent */
/* Render the modal as a sibling of .header, not a child of .content */

/* THE FIX — Option 2: Remove the unnecessary stacking context */
.content {
  position: relative;
  /* z-index: 1; ← REMOVE THIS. Without z-index, no stacking context is created */
}

/* THE FIX — Option 3: Use isolation on the header to contain IT */
.header {
  position: relative;
  z-index: auto;       /* Don't create a new context here either */
  isolation: isolate;  /* Contains children without setting z-index */
}
```

#### Unexpected Stacking Context Triggers

**Symptom:** Adding `opacity: 0.99` or `filter: blur(0)` to an element suddenly breaks z-index relationships.

```css
/* BEFORE: tooltip works fine */
.parent { }
.tooltip { position: absolute; z-index: 100; }

/* AFTER: adding animation to parent breaks tooltip */
.parent {
  opacity: 0.99; /* NOW creates a stacking context */
  /* tooltip's z-index: 100 is trapped inside this context */
}

/* FIX: Be aware of ALL triggers — and use isolation: isolate when you
   intentionally want a stacking boundary without side effects */
```

**Full list of stacking context triggers:**
- `position: relative/absolute` with `z-index` other than `auto`
- `position: fixed` or `position: sticky` (always)
- `opacity` < 1
- `transform` other than `none`
- `filter` other than `none`
- `backdrop-filter` other than `none`
- `mix-blend-mode` other than `normal`
- `isolation: isolate`
- `will-change` specifying any of the above
- `contain: layout` or `contain: paint`
- `clip-path` other than `none`
- `mask` / `mask-image` other than `none`

---

### 2. Box Model, Margins & Spacing

#### Collapsed Margins

**Symptom:** Two adjacent elements have `margin-bottom: 20px` and `margin-top: 30px`, but the gap between them is 30px, not 50px.

```css
/* THE BUG: Margins collapse — the larger one wins */
.element-a { margin-bottom: 20px; }
.element-b { margin-top: 30px; }
/* Gap = 30px, not 50px */

/* THE FIX — use gap (no collapsing in flex/grid): */
.parent {
  display: flex;
  flex-direction: column;
  gap: 30px; /* Predictable, never collapses */
}

/* Or use padding instead of margin for spacing: */
.element-a { padding-bottom: 20px; }
.element-b { padding-top: 30px; }
/* Total gap = 50px (padding never collapses) */
```

**Parent-child margin collapse:**

```css
/* THE BUG: Child's margin "leaks" out of parent */
.parent { background: gray; }
.child  { margin-top: 40px; }
/* Result: parent moves down 40px, child has 0px gap from parent's top */

/* THE FIX: */
.parent {
  display: flow-root; /* Creates BFC, blocks collapse */
}
/* Or: padding-top: 1px, or border-top: 1px solid transparent, or display: flex */
```

#### Centering & Vertical Alignment

**The definitive centering guide:**

```css
/* 1. Center a block element horizontally: */
.block-center {
  width: fit-content; /* or a fixed width */
  margin-inline: auto;
}

/* 2. Center inline/text content: */
.text-center { text-align: center; }

/* 3. Center a child both horizontally and vertically (BEST method): */
.parent {
  display: grid;
  place-items: center;
}

/* 4. Center with flexbox: */
.parent {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 5. Center an absolutely positioned element: */
.absolute-center {
  position: absolute;
  inset: 0;
  margin: auto;
  width: fit-content;
  height: fit-content;
}

/* 6. Center absolutely WITHOUT knowing dimensions: */
.absolute-center-unknown {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
}
```

#### Whitespace Between Inline-Block Elements

**Symptom:** Inline-block elements have mysterious 4px gaps between them.

```html
<nav>
  <a href="#">Home</a>
  <a href="#">About</a>
  <a href="#">Contact</a>
</nav>
```

```css
/* THE BUG: Each <a> has ~4px gap caused by whitespace in HTML */
nav a {
  display: inline-block;
  padding: 8px 16px;
}

/* FIX 1 (best): Use flexbox instead */
nav {
  display: flex;
  gap: 0; /* or whatever gap you want */
}

/* FIX 2: font-size trick (legacy) */
nav { font-size: 0; }
nav a { font-size: 1rem; }
```

---

### 3. Intrinsic Sizing & Layout Rigidity

#### The "Overflow-JS" Trap

**Symptom:** Using JavaScript to calculate remaining space because "CSS can't know the sibling's height."

```css
/* THE BUG: Trying to fill remaining vertical space */
.header { height: 80px; }
.content { height: calc(100vh - 80px); } /* Breaks when header height changes */

/* THE FIX: Let CSS handle it natively */
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.header  { /* auto height from content */ }
.content { flex: 1; } /* Takes ALL remaining space automatically */
.footer  { /* auto height from content */ }
```

#### Flexbox `min-width: auto` Problem

**Symptom:** Flex items refuse to shrink, causing horizontal overflow.

```css
/* THE BUG: */
.flex-container { display: flex; width: 500px; }
.item { flex: 1; }
.item-with-long-text {
  flex: 1;
  /* Contains a 600px-wide string. Won't shrink below it. */
}

/* WHY: flex items have implicit min-width: auto (can't shrink below content) */

/* THE FIX: */
.item-with-long-text {
  flex: 1;
  min-width: 0;       /* Allow shrinking below content width */
  overflow: hidden;    /* Handle the overflow */
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

#### Grid `auto-fill` vs `auto-fit` Confusion

**Symptom:** Responsive grid has unexpected empty space (auto-fill) or items stretch too wide (auto-fit).

```css
/* auto-fill: keeps empty tracks → items DON'T stretch to fill extra space */
.grid-fill {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  /* 2 items in 1000px = 2×200px items + 3 empty 200px tracks */
}

/* auto-fit: collapses empty tracks → items stretch to fill extra space */
.grid-fit {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  /* 2 items in 1000px = 2×500px items (empty tracks collapse to 0) */
}

/* RULE: Use auto-fit for most responsive grids (items fill the row).
   Use auto-fill when you want consistent column widths regardless of item count. */
```

#### The `100vh` Mobile Bug

**Symptom:** A full-screen hero section is taller than the visible viewport on mobile, hiding content behind the address bar.

```css
/* THE BUG: */
.hero { height: 100vh; }
/* Mobile browsers include the hidden address bar in 100vh calculation */

/* THE FIX (modern): */
.hero {
  height: 100dvh;  /* Dynamic viewport height — adjusts to visible area */
}

/* THE FIX (with fallback): */
.hero {
  height: 100vh;   /* Fallback for older browsers */
  height: 100dvh;  /* Override for modern browsers */
}

/* ALTERNATIVE: If you don't want the jitter of dvh resizing: */
.hero {
  height: 100svh;  /* Small viewport height — always the smallest (toolbar visible) */
  /* Slightly shorter but never jumps */
}
```

#### `aspect-ratio` Compatibility

**Symptom:** Aspect ratio doesn't work in older browsers, causing layout shifts.

```css
/* Modern: */
.video-container {
  aspect-ratio: 16 / 9;
  width: 100%;
}

/* Fallback for older browsers: */
@supports not (aspect-ratio: 16 / 9) {
  .video-container {
    position: relative;
    padding-bottom: 56.25%; /* 9/16 = 0.5625 */
    height: 0;
  }
  .video-container > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
}
```

---

### 4. Contextual Styling & Dependency Logic

#### Parent-Child "Ghosting" (solved by `:has()`)

**Symptom:** Need to style a parent based on child state, previously impossible without JavaScript.

```css
/* Style a card based on whether it contains an image */
.card:has(img) {
  grid-template-columns: 1fr 2fr;
}
.card:not(:has(img)) {
  grid-template-columns: 1fr;
}

/* Highlight a form field wrapper when the input is focused */
.field:has(input:focus) {
  border-color: #3b82f6;
}

/* Style a navigation when it has more than 5 items */
nav:has(:nth-child(6)) {
  flex-wrap: wrap; /* Wrap when there are many items */
}

/* Count-based styling: */
.tag-list:has(> :nth-child(4)) .tag {
  font-size: 0.75rem; /* Shrink tags when there are 4+ */
}
```

#### The "Proximity" Problem (solved by `@layer` and `@scope`)

**Symptom:** You need to override a library's styles without `!important` or increasing specificity.

```css
/* Before @layer — specificity arms race: */
.library .btn.btn-primary { background: blue; }         /* (0, 3, 0) */
.my-app .btn.btn-primary { background: teal; }          /* (0, 3, 0) — loses (same, but source order) */
.my-app .content .btn.btn-primary { background: teal; } /* (0, 4, 0) — wins but ugly */

/* After @layer — clean override: */
@import url("library.css") layer(vendor);
@layer vendor, app;

@layer app {
  .btn-primary { background: teal; }
  /* (0, 1, 0) in the app layer beats (0, 3, 0) in the vendor layer */
}
```

---

### 5. Legacy Layout & Float Issues

#### Float Containment

**Symptom:** A parent element collapses to 0 height when all children are floated.

```css
/* THE BUG: */
.parent { background: gray; }
.child  { float: left; width: 50%; }
/* .parent has 0 height — gray background is invisible */

/* LEGACY FIX: Clearfix hack */
.parent::after {
  content: "";
  display: table;
  clear: both;
}

/* MODERN FIX: */
.parent {
  display: flow-root; /* Creates BFC, contains floats */
}

/* BEST FIX: Stop using floats for layout. Use flexbox or grid. */
.parent {
  display: flex;
}
```

#### Sticky Footer

**Symptom:** Footer doesn't stick to the bottom when content is short.

```css
/* THE FIX (modern flexbox): */
body {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

main {
  flex: 1; /* Main content takes all available space */
}

footer {
  /* Naturally sticks to the bottom when content is short */
  /* Naturally pushes below fold when content is long */
}

/* THE FIX (modern grid): */
body {
  display: grid;
  grid-template-rows: auto 1fr auto; /* header, main, footer */
  min-height: 100dvh;
}
```

---

### 6. Performance & Rendering Bottlenecks

#### CLS (Cumulative Layout Shift)

**Complete prevention checklist:**

```css
/* 1. Always set dimensions on images */
img, video {
  max-width: 100%;
  height: auto;
}
/* Plus in HTML: <img width="800" height="600" ...> */

/* 2. Reserve space for ads and embeds */
.ad-slot { min-height: 250px; }
.embed-wrapper { aspect-ratio: 16 / 9; }

/* 3. Prevent font-swap CLS */
@font-face {
  font-family: "Custom";
  src: url("font.woff2") format("woff2");
  font-display: swap;
  /* + metric overrides (ascent-override, descent-override, size-adjust) */
}

/* 4. Avoid injecting content above existing content */
/* If you must show a banner at the top, use transform instead of pushing content: */
.top-banner {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  /* This doesn't push content down — it overlays */
}

/* 5. Use contain for dynamic widgets */
.dynamic-widget {
  contain: layout;
  min-height: 200px; /* Reserve estimated space */
}
```

#### Layout Thrashing

**Symptom:** Animations using `left`, `top`, `width`, `height`, or `margin` cause jank.

```css
/* BAD: Animating layout properties (triggers reflow every frame) */
.animate-bad {
  transition: left 0.3s, top 0.3s;
}
.animate-bad:hover {
  left: 100px;
  top: 50px;
}

/* GOOD: Animating composite properties (GPU only, no reflow) */
.animate-good {
  transition: transform 0.3s;
}
.animate-good:hover {
  transform: translate(100px, 50px);
}

/* BAD: Animating width for a progress bar */
.progress-bad {
  width: 0%;
  transition: width 0.5s;
}

/* GOOD: Animating transform for a progress bar */
.progress-good {
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.5s;
}
.progress-good[data-complete] {
  transform: scaleX(1);
}
```

#### The "Paint Storm"

**Symptom:** Heavy `box-shadow`, `blur`, and `filter` cause laggy scrolling.

```css
/* BAD: Complex shadow that repaints on every scroll frame */
.card {
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  filter: blur(0.5px);
}

/* GOOD: Promote to its own layer and use pseudo-element for shadow */
.card {
  position: relative;
}
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  z-index: -1;
  opacity: 1;
  transition: opacity 0.3s;
  will-change: opacity; /* GPU layer for the shadow only */
}

/* Or use contain to limit repaint scope: */
.card {
  contain: paint;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
```

---

### 7. Advanced Typography & Fluidity

#### The "Line-Height Crop"

**Symptom:** Extra space above and below text prevents pixel-perfect alignment with icons or borders.

```css
/* THE BUG: Text has invisible "leading" space above and below */
.label {
  font-size: 14px;
  line-height: 1.5; /* Adds ~3.5px above and below the text */
  border: 1px solid gray;
  /* Text looks vertically off-center inside the border */
}

/* THE FIX: Use leading-trim (future CSS — experimental): */
.label {
  text-box-trim: both;           /* Trim leading from both sides */
  text-box-edge: cap alphabetic; /* Trim to cap-height and baseline */
}

/* CURRENT FIX: Manual compensation */
.label {
  line-height: 1;
  padding: 6px 12px; /* Control spacing manually */
}

/* For icon + text alignment: */
.icon-text {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-text svg {
  flex-shrink: 0;
}
```

#### FOUT vs FOIT

**Symptom:** Text is either invisible (FOIT) or flashes from fallback to web font (FOUT).

```css
/* FOIT (Flash of Invisible Text): */
@font-face {
  font-family: "Custom";
  src: url("custom.woff2") format("woff2");
  font-display: block; /* Text invisible until font loads — BAD for a11y */
}

/* FOUT (Flash of Unstyled Text): */
@font-face {
  font-family: "Custom";
  src: url("custom.woff2") format("woff2");
  font-display: swap; /* Shows fallback immediately, swaps when loaded */
  /* CLS risk: fallback and web font have different metrics */
}

/* BEST: swap + metric overrides to minimize the "flash" */
@font-face {
  font-family: "Custom Fallback";
  src: local("Arial");
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
  size-adjust: 107%;
}

body {
  font-family: "Custom", "Custom Fallback", sans-serif;
  /* Fallback metrics match web font → almost no visible shift */
}
```

#### Multi-line Text Truncation

**Symptom:** Need `...` after exactly N lines of text.

```css
/* Single-line truncation: */
.truncate-1 {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Multi-line truncation (works in all modern browsers): */
.truncate-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Note: Despite -webkit- prefix, this works in ALL browsers */
}

/* Responsive line clamping: */
.card-description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  -webkit-line-clamp: 3;
}

@media (max-width: 640px) {
  .card-description {
    -webkit-line-clamp: 2; /* Fewer lines on mobile */
  }
}
```

---

### 8. Interaction & Motion Logic

#### Scroll-Linked Jank

**Symptom:** JavaScript-based scroll animations stutter on 120Hz displays.

```css
/* BAD: JavaScript listening to scroll events */
/* window.addEventListener('scroll', () => { element.style.transform = ... }) */
/* Runs on main thread, blocks rendering, causes jank */

/* GOOD: CSS scroll-driven animations (GPU-accelerated, off main thread) */
.parallax {
  animation: parallax linear;
  animation-timeline: view();
  animation-range: cover 0% cover 100%;
}

@keyframes parallax {
  from { transform: translateY(-30%); }
  to   { transform: translateY(30%); }
}

/* GOOD: For sticky header shrinking: */
.header {
  animation: shrink-header linear both;
  animation-timeline: scroll(root);
  animation-range: 0px 200px;
}

@keyframes shrink-header {
  from { padding-block: 24px; font-size: 1.5rem; }
  to   { padding-block: 8px; font-size: 1rem; }
}
```

#### The Sticky Parent Trap

**Symptom:** `position: sticky` doesn't work.

**Debugging checklist:**

```css
/* 1. Does it have a top/bottom/left/right value? */
.sticky { position: sticky; top: 0; } /* REQUIRED */

/* 2. Does any ancestor have overflow: hidden/auto/scroll? */
.ancestor { overflow: hidden; } /* THIS breaks sticky */
/* FIX: Remove overflow, or make the overflow container the sticky's parent */

/* 3. Does the sticky element have room to scroll? */
/* If sticky's parent is exactly the same height as sticky, there's nowhere to "stick" */
.short-parent {
  height: 100px; /* Parent must be taller than the sticky child */
}

/* 4. Is there a containing block issue? */
/* transform, filter, or perspective on an ancestor can break sticky in some browsers */

/* 5. Table headers — special case: */
/* In some browsers, <th> or <tr> can't be sticky. Wrap in a separate element: */
.table-wrapper {
  max-height: 400px;
  overflow: auto; /* This is the scroll container */
}
thead th {
  position: sticky;
  top: 0;
  background: white; /* Needed or content shows through */
  z-index: 1;
}
```

#### State Persistence Without JavaScript

```css
/* Accordion using only CSS (with :has() and details/summary): */
details {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

details summary {
  padding: 12px 16px;
  cursor: pointer;
  list-style: none; /* Remove default triangle */
  display: flex;
  justify-content: space-between;
  align-items: center;
}

details summary::after {
  content: "+";
  font-size: 1.25rem;
  transition: transform 0.2s ease;
}

details[open] summary::after {
  transform: rotate(45deg); /* Rotates + to × */
}

details .content {
  padding: 0 16px 16px;
}

/* Tabs using radio inputs (no JS): */
.tab-input { display: none; }

.tab-input:checked + .tab-label {
  border-bottom: 2px solid var(--color-primary);
  color: var(--color-primary);
}

#tab1:checked ~ .tab-panels .panel-1,
#tab2:checked ~ .tab-panels .panel-2,
#tab3:checked ~ .tab-panels .panel-3 {
  display: block;
}

.tab-panels .panel {
  display: none;
}
```

---

### 9. Modern Color & Theming

#### Perceptual Color Issues in Dark Mode

**Symptom:** Colors that look great in light mode look "off" in dark mode — blue appears purple, green appears yellowish.

```css
/* THE PROBLEM: Using the same color in both modes */
:root {
  --primary: #3b82f6; /* Looks fine on white */
}
@media (prefers-color-scheme: dark) {
  :root {
    --primary: #3b82f6; /* Looks muted/purple on dark backgrounds */
  }
}

/* THE FIX: Use OKLCH and adjust both lightness AND chroma */
:root {
  --primary: oklch(0.55 0.25 250); /* Rich blue on light bg */
}
@media (prefers-color-scheme: dark) {
  :root {
    --primary: oklch(0.7 0.2 250);
    /* Higher lightness (0.7) for readability
       Slightly lower chroma (0.2) to prevent "glowing" on dark bg */
  }
}
```

#### Dynamic Text Color Based on Background

**Symptom:** A CMS provides a dynamic background color, and you need text to be white or black for readability.

```css
/* Using color-contrast() (future CSS — limited support):
   color: color-contrast(var(--bg) vs white, black); */

/* Current solution with relative color syntax: */
.dynamic-badge {
  --bg: var(--user-color, #3b82f6);
  background: var(--bg);

  /* Extract lightness and conditionally set text color */
  /* If lightness > 0.6, use dark text; otherwise, light text */
  color: oklch(from var(--bg)
    clamp(0, (0.6 - l) * 999, 1)   /* 0 if light bg, 1 if dark bg */
    0.01 h
  );
  /* Note: This technique is experimental. For production,
     compute the contrast server-side or with JS. */
}

/* Safest production approach: */
.badge-light { background: var(--bg); color: #1a1a2e; }
.badge-dark  { background: var(--bg); color: #f8fafc; }
/* Let the server or JS decide which class to apply */
```

---

### 10. Form Controls & Custom Inputs

#### Custom Checkboxes and Radio Buttons

```css
/* Modern approach using appearance: none */
input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease, border-color 0.15s ease;
}

input[type="checkbox"]:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 1px;
  width: 6px;
  height: 12px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Radio buttons: */
input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

input[type="radio"]:checked {
  border-color: var(--color-primary);
  border-width: 6px; /* Creates the filled dot effect */
}
```

#### Custom Range Slider

```css
/* Reset across all browsers: */
input[type="range"] {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  outline: none;
}

/* Thumb styling — must be done per browser engine: */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

input[type="range"]::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

/* Focus styling: */
input[type="range"]:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Track fill (WebKit only — Firefox fills automatically): */
input[type="range"]::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
}
```

---

### 11. Architectural Debt & Scaling

#### Dead CSS Elimination

**Symptom:** CSS file is 500KB but only 30% is used.

**Tools and techniques:**

```bash
# PurgeCSS — scans HTML/JSX for used classes, removes unused CSS
# Works great with Tailwind and utility-first CSS
npx purgecss --css ./styles.css --content ./src/**/*.tsx

# Chrome DevTools Coverage tab:
# 1. Open DevTools → Ctrl+Shift+P → "Coverage"
# 2. Click record → navigate the site
# 3. See per-file used vs unused CSS bytes

# UnCSS — removes unused selectors by running the site in a headless browser
npx uncss http://localhost:3000 > clean.css
```

**Prevention strategy:**

```css
/* Use CSS Modules — dead code elimination is automatic */
/* components/Card.module.css → only imports what's used */

/* Or use @layer to keep third-party CSS from bloating: */
@import url("framework.css") layer(vendor);
/* Easy to remove the entire layer later */
```

#### The Global Scope Nightmare

**Symptom:** Changing `.btn` in one component breaks forms across the entire app.

```css
/* Solutions by specificity (least to most aggressive): */

/* 1. BEM naming — scope by convention */
.login-form__btn { }
.card__btn { }

/* 2. CSS Modules — scope by tooling */
/* Card.module.css → .btn compiles to .Card_btn_x7k2 */

/* 3. @scope — scope by CSS spec */
@scope (.login-form) {
  .btn { background: teal; }
}
@scope (.card) {
  .btn { background: purple; }
}

/* 4. Shadow DOM — true encapsulation (Web Components) */
/* Styles inside shadow DOM cannot leak out or be affected by outside styles */

/* 5. @layer — scope by cascade priority */
@layer vendor, base, components;
@layer components {
  .btn { /* Only competes with other component-layer styles */ }
}
```

#### Multi-Column Layout Gaps

**Symptom:** CSS Multi-Column Layout has inconsistent behavior, columns can't be individually targeted.

```css
/* Basic multi-column layout: */
.multi-col {
  column-count: 3;
  column-gap: 32px;
  column-rule: 1px solid var(--color-border);
}

/* Prevent elements from breaking across columns: */
.multi-col .card {
  break-inside: avoid;
  margin-bottom: 16px;
}

/* For equal-height column control, prefer Grid instead: */
.modern-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}

/* For masonry-like layouts, Grid masonry is experimental.
   Fall back to multi-column for now: */
.masonry {
  column-count: 3;
  column-gap: 16px;
}
.masonry > * {
  break-inside: avoid;
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .masonry { column-count: 2; }
}
@media (max-width: 480px) {
  .masonry { column-count: 1; }
}
```

---

## Appendix: The Responsive Checklist

A quick reference for ensuring your CSS works across all screen sizes (desktop-first approach):

```css
/* 1. Universal box-sizing reset */
*, *::before, *::after { box-sizing: border-box; }

/* 2. Fluid containers — never overflow */
.container {
  width: min(1200px, 100% - 32px);
  margin-inline: auto;
}

/* 3. Responsive images — never wider than parent */
img, video, svg { max-width: 100%; height: auto; }

/* 4. Modern viewport units for full-height elements */
.full-height { height: 100dvh; }

/* 5. Fluid typography */
h1 { font-size: clamp(1.75rem, 1.2rem + 2.5vw, 3rem); }

/* 6. Touch-friendly targets on coarse pointers */
@media (pointer: coarse) {
  button, a { min-height: 44px; min-width: 44px; }
}

/* 7. Disable hover effects on touch devices */
@media (hover: hover) {
  .card:hover { transform: translateY(-4px); }
}

/* 8. Intrinsic grid — adapts without breakpoints */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: clamp(16px, 2vw, 32px);
}

/* 9. Flex items that wrap gracefully */
.flex-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.flex-row > * { flex: 1 1 280px; max-width: 100%; }

/* 10. Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---
---

## Design Theory — The Science Behind the CSS

> Code is the implementation. These theories are the **why** behind every design decision. A CSS specialist who doesn't understand design theory writes technically correct but visually broken interfaces.

---

### 1. Gestalt Principles — How the Brain Sees Your Layout

Gestalt psychology (German: "unified whole") explains how the human brain automatically organizes visual input into groups, patterns, and structures. These principles are not opinions — they are how human perception actually works, confirmed by over a century of cognitive research.

#### 1.1 Proximity

**Principle:** Elements that are **close together** are perceived as a group. Elements far apart are perceived as separate.

This is the single most important layout principle. It's why `gap` and `margin` exist — they define relationships.

```css
/* BAD: Equal spacing everywhere — brain can't tell what's grouped */
.form-field { margin-bottom: 24px; }
.form-label { margin-bottom: 24px; }
/* Label and its input look as related to each other as to the previous field */

/* GOOD: Tight spacing within groups, loose spacing between groups */
.form-label {
  margin-bottom: 4px;   /* Tight: label clearly belongs to the input below */
}
.form-field {
  margin-bottom: 24px;  /* Loose: separates this field from the next group */
}

/* The ratio matters more than the absolute values.
   Internal spacing should be ≤ 50% of external spacing.
   Here: 4px internal / 24px external = 17% — very clear grouping. */
```

**CSS implementation pattern — the "Internal ≤ External" rule:**

```css
.card {
  padding: 24px;         /* Internal space: content within the card */
  gap: 12px;             /* Space between child elements (internal) */
}

.card-grid {
  gap: 32px;             /* External space: between cards */
  /* 12px (internal gap) < 32px (external gap) → cards feel like separate units */
}
```

**Real-world application — Navigation grouping:**

```css
.nav {
  display: flex;
  align-items: center;
  gap: 8px;          /* Tight: links within a group */
}

.nav-group + .nav-group {
  margin-left: 24px; /* Loose: between groups (e.g., "Products | Resources" vs "Login | Signup") */
}

/* On mobile, proximity still applies — stack with clear grouping: */
@media (max-width: 768px) {
  .nav {
    flex-direction: column;
    gap: 4px;
  }
  .nav-group + .nav-group {
    margin-left: 0;
    margin-top: 16px;  /* Visual separator between groups */
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
  }
}
```

#### 1.2 Similarity

**Principle:** Elements that **look alike** (shape, color, size, orientation) are perceived as belonging to the same group or having the same function.

```css
/* All primary actions share the same visual treatment: */
.btn-primary {
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-weight: 600;
}

/* All destructive actions share a different treatment: */
.btn-danger {
  background: var(--color-danger);
  color: white;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-weight: 600;
}

/* Users instantly know: blue = safe action, red = dangerous action.
   They don't need to read the labels. */

/* Similarity in status indicators: */
.badge-success { background: oklch(0.85 0.15 150); color: oklch(0.3 0.15 150); }
.badge-warning { background: oklch(0.9 0.15 80);   color: oklch(0.35 0.15 80); }
.badge-error   { background: oklch(0.88 0.15 25);  color: oklch(0.35 0.15 25); }
/* Same shape + padding + border-radius, but different color → "status" family */
```

#### 1.3 Continuity

**Principle:** The eye follows lines, curves, and sequences. Elements aligned on a continuous path are perceived as related.

```css
/* Left-aligned labels create a continuous reading line (the F-pattern) */
.form {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.form label {
  text-align: left; /* Creates a vertical reading line on the left edge */
}

/* Breadcrumb navigation uses continuity — the separator guides the eye: */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
}
.breadcrumb-item + .breadcrumb-item::before {
  content: "/";
  color: var(--color-text-muted);
  /* The "/" creates a visual continuation: Home / Products / Details */
}

/* Step indicators use continuity through a connecting line: */
.stepper {
  display: flex;
  align-items: center;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step + .step::before {
  content: "";
  width: 40px;
  height: 2px;
  background: var(--color-border);
  /* Line connects steps → user perceives a sequence */
}
.step.completed + .step::before {
  background: var(--color-primary);
}
```

#### 1.4 Closure

**Principle:** The brain completes incomplete shapes. You don't need to draw a full boundary — suggestion is enough.

```css
/* Card without a full border — shadow implies the boundary: */
.card {
  /* No border at all — the shadow "closes" the shape */
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  border-radius: 12px;
  padding: 24px;
  background: white;
}

/* Partial underlines suggest a clickable element: */
.link-underline {
  text-decoration: none;
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 100% 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  /* Just a bottom line — brain "closes" it as an interactive element */
}

/* Cropped images suggest more content beyond the viewport: */
.carousel {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-right: 20%;  /* Shows partial next card → user knows to scroll */
}
.carousel-item {
  flex: 0 0 80%;
  scroll-snap-align: start;
}
```

#### 1.5 Figure/Ground

**Principle:** The brain separates what it's looking at into foreground (figure) and background (ground). Strong contrast between the two makes the figure "pop."

```css
/* Modal overlay — strong figure/ground separation: */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5); /* Ground: dimmed background */
  display: grid;
  place-items: center;
  z-index: var(--z-overlay);
}

.modal {
  background: white;              /* Figure: bright, focused */
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2); /* Elevation reinforces separation */
  max-width: min(500px, 100% - 32px);
  max-height: 90dvh;
  overflow-y: auto;
}

/* Toast notification — figure stands out from page ground: */
.toast {
  background: var(--color-surface-elevated);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  padding: 12px 20px;
  /* Strong shadow = high elevation = clear figure/ground */
}
```

#### 1.6 Common Fate

**Principle:** Elements that **move together** or **change together** are perceived as a group.

```css
/* Hover on a card → all internal elements respond together: */
.card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}
/* The entire card (image, title, text, button) moves as one unit = one group */

/* Staggered animation that breaks common fate (intentional separation): */
.card:hover .card-image  { transform: scale(1.02); }
.card:hover .card-title  { color: var(--color-primary); }
/* Image and title change differently → perceived as separate elements within the card */
```

---

### 2. Visual Hierarchy — Controlling What Gets Seen First

Visual hierarchy determines the order in which the eye processes information. Without hierarchy, everything competes for attention and nothing wins.

**The hierarchy tools (in order of visual weight):**

| Tool | Weight | CSS Properties |
|------|--------|----------------|
| Size | Highest | `font-size`, `width`, `height`, `scale` |
| Color/Contrast | High | `color`, `background`, `opacity` |
| Position | High | `order`, `grid-area`, `position` |
| Weight/Style | Medium | `font-weight`, `font-style`, `text-transform` |
| Whitespace | Medium | `margin`, `padding`, `gap` |
| Typography | Medium | `font-family`, `letter-spacing` |
| Decoration | Lower | `border`, `box-shadow`, `underline` |

```css
/* Establishing clear hierarchy on a landing page: */
.hero-title {
  font-size: clamp(2.5rem, 2rem + 3vw, 4.5rem); /* Largest = first to be seen */
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;          /* Tight tracking for display text */
  color: var(--color-text);
}

.hero-subtitle {
  font-size: clamp(1.125rem, 1rem + 0.5vw, 1.375rem); /* Smaller = second */
  font-weight: 400;
  line-height: 1.6;
  color: var(--color-text-muted);   /* Lower contrast = lower priority */
  max-width: 60ch;                   /* Readable line length */
}

.hero-cta {
  font-size: 1rem;
  font-weight: 600;
  padding: 14px 28px;
  background: var(--color-primary); /* High contrast color = draws eye third */
  color: white;
  border-radius: var(--radius-md);
}

.hero-secondary-link {
  font-size: 0.875rem;
  color: var(--color-text-muted);   /* Lowest contrast = last priority */
  text-decoration: underline;
}
```

**Real-world problem solved — everything looks the same priority:**

```css
/* BAD: Flat hierarchy — user doesn't know where to look */
.dashboard-card h3 { font-size: 1rem; font-weight: 600; color: #333; }
.dashboard-card p  { font-size: 1rem; font-weight: 400; color: #333; }
.dashboard-card .value { font-size: 1rem; font-weight: 400; color: #333; }

/* GOOD: Clear hierarchy — the value is the hero */
.dashboard-card .label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.dashboard-card .value {
  font-size: clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem);
  font-weight: 700;
  color: var(--color-text);
}
.dashboard-card .change {
  font-size: 0.875rem;
  font-weight: 500;
  color: oklch(0.55 0.2 150); /* Green for positive */
}
```

---

### 3. Reading Patterns — F-Pattern & Z-Pattern

Eye-tracking studies (NNGroup, 2006–2025) show that 79% of users scan web pages in predictable patterns.

#### 3.1 The F-Pattern

**Used for:** Text-heavy pages (articles, search results, dashboards, documentation).

```
┌─────────────────────────────────────────────┐
│ ████████████████████████████████             │ ← First horizontal scan
│ ████████████████████                         │
│                                             │
│ ████████████████                             │ ← Second horizontal scan
│ ██████████████                               │
│                                             │
│ █                                           │ ← Vertical scan down left edge
│ █                                           │
│ █                                           │
│ █                                           │
└─────────────────────────────────────────────┘
```

**CSS implementation:**

```css
/* Place critical information where the F-pattern expects it: */

/* 1. Top-left: Most important content (logo, main heading) */
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.page-header .logo { order: 0; } /* Leftmost position */

/* 2. Left-aligned labels and content — follow the vertical stem of the F */
.content {
  text-align: left;       /* Never center-align body text */
  max-width: 65ch;         /* Optimal reading width: 45-75 characters */
}

/* 3. Front-load important words in headings and list items: */
/* BAD:  "Learn about the features of our product" */
/* GOOD: "Product Features: AI-powered analytics, real-time sync..." */
/* The eye scans the first 2-3 words per line, then skips ahead */

/* 4. Use bolding and color to create "scan points" on the left edge: */
.feature-item::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  margin-right: 12px;
  /* Left-edge visual marker = F-pattern scan point */
}
```

#### 3.2 The Z-Pattern

**Used for:** Landing pages, marketing pages, sparse layouts with less text.

```
┌─────────────────────────────────────────────┐
│ ██████ ─────────────────────────── ██████    │ ← Top: left to right
│         ╲                                   │
│           ╲                                 │ ← Diagonal scan
│             ╲                               │
│ ██████ ─────────────────────────── ██████    │ ← Bottom: left to right
└─────────────────────────────────────────────┘
```

```css
/* Z-pattern landing page layout: */
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    "logo     nav"      /* Top: logo (left) → navigation (right) */
    "headline image"    /* Diagonal: eye scans from headline to image */
    "cta      social";  /* Bottom: CTA (left) → social proof (right) */
  align-items: center;
  min-height: 100dvh;
  padding: clamp(16px, 4vw, 64px);
}

.hero-logo     { grid-area: logo; }
.hero-nav      { grid-area: nav; justify-self: end; }
.hero-headline { grid-area: headline; }
.hero-image    { grid-area: image; }
.hero-cta      { grid-area: cta; }
.hero-social   { grid-area: social; justify-self: end; }

@media (max-width: 768px) {
  .hero {
    grid-template-columns: 1fr;
    grid-template-areas:
      "logo"
      "headline"
      "image"
      "cta"
      "social";
    text-align: center;
  }
}
```

---

### 4. Typography Theory — Modular Scales & Vertical Rhythm

#### 4.1 The Modular Type Scale

A modular scale generates font sizes from a base size multiplied by a consistent ratio. This creates **mathematical harmony** between type sizes.

**Common ratios and their character:**

| Ratio | Name | Value | Character |
|-------|------|-------|-----------|
| Minor Second | 1.067 | Subtle, barely noticeable | Very tight hierarchy |
| Major Second | 1.125 | Gentle, smooth | Body text, documentation |
| Minor Third | 1.200 | Balanced, readable | **Most popular for web** |
| Major Third | 1.250 | Clear, confident | Marketing, SaaS dashboards |
| Perfect Fourth | 1.333 | Strong, dramatic | Landing pages, editorial |
| Golden Ratio | 1.618 | Grand, high contrast | Display typography |

```css
/* Minor Third scale (1.200) — the web's workhorse */
:root {
  --scale-ratio: 1.2;
  --text-base: 1rem;                                          /* 16px */
  --text-sm:   calc(var(--text-base) / var(--scale-ratio));   /* 13.3px */
  --text-xs:   calc(var(--text-sm) / var(--scale-ratio));     /* 11.1px */
  --text-lg:   calc(var(--text-base) * var(--scale-ratio));   /* 19.2px */
  --text-xl:   calc(var(--text-lg) * var(--scale-ratio));     /* 23px   */
  --text-2xl:  calc(var(--text-xl) * var(--scale-ratio));     /* 27.6px */
  --text-3xl:  calc(var(--text-2xl) * var(--scale-ratio));    /* 33.2px */
  --text-4xl:  calc(var(--text-3xl) * var(--scale-ratio));    /* 39.8px */
}

body { font-size: var(--text-base); }
h1   { font-size: var(--text-4xl); }
h2   { font-size: var(--text-3xl); }
h3   { font-size: var(--text-2xl); }
h4   { font-size: var(--text-xl); }
small { font-size: var(--text-sm); }
```

**Responsive scale — use a tighter ratio on mobile:**

```css
:root {
  --scale-ratio: 1.25;  /* Major Third on desktop — dramatic */
}

@media (max-width: 768px) {
  :root {
    --scale-ratio: 1.15; /* Tighter on mobile — less extreme jumps */
  }
}
/* All font sizes automatically adjust because they're calculated from the ratio */
```

#### 4.2 Vertical Rhythm

Vertical rhythm means all spacing aligns to a baseline grid, creating a sense of order.

```css
:root {
  --baseline: 8px;  /* Every spacing value is a multiple of 8 */
}

body {
  font-size: 16px;
  line-height: calc(var(--baseline) * 3); /* 24px — 3 baseline units */
}

h1 {
  font-size: 2.5rem;
  line-height: calc(var(--baseline) * 6); /* 48px */
  margin-bottom: calc(var(--baseline) * 3); /* 24px */
}

h2 {
  font-size: 2rem;
  line-height: calc(var(--baseline) * 5); /* 40px */
  margin-bottom: calc(var(--baseline) * 2); /* 16px */
}

p {
  margin-bottom: calc(var(--baseline) * 3); /* 24px — same as line-height */
}

/* Every text block's total height (content + margin) is a multiple of 24px,
   so parallel columns of text stay aligned across the page. */
```

---

### 5. The 8-Point Grid Spacing System

The 8pt grid is the most widely adopted spacing system in modern UI design. Material Design, IBM Carbon, Atlassian, Shopify Polaris, and Apple's HIG all use it.

**Why 8?** It divides cleanly into common screen sizes (320, 375, 768, 1024, 1440), scales well across pixel densities (8 × 1.5 = 12, 8 × 2 = 16 — always whole pixels on 1.5x and 2x screens), and provides enough granularity without being overwhelming.

```css
:root {
  /* The 8pt spacing scale */
  --space-0:  0;
  --space-1:  4px;     /* half-step for micro adjustments */
  --space-2:  8px;     /* base unit */
  --space-3:  12px;    /* 1.5× */
  --space-4:  16px;    /* 2× */
  --space-5:  20px;    /* 2.5× */
  --space-6:  24px;    /* 3× */
  --space-8:  32px;    /* 4× */
  --space-10: 40px;    /* 5× */
  --space-12: 48px;    /* 6× */
  --space-16: 64px;    /* 8× */
  --space-20: 80px;    /* 10× */
  --space-24: 96px;    /* 12× */
}

/* Apply consistently: */
.card {
  padding: var(--space-6);           /* 24px */
  gap: var(--space-4);               /* 16px */
  border-radius: var(--space-3);     /* 12px */
}

.section {
  padding-block: var(--space-16);    /* 64px */
}

.page-container {
  padding-inline: var(--space-6);    /* 24px */
  max-width: 1200px;
  margin-inline: auto;
}
```

**The Internal ≤ External rule (from spacing best practices):**

```css
/* Internal padding ≤ External gap between elements */

.card {
  padding: 24px;     /* Internal spacing */
}
.card-grid {
  gap: 32px;          /* External spacing */
  /* 24px (internal) < 32px (external) → cards are perceived as separate */
}

/* Within the card, child spacing is even tighter: */
.card-content {
  gap: 8px;           /* Much tighter than card padding */
}
/* Hierarchy: 8px (child gap) < 24px (card padding) < 32px (grid gap) */
```

**Responsive spacing scale with `clamp()`:**

```css
:root {
  --space-section: clamp(40px, 5vw + 16px, 96px);
  --space-block:   clamp(24px, 3vw + 8px, 48px);
  --space-element: clamp(12px, 1.5vw + 4px, 24px);
  --space-inline:  clamp(8px, 1vw + 4px, 16px);
}
```

---

### 6. Color Theory for the Web

#### 6.1 The 60-30-10 Rule

The most reliable color distribution system, borrowed from interior design and used by virtually every major design system:

- **60% — Dominant color:** Background, large surfaces. Neutral, calming.
- **30% — Secondary color:** Cards, sections, secondary backgrounds. Supports the dominant.
- **10% — Accent color:** CTAs, highlights, active states. Draws attention.

```css
:root {
  /* 60% — Dominant (backgrounds, page surface) */
  --color-dominant:   oklch(0.98 0.005 250);   /* near-white, subtle blue tint */

  /* 30% — Secondary (cards, elevated surfaces, nav) */
  --color-secondary:  oklch(1 0 0);             /* pure white cards on tinted bg */
  --color-secondary-alt: oklch(0.95 0.01 250);  /* alternate section bg */

  /* 10% — Accent (buttons, links, focus rings, badges) */
  --color-accent:     oklch(0.55 0.25 250);     /* vivid blue */
  --color-accent-hover: oklch(0.45 0.25 250);
}

body {
  background: var(--color-dominant);  /* 60% */
  color: var(--color-text);
}

.card {
  background: var(--color-secondary); /* 30% */
}

.btn-primary {
  background: var(--color-accent);    /* 10% */
  color: white;
}
```

**Dark mode 60-30-10:**

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-dominant:    oklch(0.13 0.02 250);   /* dark surface */
    --color-secondary:   oklch(0.18 0.02 250);   /* slightly elevated */
    --color-accent:      oklch(0.7 0.2 250);     /* brighter accent for dark bg */
  }
}
```

#### 6.2 WCAG Contrast Requirements

```css
/* WCAG AA (minimum — required by law in many jurisdictions): */
/* Normal text: 4.5:1 contrast ratio */
/* Large text (18px+ bold, or 24px+ normal): 3:1 contrast ratio */
/* UI components and graphical objects: 3:1 */

/* WCAG AAA (enhanced — recommended): */
/* Normal text: 7:1 */
/* Large text: 4.5:1 */

/* Safe text color combinations: */
.safe-on-white {
  color: oklch(0.35 0 0);       /* ~7:1 on white — passes AAA */
}
.safe-on-dark {
  color: oklch(0.88 0 0);       /* ~7:1 on #1a1a2e — passes AAA */
}

/* Muted text (still accessible): */
.muted-on-white {
  color: oklch(0.55 0 0);       /* ~4.6:1 on white — passes AA for normal text */
}

/* NEVER use pure gray on colored backgrounds without checking contrast.
   Use a tool: https://webaim.org/resources/contrastchecker/ */
```

---

### 7. Layout Theory — Golden Ratio, Rule of Thirds & Grid Systems

#### 7.1 The Golden Ratio (φ ≈ 1.618)

The golden ratio creates proportions that feel naturally "right." It defines a split of approximately **62% / 38%**.

```css
/* Sidebar + Content layout using golden ratio: */
.golden-layout {
  display: grid;
  grid-template-columns: 1fr 1.618fr;  /* 38.2% / 61.8% */
  gap: 32px;
}

/* Or reversed (content-first): */
.golden-layout-reversed {
  display: grid;
  grid-template-columns: 1.618fr 1fr;  /* 61.8% / 38.2% */
  gap: 32px;
}

@media (max-width: 768px) {
  .golden-layout,
  .golden-layout-reversed {
    grid-template-columns: 1fr; /* Stack on mobile */
  }
}

/* Golden ratio in typography (line-height): */
p {
  font-size: 1rem;
  line-height: 1.618; /* Golden ratio line-height — extremely readable */
}
```

#### 7.2 The Rule of Thirds

A simplified golden ratio: divide the canvas into a 3×3 grid. Place key elements at the **intersections** of the grid lines.

```css
/* Hero section — key content at rule-of-thirds intersections: */
.hero {
  display: grid;
  grid-template-columns: 1fr 2fr;  /* 33% / 66% — rule of thirds */
  grid-template-rows: 1fr 2fr;     /* 33% / 66% */
  min-height: 100dvh;
  align-items: center;
}

/* Place the CTA near the bottom-left intersection (power point): */
.hero-content {
  grid-column: 1;
  grid-row: 2;
  padding: clamp(24px, 5vw, 64px);
}

/* Place the image in the larger two-thirds area: */
.hero-image {
  grid-column: 2;
  grid-row: 1 / -1;
}
```

#### 7.3 Modern Grid Systems

The 12-column grid remains the industry standard (Bootstrap, Material, Foundation). It's popular because 12 divides by 1, 2, 3, 4, 6, and 12 — extreme flexibility.

```css
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-6);
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: var(--space-4);
}

/* Spanning columns: */
.full-width  { grid-column: span 12; }
.two-thirds  { grid-column: span 8; }
.one-third   { grid-column: span 4; }
.half        { grid-column: span 6; }
.quarter     { grid-column: span 3; }

/* Responsive column collapsing: */
@media (max-width: 768px) {
  .grid-12 {
    grid-template-columns: repeat(4, 1fr); /* 4-column on tablet */
  }
  .two-thirds, .one-third, .half {
    grid-column: span 4; /* Full width on tablet */
  }
}

@media (max-width: 480px) {
  .grid-12 {
    grid-template-columns: 1fr; /* Single column on mobile */
  }
  .two-thirds, .one-third, .half, .quarter {
    grid-column: span 1;
  }
}
```

---

### 8. UX Laws — The Science of Interaction

These laws are not guidelines — they are cognitive science findings about how humans interact with interfaces.

#### 8.1 Fitts's Law

**"The time to reach a target is a function of the distance to and size of the target."**

**Translation:** Make buttons bigger and closer to where the cursor/finger already is.

```css
/* GOOD: Large touch targets */
.btn {
  min-height: 44px;    /* WCAG 2.5.8 minimum */
  min-width: 44px;
  padding: 12px 24px;
}

/* BETTER: Adaptive touch targets for pointer type */
@media (pointer: coarse) {
  .btn {
    min-height: 48px;  /* Larger for fingers */
    padding: 14px 28px;
  }
}

@media (pointer: fine) {
  .btn {
    min-height: 36px;  /* Slightly smaller for mouse — precision is fine */
    padding: 8px 16px;
  }
}

/* Position important actions near the user's likely cursor position: */
/* For forms: submit button near the last input field, not far away */
.form-actions {
  display: flex;
  justify-content: flex-end; /* Right-aligned = near the Tab key's next position */
  gap: 12px;
  margin-top: var(--space-6);
}

/* For mobile: bottom sheet actions near the thumb zone */
@media (max-width: 640px) {
  .form-actions {
    position: sticky;
    bottom: 0;
    padding: 16px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }
}
```

#### 8.2 Hick's Law

**"The time to make a decision increases with the number and complexity of choices."**

**Translation:** Fewer options = faster decisions. Use progressive disclosure.

```css
/* BAD: 15 navigation items visible at once */
.nav { display: flex; gap: 4px; }

/* GOOD: Group into categories, reveal on interaction */
.nav {
  display: flex;
  gap: 24px;
}
.nav-group {
  position: relative;
}
.nav-group-title {
  padding: 8px 12px;
  cursor: pointer;
}
.nav-group-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  background: white;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  border-radius: 8px;
  padding: 8px;
  min-width: 200px;
}
.nav-group:hover .nav-group-dropdown,
.nav-group:focus-within .nav-group-dropdown {
  display: block;
}

/* Progressive disclosure: show 3 items, hide the rest */
.feature-list > :nth-child(n + 4) {
  display: none;
}
.feature-list.expanded > :nth-child(n + 4) {
  display: list-item;
}
```

#### 8.3 Miller's Law (7 ± 2)

**"The average person can hold 7 ± 2 items in working memory."**

**Translation:** Chunk information into groups of 5–9 items max.

```css
/* Chunking a long form into sections: */
.form-section {
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-8);
}

.form-section-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

/* Navigation: max 7 top-level items */
.main-nav {
  display: flex;
  gap: 8px;
}
/* If more than 7 items are needed, use a "More" dropdown or group sub-items */

/* Dashboard: group related metrics into cards of 3–5 values each */
.metric-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: var(--space-4);
}
/* Each card shows 1 primary metric + 2-3 supporting details = 3-4 items per chunk */
```

#### 8.4 Jakob's Law

**"Users spend most of their time on OTHER sites. They prefer your site to work the same way."**

**Translation:** Don't reinvent common patterns. Logo top-left. Search top-right. Cart icon with badge. Navigation horizontal on desktop, hamburger on mobile.

```css
/* Standard page layout that users expect: */
.page {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
}

/* Header: logo left, nav center/right, actions far right */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.header-logo { order: 0; }
.header-nav  { order: 1; }
.header-actions { order: 2; display: flex; gap: 8px; }

/* Mobile: hamburger menu (users expect it top-left or top-right) */
@media (max-width: 768px) {
  .header-nav { display: none; }
  .header-hamburger { display: block; }
}

/* Shopping cart badge (universal pattern): */
.cart-icon {
  position: relative;
}
.cart-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--color-danger);
  color: white;
  font-size: 0.6875rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  padding: 0 4px;
}
```

---

### 9. Whitespace Theory — The Power of Nothing

Whitespace (negative space) is not "empty" — it's an active design element. It separates, groups, emphasizes, and creates breathing room. Research shows increasing whitespace between lines of text improves reading speed by **up to 20%**.

**Two types:**

- **Micro whitespace:** Space between lines of text, between icons and labels, between letters. Controlled by `line-height`, `letter-spacing`, `gap`, small `padding`.
- **Macro whitespace:** Space between sections, between content blocks, around the page edges. Controlled by `margin`, `padding`, large `gap`.

```css
/* Micro whitespace — readable body text: */
body {
  line-height: 1.6;         /* 60% more space between lines than font size */
  letter-spacing: 0.01em;   /* Barely perceptible, improves readability */
  word-spacing: 0.05em;
}

/* Macro whitespace — sections that breathe: */
.section {
  padding-block: clamp(48px, 8vw, 128px);  /* Generous vertical breathing room */
}

.section-title {
  margin-bottom: clamp(24px, 4vw, 48px);   /* Space below heading before content */
}

/* The "luxury" spacing pattern — expensive brands use generous whitespace: */
.luxury-hero {
  padding: clamp(64px, 10vw, 200px) clamp(24px, 5vw, 100px);
  /* Enormous whitespace signals premium quality */
}

/* The "dense" spacing pattern — dashboards maximize information density: */
.dashboard-card {
  padding: 12px 16px;
  gap: 4px;
  /* Tight but still readable — every pixel carries data */
}
```

**Real-world problem solved — page feels "cramped" but you can't explain why:**

```css
/* Usually the fix is increasing macro whitespace, not changing content: */

/* Before: */
.section { padding: 24px; }
.section + .section { margin-top: 16px; }

/* After: */
.section { padding: clamp(40px, 6vw, 80px) clamp(16px, 4vw, 32px); }
.section + .section { margin-top: 0; } /* Padding handles it */
/* The content is identical — only the whitespace changed — but the page feels professional */
```

---

### 10. Dieter Rams' 10 Principles — Applied to CSS

Dieter Rams (Braun's legendary industrial designer) defined principles that Apple, Google, and every major design system follow. Here's how each applies to web CSS:

| # | Principle | CSS Application |
|---|-----------|-----------------|
| 1 | **Innovative** | Use modern CSS (container queries, scroll-driven animations, `@layer`) instead of JS hacks |
| 2 | **Useful** | Every property serves the user. Decorative CSS that slows loading is not useful |
| 3 | **Aesthetic** | Consistent spacing (8pt grid), harmonious color (OKLCH), proportional type (modular scale) |
| 4 | **Understandable** | Visual hierarchy makes interfaces self-explanatory. Users shouldn't need instructions |
| 5 | **Unobtrusive** | CSS should be invisible — the user notices the content, not the styling |
| 6 | **Honest** | Don't fake depth with excessive shadows. Don't use animations to hide slow loading |
| 7 | **Long-lasting** | Use design tokens and semantic variables — not hard-coded hex values that can't evolve |
| 8 | **Thorough** | Every state is styled: hover, focus, active, disabled, loading, empty, error |
| 9 | **Environmentally friendly** | Minimize CSS payload, use `content-visibility`, reduce paint operations |
| 10 | **As little design as possible** | Remove anything that doesn't serve a purpose. Fewer properties = cleaner code |

**Principle 8 in practice — thorough state coverage:**

```css
.btn {
  /* Default state */
  background: var(--color-primary);
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

/* Hover (mouse users only) */
@media (hover: hover) {
  .btn:hover {
    background: var(--color-primary-hover);
  }
}

/* Focus (keyboard navigation) */
.btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Active (pressed) */
.btn:active {
  transform: scale(0.98);
}

/* Disabled */
.btn:disabled,
.btn[aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Loading */
.btn[data-loading="true"] {
  color: transparent;
  pointer-events: none;
  position: relative;
}
.btn[data-loading="true"]::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 20px;
  height: 20px;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Summary: Which Theory for Which Problem

| Problem | Primary Theory | CSS Tools |
|---------|---------------|-----------|
| "Users can't find the CTA" | Visual Hierarchy + F/Z Pattern | `font-size`, `color`, `position`, `grid-area` |
| "Page feels cluttered" | Whitespace + Proximity | `padding`, `gap`, `margin`, spacing scale |
| "Navigation is confusing" | Miller's Law + Hick's Law | Progressive disclosure, grouping, `display: none` |
| "Colors look off in dark mode" | Color Theory + 60-30-10 | OKLCH, `color-mix()`, semantic tokens |
| "Layout feels 'wrong' but works technically" | Golden Ratio + Rule of Thirds | `grid-template-columns: 1fr 1.618fr`, alignment |
| "Buttons are hard to tap on mobile" | Fitts's Law | `min-height: 44px`, `@media (pointer: coarse)` |
| "Users are confused by the interface" | Jakob's Law + Similarity | Follow platform conventions, consistent styling |
| "Cards in a grid look unrelated" | Gestalt Proximity + Common Fate | `gap` scale, shared hover transitions |
| "Type sizes feel random" | Modular Scale + Vertical Rhythm | Scale ratio, `line-height` baseline, `clamp()` |
| "The site feels cheap / amateur" | Rams #3, #5, #10 + Whitespace | Generous spacing, restrained color, minimal decoration |
