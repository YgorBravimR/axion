"use client"

import {
	MousePointer2,
	Minus,
	TrendingUp,
	Activity,
	Spline,
	ArrowDownToLine,
	ArrowUpFromLine,
	Trash2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { DrawingTool } from "./drawings"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DrawingToolbarProps {
	readonly activeTool: DrawingTool
	readonly onSelectTool: (_tool: DrawingTool) => void
	readonly pendingAnchor: boolean
	readonly drawingCount: number
	readonly onClearAll: () => void
}

interface ToolDef {
	readonly tool: DrawingTool
	readonly icon: typeof MousePointer2
	readonly labelKey: string
}

// Order matches the user's typical workflow — cursor first, then time/price
// markers, then the more elaborate fibo + position tools at the end.
const TOOLS: ReadonlyArray<ToolDef> = [
	{ tool: "cursor", icon: MousePointer2, labelKey: "tool.cursor" },
	{ tool: "hline", icon: Minus, labelKey: "tool.hline" },
	{ tool: "trendline", icon: TrendingUp, labelKey: "tool.trendline" },
	{ tool: "vline", icon: Activity, labelKey: "tool.vline" },
	{ tool: "fibo", icon: Spline, labelKey: "tool.fibo" },
	{
		tool: "position-long",
		icon: ArrowUpFromLine,
		labelKey: "tool.positionLong",
	},
	{
		tool: "position-short",
		icon: ArrowDownToLine,
		labelKey: "tool.positionShort",
	},
]

const HawksChartDrawingToolbar = ({
	activeTool,
	onSelectTool,
	pendingAnchor,
	drawingCount,
	onClearAll,
}: DrawingToolbarProps) => {
	const t = useTranslations("hawksChart")

	return (
		<div className="border-bg-300 bg-bg-200 gap-s-200 flex flex-wrap items-center rounded-md border p-2">
			{TOOLS.map(({ tool, icon: Icon, labelKey }) => {
				const isActive = activeTool === tool
				return (
					<Button
						key={tool}
						id={`hawks-chart-tool-${tool}`}
						type="button"
						variant={isActive ? "default" : "ghost"}
						size="sm"
						className="gap-s-100"
						aria-pressed={isActive}
						onClick={() => onSelectTool(tool)}
						title={t(labelKey)}
					>
						<Icon className="h-4 w-4" />
						<span className="text-tiny">{t(labelKey)}</span>
					</Button>
				)
			})}
			<div className="text-tiny text-txt-300 ml-auto flex items-center gap-2 font-mono">
				{pendingAnchor && (
					<span className="text-acc-200">{t("clickSecondAnchor")}</span>
				)}
				<span>{t("drawingCount", { count: drawingCount })}</span>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							id="hawks-chart-clear-all"
							type="button"
							variant="ghost"
							size="sm"
							disabled={drawingCount === 0}
							className="gap-s-100"
						>
							<Trash2 className="h-4 w-4" />
							<span className="text-tiny">{t("clearAll")}</span>
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("clearAllTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("clearAllDescription", { count: drawingCount })}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel id="hawks-chart-clear-cancel">
								{t("cancel")}
							</AlertDialogCancel>
							<AlertDialogAction
								id="hawks-chart-clear-confirm"
								onClick={onClearAll}
							>
								{t("confirmClear")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	)
}

export { HawksChartDrawingToolbar }
export type { DrawingToolbarProps }
