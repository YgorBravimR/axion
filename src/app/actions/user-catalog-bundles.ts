"use server"

import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import type { UserEntry } from "@/types/backtest"
import type { CatalogBundle } from "./user-catalog-bundles.types"

// Server-side directory holding the dev-curated catalog JSON files. Same
// source the dev/hawks-audit page reads from — see
// src/app/actions/hawks-audit-debug.ts. Keeping a single source-of-truth
// directory means a new catalog file picked up there shows up here too with
// no extra wiring.
const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")

const readEntriesDir = (): string[] => {
	try {
		return readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.sort()
	} catch {
		return []
	}
}

// Read every JSON file once per server invocation. Returns the per-day
// bundles plus a synthesized "all" bundle. The future saved-catalogs feature
// (DB-backed, user-created) can extend this list without changing the UI
// contract — the client only cares about the {key, label, catalog} shape.
export const listBundledCatalogs = async (): Promise<CatalogBundle[]> => {
	const files = readEntriesDir()

	const dayBundles: CatalogBundle[] = []
	const allEntries: UserEntry[] = []
	for (const file of files) {
		const dayKey = file.replace(/\.json$/, "")
		try {
			const raw = readFileSync(resolve(ENTRIES_DIR, file), "utf8")
			const parsed = JSON.parse(raw) as UserEntry[]
			if (!Array.isArray(parsed)) {
				continue
			}
			// Light validation — strip any malformed rows rather than fail the
			// whole bundle; matches the engine's tolerance for partial data.
			const clean = parsed.filter(
				(r): r is UserEntry =>
					typeof r === "object" &&
					r !== null &&
					typeof r.date === "string" &&
					typeof r.brickIndex === "number" &&
					(r.direction === "long" || r.direction === "short")
			)
			dayBundles.push({
				key: dayKey,
				label: `${dayKey} — ${clean.length} ${clean.length === 1 ? "entry" : "entries"}`,
				count: clean.length,
				catalog: clean,
			})
			allEntries.push(...clean)
		} catch {
			// Skip unreadable / malformed files quietly. The dev page surfaces
			// load errors in a separate audit flow; here we just keep the picker
			// functional.
		}
	}

	if (dayBundles.length === 0) {
		return []
	}
	return [
		{
			key: "all",
			label: `All days — ${allEntries.length} entries (${dayBundles.length} days)`,
			count: allEntries.length,
			catalog: allEntries,
		},
		...dayBundles,
	]
}
