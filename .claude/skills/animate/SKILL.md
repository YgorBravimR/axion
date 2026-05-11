---
name: animate
description: Review a feature and enhance it with purposeful animations, micro-interactions, and motion effects that improve usability and delight. Uses Motion library (formerly Framer Motion) as the primary tool, with CSS for simpler cases.
user-invocable: true
args:
  - name: target
    description: The feature or component to animate (optional)
    required: false
scope: global
depends: [frontend-design, teach-impeccable]
tokens: 2120
---

Analyze a feature and strategically add animations and micro-interactions that enhance understanding, provide feedback, and create delight.

## MANDATORY PREPARATION

Use the frontend-design skill — it contains design principles, anti-patterns, and the **Context Gathering Protocol**. Follow the protocol before proceeding — if no design context exists yet, you MUST run teach-impeccable first. Additionally gather: performance constraints.

**Reference guide**: Read `animation/react-animation-deep-guide.md` at the project root — it is the authoritative source for all Motion library patterns, Next.js integration, common bugs/fixes, and advanced recipes used in this codebase.

---

## Assess Animation Opportunities

Analyze where motion would improve the experience:

1. **Identify static areas**:
   - **Missing feedback**: Actions without visual acknowledgment (button clicks, form submission, etc.)
   - **Jarring transitions**: Instant state changes that feel abrupt (show/hide, page loads, route changes)
   - **Unclear relationships**: Spatial or hierarchical relationships that aren't obvious
   - **Lack of delight**: Functional but joyless interactions
   - **Missed guidance**: Opportunities to direct attention or explain behavior

2. **Understand the context**:
   - What's the personality? (Playful vs serious, energetic vs calm)
   - What's the performance budget? (Mobile-first? Complex page?)
   - Who's the audience? (Motion-sensitive users? Power users who want speed?)
   - What matters most? (One hero animation vs many micro-interactions?)

If any of these are unclear from the codebase, STOP and call the AskUserQuestion tool to clarify.

**CRITICAL**: Respect `prefers-reduced-motion`. Always provide non-animated alternatives for users who need them. Vestibular disorders affect ~35% of adults over 40.

## Plan Animation Strategy

Create a purposeful animation plan:

- **Hero moment**: What's the ONE signature animation? (Page load? Hero section? Key interaction?)
- **Feedback layer**: Which interactions need acknowledgment?
- **Transition layer**: Which state changes need smoothing?
- **Delight layer**: Where can we surprise and delight?

**IMPORTANT**: One well-orchestrated experience beats scattered animations everywhere. Focus on high-impact moments.

## Choose the Right Tool

Decide between CSS and Motion for each animation:

### Use CSS transitions/keyframes when:

- Simple hover/focus state changes
- Single-property transitions (color, opacity, transform)
- Declarative, non-interactive animations
- Performance-critical paths where no JS overhead is acceptable

### Use Motion library when:

- Exit animations needed (`AnimatePresence`)
- Layout animations (element reflow, shared element transitions via `layoutId`)
- Gesture-driven animations (`whileHover`, `whileTap`, `whileDrag`)
- Scroll-linked animations (`useScroll` + `useTransform`)
- Complex orchestration (staggered children, sequenced timelines)
- Spring physics for natural-feeling motion
- Programmatic control (`useAnimate`, `useMotionValue`)

### Motion Import Paths (CRITICAL for Next.js)

```tsx
// Client Components (standard React)
import { motion, AnimatePresence } from "motion/react"

// React Server Components (Next.js App Router)
import { motion } from "motion/react-client"

// NEVER use the legacy import
// import { motion } from "framer-motion"  ← deprecated
```

## Implement Animations

Add motion systematically across these categories:

### Entrance Animations

**Page load choreography** — stagger element reveals:

```tsx
// Parent variant with stagger
const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.1, delayChildren: 0.05 },
	},
}

// Child variant
const itemVariants = {
	hidden: { opacity: 0, y: 20 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", stiffness: 300, damping: 24 },
	},
}
```

**Scroll-triggered reveals** — use `useScroll` with element ref:

```tsx
const ref = useRef(null)
const { scrollYProgress } = useScroll({
	target: ref,
	offset: ["start end", "end start"],
})
const opacity = useTransform(scrollYProgress, [0, 0.3], [0, 1])
const y = useTransform(scrollYProgress, [0, 0.3], [40, 0])
```

**Modal/drawer entry** — AnimatePresence for exit animations:

```tsx
<AnimatePresence mode="wait">
	{isOpen && (
		<motion.div
			key="modal"
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
		/>
	)}
</AnimatePresence>
```

### Micro-interactions

- **Button feedback**: `whileHover={{ scale: 1.03 }}` `whileTap={{ scale: 0.97 }}` with spring transition
- **Form validation**: Shake on error via `x: [0, -8, 8, -4, 4, 0]` keyframe
- **Toggle switches**: `layout` prop for smooth knob repositioning + color transition
- **Like/favorite**: Scale + rotation with spring physics

### State Transitions

- **Show/hide**: Fade + slide via AnimatePresence (200-300ms)
- **Expand/collapse**: Use `grid-template-rows: 0fr → 1fr` for height animation (NOT `height` property)
- **Loading states**: Skeleton screen fades, pulse animations
- **Success/error**: Color transition + icon scale pulse

### Layout Animations

Motion's `layout` prop automatically animates position/size changes:

```tsx
// Shared element transitions between views
<motion.div layoutId="card-header" />

// Auto-animate layout shifts within a container
<motion.div layout transition={{ type: "spring", stiffness: 300, damping: 30 }} />
```

**Common layout animation bugs:**

- Distortion during animation → use `layoutScroll` on scroll containers
- Child elements stretching → add `layout` to children too, or use `layoutId`
- Border radius warping → apply `borderRadius` as inline style, not CSS class

### Navigation & Flow

- **Page transitions**: `AnimatePresence mode="wait"` wrapping route content
- **Tab switching**: `layoutId` on active indicator for smooth slide
- **Scroll effects**: `useScroll` + `useTransform` for parallax, progress bars

### Feedback & Guidance

- **Drag & drop**: `whileDrag={{ scale: 1.05, boxShadow: "..." }}` with `dragConstraints`
- **Copy confirmation**: Brief opacity flash via `useAnimate`
- **Focus flow**: Sequential animations via `stagger()` function

## Technical Implementation

### Timing & Easing

**Durations by purpose (the 100/300/500 rule):**

- **100-150ms**: Instant feedback (button press, toggle)
- **200-300ms**: State changes (hover, menu open)
- **300-500ms**: Layout changes (accordion, modal)
- **500-800ms**: Entrance animations (page load)

**Exit animations are faster than entrances.** Use ~75% of enter duration.

**The 80ms threshold**: Our brains buffer sensory input for ~80ms. Anything under 80ms feels instant. This is your target for micro-interactions.

**Easing curves (use these, not CSS defaults):**

```css
/* Recommended - natural deceleration */
--ease-out-quart: cubic-bezier(
	0.25,
	1,
	0.5,
	1
); /* Smooth, refined (default choice) */
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1); /* Slightly snappier */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1); /* Confident, decisive */

/* AVOID - feel dated and tacky */
/* bounce: cubic-bezier(0.34, 1.56, 0.64, 1); */
/* elastic: cubic-bezier(0.68, -0.6, 0.32, 1.6); */
```

**Spring physics (preferred for Motion):**

```tsx
// Snappy UI response
transition={{ type: "spring", stiffness: 300, damping: 24 }}

// Gentle settle
transition={{ type: "spring", stiffness: 200, damping: 20 }}

// Quick snap
transition={{ type: "spring", stiffness: 500, damping: 30 }}
```

### Performance

- **Only animate `transform` and `opacity`** — everything else triggers layout recalculation
- **Height animations**: Use `grid-template-rows: 0fr → 1fr`, never animate `height` directly
- **`will-change`**: Only when animation is imminent (`:hover`, `.animating`) — never preemptive
- **Scroll animations**: Use `useScroll` (Intersection Observer) not scroll event listeners; unobserve after animating once
- **Scroll jank**: Mouse wheel produces choppy discrete jumps. If scroll-linked animations feel choppy, consider Lenis for smooth scrolling
- **Motion values**: Use `useMotionValue` + `useTransform` for animations that shouldn't trigger React re-renders
- **GPU acceleration**: Motion automatically applies `translateZ(0)` — don't double up

### Accessibility

```tsx
// In Motion components
<motion.div
	initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
	animate={{ opacity: 1, y: 0 }}
/>
```

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

**What to preserve under reduced motion**: Progress bars, loading spinners (slowed), focus indicators — just without spatial movement. Replace slide animations with crossfades.

### Perceived Performance

- **Optimistic UI**: Update immediately, sync later (for low-stakes actions)
- **Skeleton screens**: Fade in content progressively, don't wait for everything
- **Preemptive transitions**: Begin enter animation while data loads
- **Ease-in toward completion**: Makes tasks feel shorter (peak-end effect)

## Common Bugs & Fixes

Consult `animation/react-animation-deep-guide.md` sections 6 and 7 for comprehensive bug reference. Key issues:

| Bug                          | Cause                                                                 | Fix                                                     |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Exit animation not playing   | Missing `AnimatePresence` wrapper or missing `key` prop               | Wrap with `AnimatePresence`, add unique `key`           |
| Layout animation distortion  | Parent has `overflow: hidden` or scroll                               | Add `layoutScroll` to scrolling ancestor                |
| Hydration mismatch (Next.js) | `initial` runs on server, `animate` on client                         | Use `initial={false}` or `motion/react-client`          |
| Stagger not working          | Variants not passed to parent, or missing `variants` prop on children | Ensure parent has `variants` with `staggerChildren`     |
| Spring oscillation           | `damping` too low                                                     | Increase `damping` (24-30 for UI), decrease `stiffness` |

**NEVER**:

- Use bounce or elastic easing curves — they feel dated and draw attention to the animation itself
- Animate layout properties (width, height, top, left) — use transform instead
- Use durations over 500ms for feedback — it feels laggy
- Animate without purpose — every animation needs a reason
- Ignore `prefers-reduced-motion` — this is an accessibility violation
- Animate everything — animation fatigue makes interfaces feel exhausting
- Block interaction during animations unless intentional
- Use `framer-motion` imports — use `motion/react` or `motion/react-client`

## Verify Quality

Test animations thoroughly:

- **Smooth at 60fps**: No jank on target devices
- **Feels natural**: Spring physics or exponential easing, not linear/ease
- **Appropriate timing**: Not too fast (jarring) or too slow (laggy)
- **Reduced motion works**: Animations disabled or simplified appropriately
- **Doesn't block**: Users can interact during/after animations
- **Adds value**: Makes interface clearer or more delightful
- **No hydration errors**: Test SSR/client boundary in Next.js

Remember: Motion should enhance understanding and provide feedback, not just add decoration. Animate with purpose, respect performance constraints, and always consider accessibility. Great animation is invisible — it just makes everything feel right.
