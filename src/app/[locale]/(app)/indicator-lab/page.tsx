import { redirect } from "next/navigation"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { requireRole } from "@/lib/auth-utils"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")

const IndicatorLabIndex = async ({
	params,
}: {
	params: Promise<{ locale: string }>
}): Promise<never> => {
	await requireRole("admin")
	const { locale } = await params
	const files = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
	const days = files.map((f) => f.replace(".json", ""))
	const latest = days[days.length - 1] ?? "2026-03-02"
	redirect(`/${locale}/indicator-lab/${latest}`)
}

export { IndicatorLabIndex as default }
