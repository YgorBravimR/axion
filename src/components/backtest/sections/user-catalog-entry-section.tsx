"use client"

import { memo, useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { hhmmToTimeString, timeStringToHhmm } from "@/lib/backtest/time-utils"
import type {
	StrategyRecipe,
	UserCatalogConfig,
	UserEntry,
} from "@/types/backtest"

interface UserCatalogEntrySectionProps {
	recipe: StrategyRecipe
	onRecipeChange: (_recipe: StrategyRecipe) => void
}

// Parse a JSON string and validate it shaped as UserEntry[].
// Returns the array on success, or an error string describing the problem.
const parseCatalog = (raw: string): UserEntry[] | string => {
	const trimmed = raw.trim()
	if (!trimmed) {
		return []
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch (err) {
		return err instanceof Error ? err.message : "Invalid JSON"
	}
	if (!Array.isArray(parsed)) {
		return "Expected an array of entries"
	}
	for (let i = 0; i < parsed.length; i++) {
		const row = (parsed as unknown[])[i]
		if (typeof row !== "object" || row === null) {
			return `Entry ${i + 1}: not an object`
		}
		const r = row as Record<string, unknown>
		if (typeof r.date !== "string") {
			return `Entry ${i + 1}: missing or invalid 'date'`
		}
		if (typeof r.brickIndex !== "number") {
			return `Entry ${i + 1}: missing or invalid 'brickIndex'`
		}
		if (r.direction !== "long" && r.direction !== "short") {
			return `Entry ${i + 1}: 'direction' must be "long" or "short"`
		}
	}
	return parsed as UserEntry[]
}

const UserCatalogEntrySection = memo(
	({ recipe, onRecipeChange }: UserCatalogEntrySectionProps) => {
		const t = useTranslations("backtest.userCatalog")

		// Narrow defensively so hooks can run unconditionally. The parent
		// already guards on entry.type === "user_catalog", so `config` is
		// effectively always present at runtime, but typing it as nullable
		// keeps Rules of Hooks happy if this component is ever mounted
		// without the right entry type.
		const config: UserCatalogConfig | null =
			recipe.entry.type === "user_catalog"
				? (recipe.entry.config as UserCatalogConfig)
				: null

		// Local state for the textarea so the user can edit freely without
		// every keystroke forcing a JSON re-parse + recipe replace.
		const [draft, setDraft] = useState(() =>
			config && config.catalog.length > 0
				? JSON.stringify(config.catalog, null, 2)
				: ""
		)
		const [error, setError] = useState<string | null>(null)

		// Locally-originated updates flag this ref so the catalog-watching
		// effect knows to skip the re-sync — without this, every valid
		// keystroke would round-trip via onRecipeChange and overwrite the
		// user's in-progress whitespace + cursor. External writes (the
		// parent auto-loading the all-days bundle, a preset switch) still
		// trigger the re-sync since the flag is false in that case.
		const localChangeRef = useRef(false)

		useEffect(() => {
			if (localChangeRef.current) {
				localChangeRef.current = false
				return
			}
			setDraft(
				config && config.catalog.length > 0
					? JSON.stringify(config.catalog, null, 2)
					: ""
			)
			setError(null)
		}, [config, recipe.presetId])

		if (!config) {
			return null
		}

		const applyCatalog = (raw: string) => {
			setDraft(raw)
			const result = parseCatalog(raw)
			if (typeof result === "string") {
				setError(result)
				return
			}
			setError(null)
			localChangeRef.current = true
			onRecipeChange({
				...recipe,
				entry: {
					type: "user_catalog",
					config: { ...config, catalog: result },
				},
			})
		}

		const updateTime = (field: "startTime" | "endTime", value: number) => {
			onRecipeChange({
				...recipe,
				entry: {
					type: "user_catalog",
					config: { ...config, [field]: value },
				},
			})
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-m-400 p-m-400 rounded-lg border">
				<div>
					<h2 className="text-h3 text-txt-100 font-semibold">{t("name")}</h2>
					<p className="text-small text-txt-300 mt-s-100">{t("description")}</p>
				</div>

				{/* Time window — kept in sync with autonomous Hawks for parity */}
				<div className="gap-m-400 grid grid-cols-2">
					<div className="space-y-s-200">
						<Label
							id="user-catalog-startTime-label"
							htmlFor="user-catalog-startTime"
						>
							{t("startTime")}
						</Label>
						<Input
							id="user-catalog-startTime"
							type="time"
							value={hhmmToTimeString(config.startTime ?? 900)}
							onChange={(e) =>
								updateTime("startTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>
					<div className="space-y-s-200">
						<Label
							id="user-catalog-endTime-label"
							htmlFor="user-catalog-endTime"
						>
							{t("endTime")}
						</Label>
						<Input
							id="user-catalog-endTime"
							type="time"
							value={hhmmToTimeString(config.endTime ?? 1700)}
							onChange={(e) =>
								updateTime("endTime", timeStringToHhmm(e.target.value))
							}
						/>
					</div>
				</div>

				{/* Catalog JSON paste — auto-populated by the parent with the
				    merged "all days" bundle on entering this strategy; user can
				    edit (e.g. to exclude specific dates) before running. */}
				<div className="space-y-s-200">
					<Label id="user-catalog-json-label" htmlFor="user-catalog-json">
						{t("catalogJson")}
					</Label>
					<p className="text-small text-txt-300">{t("catalogJsonHint")}</p>
					<Textarea
						id="user-catalog-json"
						value={draft}
						onChange={(e) => applyCatalog(e.target.value)}
						rows={12}
						placeholder={`[\n  { "date": "2026-05-13", "brickIndex": 16, "direction": "short", "label": "T1" }\n]`}
						className="text-tiny max-h-[480px] overflow-y-auto font-mono"
						aria-invalid={error !== null}
					/>
					{error !== null && (
						<p className="text-small text-red-500" role="alert">
							{error}
						</p>
					)}
					{error === null && config.catalog.length > 0 && (
						<p className="text-small text-txt-300">
							{t("catalogLoaded", { count: config.catalog.length })}
						</p>
					)}
				</div>
			</div>
		)
	}
)
UserCatalogEntrySection.displayName = "UserCatalogEntrySection"

export { UserCatalogEntrySection }
