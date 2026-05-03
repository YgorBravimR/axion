import { describe, it, expect } from "vitest"
import {
  getWeekNumber,
  getWeekYear,
  getWeeksInYear,
  weekStart,
  weekEnd,
} from "@/lib/calendar/iso-week"

describe("iso-week", () => {
  it("returns correct ISO week number for a known date", () => {
    // 2026-01-05 is ISO week 2 of 2026
    expect(getWeekNumber(new Date("2026-01-05"))).toBe(2)
  })

  it("returns ISO week 53 for Dec 28 2026 if 2026 has 53 weeks", () => {
    // 2026 has 53 ISO weeks — Dec 28 is week 53
    const weeksIn2026 = getWeeksInYear(2026)
    expect(weeksIn2026).toBe(53)
    expect(getWeekNumber(new Date("2026-12-28"))).toBe(53)
  })

  it("returns ISO year 2026 for Dec 31 2025 when that day belongs to week 1 of 2026", () => {
    // Dec 29 2025 → ISO week 1 of 2026
    expect(getWeekYear(new Date("2025-12-29"))).toBe(2026)
  })

  it("returns week start (Monday) for a Wednesday", () => {
    const result = weekStart(new Date("2026-05-06")) // Wednesday
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-04") // Monday
  })

  it("returns week end (Sunday) for a Wednesday", () => {
    const result = weekEnd(new Date("2026-05-06")) // Wednesday
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-10") // Sunday
  })

  it("getWeeksInYear returns 52 for a regular year", () => {
    expect(getWeeksInYear(2025)).toBe(52)
  })
})
