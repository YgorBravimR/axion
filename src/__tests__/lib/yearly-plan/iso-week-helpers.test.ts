import { describe, it, expect } from "vitest"
import {
  getIsoWeeksForYear,
  getIsoWeekOfDate,
  groupWeeksByMonth,
} from "@/lib/calendar/iso-week"

describe("getIsoWeeksForYear", () => {
  it("2026 has 53 ISO weeks", () => {
    const weeks = getIsoWeeksForYear(2026)
    expect(weeks).toHaveLength(53)
  })
  it("each entry has week + isoYear fields", () => {
    const weeks = getIsoWeeksForYear(2026)
    expect(weeks[0]).toHaveProperty("week")
    expect(weeks[0]).toHaveProperty("isoYear")
  })
})

describe("getIsoWeekOfDate", () => {
  it("2026-05-03 is week 18", () => {
    expect(getIsoWeekOfDate(new Date("2026-05-03"))).toBe(18)
  })
})

describe("groupWeeksByMonth", () => {
  it("groups WeeklyTarget-like objects by calendar month 1-12", () => {
    const fakeWeeks = [
      { isoWeek: 1, isoYear: 2026 },
      { isoWeek: 5, isoYear: 2026 },
      { isoWeek: 9, isoYear: 2026 },
    ]
    const grouped = groupWeeksByMonth(fakeWeeks as never, 2026)
    expect(grouped[1]).toBeDefined()
  })
})
