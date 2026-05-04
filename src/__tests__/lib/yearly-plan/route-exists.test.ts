import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"

describe("yearly-plan route", () => {
  it("page.tsx exists at the correct path", () => {
    const pagePath = path.join(
      process.cwd(),
      "src/app/[locale]/(app)/yearly-plan/page.tsx",
    )
    expect(fs.existsSync(pagePath)).toBe(true)
  })
})
