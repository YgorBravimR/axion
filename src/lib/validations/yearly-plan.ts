// Zod validation schemas for the yearly plan.
// Lives outside server actions because Zod schemas can't sit in modules
// marked "use server" — those exports must be async functions only.
import { z } from "zod"

const ladderRuleSchema = z.object({
  minContracts: z.number().int().min(1).max(20),
  maxContracts: z.number().int().min(1).max(20),
  multiplier: z.number().int().min(1).max(10),
})

const yearlyPlanSchema = z
  .object({
    year: z.coerce.number().int().min(2020).max(2100),
    initialCapitalCents: z.coerce.number().int().positive().max(100_000_000_00),
    valorPorContratoCents: z.coerce.number().int().positive().default(300000),
    irTaxRate: z.coerce.number().min(0).max(100).default(30),
    tradingDaysPerWeek: z.coerce.number().int().min(1).max(7).default(5),
    ladderRules: z.array(ladderRuleSchema).min(1).max(10),
    exitParcialPts: z.coerce.number().positive().max(100).default(5.0),
    exitFinalPts: z.coerce.number().positive().max(100).default(10.0),
    exitStopPts: z.coerce.number().positive().max(100).default(3.5),
    exitProtPts: z.coerce.number().min(0).max(100).default(1.0),
    exitParcialProportion: z.coerce.number().min(0).max(1).default(0.70),
    exitFinalProportion: z.coerce.number().min(0).max(1).default(0.30),
    startWeek: z.coerce.number().int().min(1).max(52).default(1),
    notes: z.string().max(5000).optional().nullable(),
  })
  .refine(
    (d) => Math.abs(d.exitParcialProportion + d.exitFinalProportion - 1.0) < 0.001,
    { message: "Exit proportions must sum to 1.0", path: ["exitFinalProportion"] },
  )

const weeklyTargetInputSchema = z.object({
  isoWeek: z.number().int().min(1).max(53),
  isoYear: z.number().int().min(2020).max(2100),
  contracts: z.number().int().positive().optional(),
  valorOperacionalCents: z.number().int().positive().optional(),
  ptsAlvo: z.coerce.number().optional().nullable(),
  ptsFeito: z.coerce.number().optional().nullable(),
  ptsSource: z.enum(["auto", "manual"]).default("manual"),
  metaBrutoCents: z.number().int().optional().nullable(),
  metaLiquidoCents: z.number().int().optional().nullable(),
})

type YearlyPlanInput = z.infer<typeof yearlyPlanSchema>
type WeeklyTargetInput = z.infer<typeof weeklyTargetInputSchema>

export { ladderRuleSchema, yearlyPlanSchema, weeklyTargetInputSchema }
export type { YearlyPlanInput, WeeklyTargetInput }
