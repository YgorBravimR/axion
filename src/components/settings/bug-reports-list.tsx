"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import {
	Bug,
	ChevronRight,
	X,
	ExternalLink,
	CheckCircle,
	XCircle,
	Archive,
	Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
	getBugReports,
	getBugReportDetail,
	updateBugReportStatus,
} from "@/app/actions/bug-reports"
import type {
	BugReportWithReporter,
	BugReportDetail,
} from "@/app/actions/bug-report-types"
import { ImageLightbox } from "@/components/shared/image-lightbox"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "open" | "accepted" | "rejected" | "closed"

const STATUS_STYLES: Record<string, string> = {
	open: "bg-acc-100/20 text-acc-100",
	accepted: "bg-acc-200/20 text-acc-200",
	rejected: "bg-fb-error/20 text-fb-error",
	closed: "bg-fb-success/20 text-fb-success",
}

const STATUS_FILTERS: StatusFilter[] = [
	"all",
	"open",
	"accepted",
	"rejected",
	"closed",
]

const formatJson = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2)
	} catch {
		return raw
	}
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
})

const formatDate = (date: Date | null): string => {
	if (!date) {
		return "—"
	}
	return dateTimeFormatter.format(new Date(date))
}

const BugReportsList = () => {
	const t = useTranslations("bugReport.admin")
	const { showToast } = useToast()

	const [reports, setReports] = useState<BugReportWithReporter[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [filter, setFilter] = useState<StatusFilter>("all")
	const [selectedReport, setSelectedReport] = useState<BugReportDetail | null>(
		null
	)
	const [isDetailLoading, setIsDetailLoading] = useState(false)
	const [isActionPending, setIsActionPending] = useState(false)
	const [rejectReason, setRejectReason] = useState("")
	const [showRejectForm, setShowRejectForm] = useState(false)
	const [adminNotes, setAdminNotes] = useState("")
	const [lightboxOpen, setLightboxOpen] = useState(false)
	const [lightboxIndex, setLightboxIndex] = useState(0)
	const detailPanelRef = useRef<HTMLDivElement>(null)
	/** Cached focusable elements — only re-queried when the panel mounts/updates */
	const focusableRef = useRef<HTMLElement[]>([])

	// Cache focusable elements when the panel becomes visible
	useEffect(() => {
		if (!selectedReport || !detailPanelRef.current) {
			focusableRef.current = []
			return
		}
		focusableRef.current = Array.from(
			detailPanelRef.current.querySelectorAll<HTMLElement>(
				'button, [href], input, textarea, select, details > summary, [tabindex]:not([tabindex="-1"])'
			)
		)
	}, [selectedReport])

	const handlePanelKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape" && !isActionPending) {
				setSelectedReport(null)
				return
			}

			if (e.key === "Tab") {
				const focusable = focusableRef.current
				const first = focusable[0]
				const last = focusable[focusable.length - 1]
				if (!first || !last) {
					return
				}

				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault()
					last.focus()
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault()
					first.focus()
				}
			}
		},
		[isActionPending]
	)

	// Escape key + focus trap for detail slide-over
	useEffect(() => {
		if (!selectedReport) {
			return
		}
		document.addEventListener("keydown", handlePanelKeyDown)
		return () => document.removeEventListener("keydown", handlePanelKeyDown)
	}, [selectedReport, handlePanelKeyDown])

	const fetchReports = useCallback(async () => {
		setIsLoading(true)
		try {
			const result = await getBugReports(
				filter === "all" ? undefined : { status: filter }
			)
			if (result.status === "success" && result.data) {
				setReports(result.data.items)
			}
		} catch {
			showToast("error", t("fetchError"))
		} finally {
			setIsLoading(false)
		}
	}, [filter, showToast])

	useEffect(() => {
		void fetchReports()
	}, [fetchReports])

	const handleViewDetail = useCallback(
		async (id: string) => {
			setIsDetailLoading(true)
			try {
				const result = await getBugReportDetail(id)
				if (result.status === "success" && result.data) {
					setSelectedReport(result.data)
					setAdminNotes(result.data.adminNotes ?? "")
					setRejectReason("")
					setShowRejectForm(false)
				}
			} catch {
				showToast("error", t("fetchDetailError"))
			} finally {
				setIsDetailLoading(false)
			}
		},
		[showToast]
	)

	const handleAction = useCallback(
		async (action: "accept" | "reject" | "close") => {
			if (!selectedReport) {
				return
			}
			if (action === "reject" && !rejectReason.trim()) {
				return
			}

			setIsActionPending(true)
			try {
				const result = await updateBugReportStatus({
					id: selectedReport.id,
					action,
					rejectReason: action === "reject" ? rejectReason : undefined,
					adminNotes: adminNotes || undefined,
				})

				if (result.status === "success") {
					const successMessages: Record<typeof action, string> = {
						accept: t("actions.acceptSuccess"),
						reject: t("actions.rejectSuccess"),
						close: t("actions.closeSuccess"),
					}
					showToast("success", successMessages[action])
					setSelectedReport(null)
					void fetchReports()
				} else {
					showToast("error", t("actions.actionError"))
				}
			} catch {
				showToast("error", t("actions.actionError"))
			} finally {
				setIsActionPending(false)
			}
		},
		[selectedReport, rejectReason, adminNotes, showToast, fetchReports]
	)

	return (
		<div className="space-y-m-400">
			{/* Filter tabs */}
			<div className="gap-s-200 flex flex-wrap">
				{STATUS_FILTERS.map((f) => (
					<Button
						id={`bug-filter-${f}`}
						key={f}
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setFilter(f)}
						className={cn(
							"text-tiny",
							filter === f
								? "bg-acc-100/20 text-acc-100 hover:bg-acc-100/30 hover:text-acc-100"
								: ""
						)}
					>
						{t(`filters.${f}`)}
					</Button>
				))}
			</div>

			{/* Report list */}
			{isLoading ? (
				<div className="py-l-700 flex items-center justify-center">
					<Loader2 className="text-txt-300 h-6 w-6 animate-spin motion-reduce:animate-none" />
				</div>
			) : reports.length === 0 ? (
				<div className="gap-s-300 py-l-700 text-txt-300 flex flex-col items-center justify-center">
					<Bug className="h-10 w-10" />
					<p className="text-small">{t("noReports")}</p>
				</div>
			) : (
				<div className="space-y-s-200">
					{reports.map((report) => (
						<button
							key={report.id}
							type="button"
							onClick={() => handleViewDetail(report.id)}
							className="gap-s-300 border-bg-300 bg-bg-200 px-m-400 py-s-300 hover:border-bg-300/80 hover:bg-bg-300/50 focus-visible:ring-acc-100 flex w-full items-center rounded-lg border text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
						>
							<div className="min-w-0 flex-1">
								<div className="gap-s-200 flex items-center">
									<p className="text-small text-txt-100 truncate font-medium">
										{report.subject}
									</p>
									<span
										className={cn(
											"px-s-200 py-s-100 text-micro shrink-0 rounded-full font-medium",
											STATUS_STYLES[report.status]
										)}
									>
										{t(`status.${report.status}`)}
									</span>
								</div>
								<div className="mt-s-100 gap-s-200 text-tiny text-txt-300 flex items-center">
									<span>{report.reporterName ?? report.reporterEmail}</span>
									<span className="text-txt-300/50">·</span>
									<span>{formatDate(report.reportedAt)}</span>
									{report.imageCount > 0 && (
										<>
											<span className="text-txt-300/50">·</span>
											<span>
												{report.imageCount === 1
													? t("imageCountSingle")
													: t("imageCountPlural", { count: report.imageCount })}
											</span>
										</>
									)}
								</div>
							</div>
							<ChevronRight className="text-txt-300 h-4 w-4 shrink-0" />
						</button>
					))}
				</div>
			)}

			{/* Detail dialog (slide-over) */}
			{(selectedReport || isDetailLoading) && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-end"
					role="dialog"
					aria-label={selectedReport?.subject ?? t("title")}
					aria-modal="true"
				>
					{/* Backdrop — decorative, click-to-dismiss only */}
					<div
						className="bg-bg-100/80 absolute inset-0"
						onClick={() => !isActionPending && setSelectedReport(null)}
						aria-hidden="true"
					/>

					{/* Panel */}
					<div
						ref={detailPanelRef}
						className="border-bg-300 bg-bg-200 p-m-500 animate-in slide-in-from-right relative z-10 h-full w-full max-w-lg overflow-y-auto border-l shadow-xl duration-200 motion-reduce:animate-none motion-reduce:transition-none"
					>
						{isDetailLoading ? (
							<div className="flex h-full items-center justify-center">
								<Loader2 className="text-txt-300 h-6 w-6 animate-spin motion-reduce:animate-none" />
							</div>
						) : selectedReport ? (
							<div className="space-y-m-500">
								{/* Header */}
								<div className="gap-s-300 flex items-start justify-between">
									<div>
										<h3 className="text-body text-txt-100 font-medium">
											{selectedReport.subject}
										</h3>
										<div className="mt-s-100 gap-s-200 flex items-center">
											<span
												className={cn(
													"px-s-200 py-s-100 text-micro rounded-full font-medium",
													STATUS_STYLES[selectedReport.status]
												)}
											>
												{t(`status.${selectedReport.status}`)}
											</span>
										</div>
									</div>
									<Button
										id="bug-detail-close"
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => setSelectedReport(null)}
										className="size-8"
										aria-label={t("actions.close")}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>

								{/* Description */}
								<div>
									<p className="text-tiny text-txt-200 mb-s-100 font-medium">
										{t("detail.description")}
									</p>
									<p className="text-small text-txt-100 whitespace-pre-wrap">
										{selectedReport.description}
									</p>
								</div>

								{/* Metadata */}
								<div className="gap-s-300 text-tiny grid grid-cols-2">
									<div>
										<p className="text-txt-300">{t("detail.reportedBy")}</p>
										<p className="text-txt-100">
											{selectedReport.reporterName ??
												selectedReport.reporterEmail}
										</p>
									</div>
									<div>
										<p className="text-txt-300">{t("detail.reportedAt")}</p>
										<p className="text-txt-100">
											{formatDate(selectedReport.reportedAt)}
										</p>
									</div>
									{selectedReport.handlerName && (
										<div>
											<p className="text-txt-300">{t("detail.handledBy")}</p>
											<p className="text-txt-100">
												{selectedReport.handlerName}
											</p>
										</div>
									)}
									{selectedReport.acceptedAt && (
										<div>
											<p className="text-txt-300">{t("detail.acceptedAt")}</p>
											<p className="text-txt-100">
												{formatDate(selectedReport.acceptedAt)}
											</p>
										</div>
									)}
									{selectedReport.rejectedAt && (
										<div>
											<p className="text-txt-300">{t("detail.rejectedAt")}</p>
											<p className="text-txt-100">
												{formatDate(selectedReport.rejectedAt)}
											</p>
										</div>
									)}
									{selectedReport.closedAt && (
										<div>
											<p className="text-txt-300">{t("detail.closedAt")}</p>
											<p className="text-txt-100">
												{formatDate(selectedReport.closedAt)}
											</p>
										</div>
									)}
								</div>

								{/* Page URL */}
								{selectedReport.currentUrl && (
									<div>
										<p className="text-tiny text-txt-200 mb-s-100 font-medium">
											{t("detail.url")}
										</p>
										<p className="text-tiny text-acc-200 gap-s-100 flex items-center break-all">
											<ExternalLink className="h-3 w-3 shrink-0" />
											{selectedReport.currentUrl}
										</p>
									</div>
								)}

								{/* User Agent */}
								{selectedReport.userAgent && (
									<div>
										<p className="text-tiny text-txt-200 mb-s-100 font-medium">
											{t("detail.userAgent")}
										</p>
										<p className="text-micro text-txt-300 break-all">
											{selectedReport.userAgent}
										</p>
									</div>
								)}

								{/* Images */}
								{selectedReport.images.length > 0 && (
									<div>
										<p className="text-tiny text-txt-200 mb-s-100 font-medium">
											{t("detail.images")}
										</p>
										<div className="gap-s-200 grid grid-cols-2">
											{selectedReport.images.map((img, imgIndex) => (
												<button
													key={img.id}
													type="button"
													className="border-bg-300 focus-visible:ring-acc-100 cursor-pointer overflow-hidden rounded-lg border transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
													onClick={() => {
														setLightboxIndex(imgIndex)
														setLightboxOpen(true)
													}}
												>
													{/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded bug report image URL, dimensions unknown at render time */}
													<img
														src={img.imageUrl}
														alt={
															img.isScreenshot
																? t("detail.screenshot")
																: t("detail.images")
														}
														className="aspect-video w-full object-cover"
													/>
												</button>
											))}
										</div>
										<ImageLightbox
											images={selectedReport.images.map((img) => ({
												src: img.imageUrl,
												alt: img.isScreenshot
													? t("detail.screenshot")
													: t("detail.images"),
											}))}
											initialIndex={lightboxIndex}
											open={lightboxOpen}
											onOpenChange={setLightboxOpen}
										/>
									</div>
								)}

								{/* Console Logs */}
								{selectedReport.consoleLogs && (
									<details>
										<summary className="text-tiny text-txt-200 cursor-pointer font-medium">
											{t("detail.consoleLogs")}
										</summary>
										<pre className="mt-s-200 bg-bg-100 p-s-300 text-micro text-txt-300 max-h-48 overflow-auto rounded-md">
											{formatJson(selectedReport.consoleLogs)}
										</pre>
									</details>
								)}

								{/* Network Errors */}
								{selectedReport.networkErrors && (
									<details>
										<summary className="text-tiny text-txt-200 cursor-pointer font-medium">
											{t("detail.networkErrors")}
										</summary>
										<pre className="mt-s-200 bg-bg-100 p-s-300 text-micro text-txt-300 max-h-48 overflow-auto rounded-md">
											{formatJson(selectedReport.networkErrors)}
										</pre>
									</details>
								)}

								{/* Reject reason (if rejected) */}
								{selectedReport.rejectReason && (
									<div className="border-fb-error/20 bg-fb-error/5 p-s-300 rounded-md border">
										<p className="text-tiny text-fb-error mb-s-100 font-medium">
											{t("actions.rejectReason")}
										</p>
										<p className="text-small text-txt-100">
											{selectedReport.rejectReason}
										</p>
									</div>
								)}

								{/* Admin notes */}
								{selectedReport.status !== "closed" && (
									<div>
										<label
											htmlFor="admin-notes"
											className="text-tiny text-txt-200 mb-s-100 block font-medium"
										>
											{t("actions.adminNotes")}
										</label>
										<Textarea
											id="admin-notes"
											value={adminNotes}
											onChange={(e) => setAdminNotes(e.target.value)}
											placeholder={t("actions.adminNotesPlaceholder")}
											rows={2}
											disabled={isActionPending}
										/>
									</div>
								)}

								{/* Actions */}
								{selectedReport.status === "open" && !showRejectForm && (
									<div className="gap-s-200 flex">
										<Button
											id="bug-report-accept"
											type="button"
											size="sm"
											onClick={() => handleAction("accept")}
											disabled={isActionPending}
											className="flex-1"
										>
											{isActionPending ? (
												<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
											) : (
												<CheckCircle className="mr-s-100 h-4 w-4" />
											)}
											{t("actions.accept")}
										</Button>
										<Button
											id="bug-report-reject-open"
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setShowRejectForm(true)}
											disabled={isActionPending}
											className="flex-1"
										>
											<XCircle className="mr-s-100 h-4 w-4" />
											{t("actions.reject")}
										</Button>
									</div>
								)}

								{/* Reject form — replaces the action buttons */}
								{selectedReport.status === "open" && showRejectForm && (
									<div className="space-y-s-200 border-fb-error/20 bg-fb-error/5 p-m-400 rounded-md border">
										<label
											htmlFor="reject-reason"
											className="text-tiny text-txt-200 block font-medium"
										>
											{t("actions.rejectReason")}
										</label>
										<Textarea
											id="reject-reason"
											value={rejectReason}
											onChange={(e) => setRejectReason(e.target.value)}
											placeholder={t("actions.rejectReasonPlaceholder")}
											rows={2}
											autoFocus
										/>
										<div className="gap-s-200 flex">
											<Button
												id="bug-report-confirm-reject"
												type="button"
												variant="destructive"
												size="sm"
												onClick={() => handleAction("reject")}
												disabled={!rejectReason.trim() || isActionPending}
												className="flex-1"
											>
												{isActionPending && (
													<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
												)}
												{t("actions.confirmReject")}
											</Button>
											<Button
												id="bug-report-cancel-reject"
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => {
													setShowRejectForm(false)
													setRejectReason("")
												}}
												className="flex-1"
											>
												{t("actions.cancel")}
											</Button>
										</div>
									</div>
								)}

								{selectedReport.status === "accepted" && (
									<Button
										id="bug-report-close"
										type="button"
										size="sm"
										variant="outline"
										onClick={() => handleAction("close")}
										disabled={isActionPending}
										className="w-full"
									>
										{isActionPending ? (
											<Loader2 className="mr-s-100 h-4 w-4 animate-spin motion-reduce:animate-none" />
										) : (
											<Archive className="mr-s-100 h-4 w-4" />
										)}
										{t("actions.close")}
									</Button>
								)}
							</div>
						) : null}
					</div>
				</div>
			)}
		</div>
	)
}

export { BugReportsList }
