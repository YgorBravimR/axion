"use client"

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

interface SectionEntry {
	id: string
	label: string
	isDirty: boolean
	save: () => Promise<void>
	reset: () => void
}

interface SettingsSaveBarContextValue {
	register: (_entry: SectionEntry) => () => void
	update: (_id: string, _patch: Partial<Omit<SectionEntry, "id">>) => void
}

const SettingsSaveBarContext =
	createContext<SettingsSaveBarContextValue | null>(null)

interface SettingsSaveBarProviderProps {
	children: ReactNode
}

const SettingsSaveBarProvider = ({
	children,
}: SettingsSaveBarProviderProps) => {
	const t = useTranslations("settings.saveBar")
	const { showToast } = useToast()
	const [sections, setSections] = useState<SectionEntry[]>([])
	const [isSaving, setIsSaving] = useState(false)

	const register = useCallback((entry: SectionEntry) => {
		setSections((prev) => {
			const without = prev.filter((s) => s.id !== entry.id)
			return [...without, entry]
		})
		return () => {
			setSections((prev) => prev.filter((s) => s.id !== entry.id))
		}
	}, [])

	const update = useCallback(
		(id: string, patch: Partial<Omit<SectionEntry, "id">>) => {
			setSections((prev) =>
				prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
			)
		},
		[]
	)

	const dirtyCount = sections.filter((s) => s.isDirty).length

	const handleSave = useCallback(async () => {
		const dirty = sections.filter((s) => s.isDirty)
		if (dirty.length === 0) {
			return
		}
		setIsSaving(true)

		// Serialize saves to prevent concurrent JWT cookie writes from corrupting the session.
		// NextAuth with strategy: "jwt" may refresh the cookie on every auth() call;
		// concurrent server actions with requireAuth() can cause overlapping Set-Cookie headers,
		// resulting in a partially-written/corrupted JWT at the Edge runtime.
		// See: docs/postMorten/backend.md [BUG-2026-05-25-2]
		const results: PromiseSettledResult<void>[] = []
		for (const section of dirty) {
			try {
				// eslint-disable-next-line no-await-in-loop -- sequential to prevent concurrent JWT cookie writes
				await section.save()
				results.push({ status: "fulfilled" as const, value: undefined })
			} catch (error) {
				results.push({
					status: "rejected" as const,
					reason: error instanceof Error ? error : new Error(String(error)),
				})
			}
		}

		setIsSaving(false)

		const failed = results.filter((r) => r.status === "rejected")
		if (failed.length > 0) {
			showToast(
				"error",
				t("saveErrorWithCount", {
					failed: failed.length,
					total: dirty.length,
				})
			)
			return
		}
		showToast("success", t("saveSuccess", { count: dirty.length }))
	}, [sections, showToast, t])

	const handleCancel = useCallback(() => {
		for (const s of sections) {
			if (s.isDirty) {
				s.reset()
			}
		}
	}, [sections])

	const value = useMemo(() => ({ register, update }), [register, update])

	const visible = dirtyCount > 0

	return (
		<SettingsSaveBarContext.Provider value={value}>
			{children}
			{visible && (
				<div
					className="px-m-400 pb-m-400 animate-in slide-in-from-bottom-4 fade-in pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center duration-200 motion-reduce:animate-none"
					role="region"
					aria-label={t("regionLabel")}
				>
					<div className="border-bg-300 bg-bg-200 px-m-400 py-s-300 gap-m-400 pointer-events-auto flex w-full max-w-2xl items-center justify-between rounded-lg border shadow-lg">
						<div className="text-small text-txt-200">
							{t("pendingChanges", { count: dirtyCount })}
						</div>
						<div className="gap-s-200 flex items-center">
							<Button
								id="settings-save-bar-cancel"
								variant="ghost"
								size="sm"
								onClick={handleCancel}
								disabled={isSaving}
							>
								{t("cancel")}
							</Button>
							<Button
								id="settings-save-bar-save"
								size="sm"
								onClick={handleSave}
								disabled={isSaving}
							>
								{isSaving && (
									<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
								)}
								{isSaving ? t("saving") : t("save")}
							</Button>
						</div>
					</div>
				</div>
			)}
		</SettingsSaveBarContext.Provider>
	)
}

interface UseRegisterSectionArgs {
	id: string
	label: string
	isDirty: boolean
	onSave: () => Promise<void>
	onReset: () => void
}

/**
 * Register a settings section with the master save bar.
 * The section provides its dirty state + save/reset handlers; the bar
 * surfaces a single Save/Cancel pair for the whole page.
 *
 * Safe to call inside conditional render paths as long as `id` is stable.
 * If the surrounding tree has no provider, this hook becomes a no-op so the
 * component can still mount in isolation (e.g. tests).
 */
const useRegisterSettingsSection = ({
	id,
	label,
	isDirty,
	onSave,
	onReset,
}: UseRegisterSectionArgs) => {
	const ctx = useContext(SettingsSaveBarContext)
	const saveRef = useRef(onSave)
	const resetRef = useRef(onReset)
	// Mount-time snapshot for the register call. label/isDirty are then kept
	// in sync via the second effect — we deliberately exclude them from the
	// register-effect deps so the section doesn't unregister and re-register
	// on every render.
	const initialLabel = useRef(label)
	const initialDirty = useRef(isDirty)

	useEffect(() => {
		saveRef.current = onSave
	}, [onSave])
	useEffect(() => {
		resetRef.current = onReset
	}, [onReset])

	useEffect(() => {
		if (!ctx) {
			return
		}
		const unregister = ctx.register({
			id,
			label: initialLabel.current,
			isDirty: initialDirty.current,
			save: () => saveRef.current(),
			reset: () => resetRef.current(),
		})
		return unregister
	}, [ctx, id])

	useEffect(() => {
		if (!ctx) {
			return
		}
		ctx.update(id, { isDirty, label })
	}, [ctx, id, isDirty, label])
}

export { SettingsSaveBarProvider, useRegisterSettingsSection }
