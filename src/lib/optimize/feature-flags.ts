/**
 * OPTIMIZE feature flags.
 *
 * Hand-edited constants for now (no env vars, no runtime config). To
 * flip a flag in dev, change the value here and reload — it's compile-
 * time so there's no UI surface. When Phase C lands and the new flow is
 * the only flow, this file's flags get deleted along with the old code
 * they were guarding.
 */

/**
 * Phase B inline-in-recipe sweep controls for Hawks. When `true`, the
 * optimize page uses `<NumberOrSweep>` / `<BoolOrSweep>` / `<EnumOrSweep>`
 * directly inside the recipe builder; when `false`, the legacy Sweep
 * Parameters tab + hide-on-sweep recipe behavior is used.
 *
 * Default: `false` until Phase B.2–B.4 wire the controls through every
 * Hawks recipe section and the summary panel ships.
 */
const OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED = true

export { OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED }
