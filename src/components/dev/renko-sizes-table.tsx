"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Plus } from "lucide-react"
import { upsertHawksRenkoSize } from "@/app/actions/hawks-renko"
import type { RenkoSizeRecord } from "@/app/actions/hawks-renko.types"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"

interface RenkoSizesTableProps {
	rows: RenkoSizeRecord[]
	currentWeek: { effectiveDate: string; weekNumber: number }
}

const formatBR = (iso: string): string => {
	const [yyyy, mm, dd] = iso.split("-")
	return `${dd}/${mm}/${yyyy}`
}

const RenkoSizesTable = ({ rows, currentWeek }: RenkoSizesTableProps) => {
	const t = useTranslations("renkoSizes")
	const router = useRouter()
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [open, setOpen] = useState(false)

	const currentRow = useMemo(
		() => rows.find((r) => r.effectiveDate === currentWeek.effectiveDate),
		[rows, currentWeek.effectiveDate]
	)
	const isCurrentWeekMissing = !currentRow

	const [form, setForm] = useState(() => ({
		effectiveDate: currentWeek.effectiveDate,
		weekNumber: String(currentWeek.weekNumber),
		size1m: "",
		size5m: "",
		size15m: "",
		size60m: "",
		size1d: "",
	}))

	const onOpen = (open: boolean) => {
		setOpen(open)
		if (open) {
			setForm({
				effectiveDate: currentWeek.effectiveDate,
				weekNumber: String(currentWeek.weekNumber),
				size1m: currentRow?.size1m?.toString() ?? "",
				size5m: currentRow?.size5m?.toString() ?? "",
				size15m: currentRow?.size15m?.toString() ?? "",
				size60m: currentRow?.size60m?.toString() ?? "",
				size1d: currentRow?.size1d?.toString() ?? "",
			})
		}
	}

	const toIntOrNull = (s: string): number | null => {
		const trimmed = s.trim()
		if (!trimmed) {
			return null
		}
		const n = parseInt(trimmed, 10)
		return Number.isFinite(n) ? n : null
	}

	const onSubmit = () => {
		const size5m = toIntOrNull(form.size5m)
		const size15m = toIntOrNull(form.size15m)
		const size60m = toIntOrNull(form.size60m)
		const weekNumber = toIntOrNull(form.weekNumber)
		if (
			size5m === null ||
			size15m === null ||
			size60m === null ||
			weekNumber === null
		) {
			showToast("error", t("requiredFieldsMissing"))
			return
		}

		startTransition(async () => {
			const result = await upsertHawksRenkoSize({
				effectiveDate: form.effectiveDate,
				weekNumber,
				size1m: toIntOrNull(form.size1m),
				size5m,
				size15m,
				size60m,
				size1d: toIntOrNull(form.size1d),
			})
			if (result.success) {
				showToast("success", t("savedToast"))
				setOpen(false)
				router.refresh()
			} else {
				showToast("error", result.error ?? t("saveFailed"))
			}
		})
	}

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
					<p className="text-muted-foreground text-small">
						{t("subtitle", { asset: "WIN" })}
					</p>
				</div>
				<Button
					id="renko-sizes-add-trigger"
					onClick={() => onOpen(true)}
					variant={isCurrentWeekMissing ? "default" : "outline"}
				>
					<Plus className="mr-1 h-4 w-4" />
					{isCurrentWeekMissing
						? t("addThisWeek", { week: currentWeek.weekNumber })
						: t("editThisWeek", { week: currentWeek.weekNumber })}
				</Button>
			</div>

			{isCurrentWeekMissing && (
				<div className="text-small rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
					{t("currentWeekMissing", {
						week: currentWeek.weekNumber,
						date: formatBR(currentWeek.effectiveDate),
					})}
				</div>
			)}

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[80px]">{t("col.week")}</TableHead>
							<TableHead className="w-[120px]">{t("col.date")}</TableHead>
							<TableHead className="text-right">{t("col.1m")}</TableHead>
							<TableHead className="text-right">{t("col.5m")}</TableHead>
							<TableHead className="text-right">{t("col.15m")}</TableHead>
							<TableHead className="text-right">{t("col.60m")}</TableHead>
							<TableHead className="text-right">{t("col.1d")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={7}
									className="text-muted-foreground text-small text-center"
								>
									{t("empty")}
								</TableCell>
							</TableRow>
						)}
						{rows.map((row) => {
							const isCurrent = row.effectiveDate === currentWeek.effectiveDate
							return (
								<TableRow
									key={row.id}
									className={isCurrent ? "bg-primary/5" : undefined}
								>
									<TableCell className="font-medium">
										{row.weekNumber}
									</TableCell>
									<TableCell>{formatBR(row.effectiveDate)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.size1m ?? "—"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.size5m}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.size15m}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.size60m}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.size1d ?? "—"}
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>

			<Dialog open={open} onOpenChange={onOpen}>
				<DialogContent id="renko-sizes-dialog" className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{currentRow ? t("modal.editTitle") : t("modal.addTitle")}
						</DialogTitle>
						<DialogDescription>
							{t("modal.description", {
								week: currentWeek.weekNumber,
								date: formatBR(currentWeek.effectiveDate),
							})}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<Label id="renko-week-label" htmlFor="weekNumber">
									{t("col.week")}
								</Label>
								<Input
									id="weekNumber"
									inputMode="numeric"
									value={form.weekNumber}
									onChange={(e) =>
										setForm((p) => ({ ...p, weekNumber: e.target.value }))
									}
								/>
							</div>
							<div className="space-y-1">
								<Label id="renko-date-label" htmlFor="effectiveDate">
									{t("col.date")}
								</Label>
								<Input
									id="effectiveDate"
									type="date"
									value={form.effectiveDate}
									onChange={(e) =>
										setForm((p) => ({ ...p, effectiveDate: e.target.value }))
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-5 gap-2">
							{(
								["size1m", "size5m", "size15m", "size60m", "size1d"] as const
							).map((key) => {
								const labelKey = key.replace("size", "") as
									| "1m"
									| "5m"
									| "15m"
									| "60m"
									| "1d"
								return (
									<div key={key} className="space-y-1">
										<Label id={`renko-${key}-label`} htmlFor={key}>
											{t(`col.${labelKey}`)}
										</Label>
										<Input
											id={key}
											inputMode="numeric"
											value={form[key]}
											onChange={(e) =>
												setForm((p) => ({ ...p, [key]: e.target.value }))
											}
										/>
									</div>
								)
							})}
						</div>
					</div>
					<DialogFooter>
						<Button
							id="renko-sizes-cancel"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isPending}
						>
							{t("modal.cancel")}
						</Button>
						<Button
							id="renko-sizes-save"
							onClick={onSubmit}
							disabled={isPending}
						>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{t("modal.save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export { RenkoSizesTable }
