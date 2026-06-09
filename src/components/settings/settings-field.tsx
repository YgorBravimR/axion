import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface SettingsFieldProps {
	/** ID for the rendered Label (defaults to `label-${htmlFor}`). */
	labelId?: string
	/** Form control id that this label is bound to. */
	htmlFor?: string
	/** Field label text. */
	label: ReactNode
	/** Optional helper copy rendered under the label. */
	help?: ReactNode
	/** Form control (Input / Select / Switch / etc.). */
	children: ReactNode
	/** Optional extra className for the row wrapper. */
	className?: string
	/**
	 * Alignment of the control inside the 16rem cell. Default `stretch` makes
	 * inputs/selects fill the cell so right edges line up; `end` is for compact
	 * widgets (Switch, ThemeToggle) that should anchor to the right edge.
	 */
	controlAlign?: "stretch" | "end"
}

/**
 * Standard label-plus-control row used across every Settings tab.
 *
 * Geometry: on `sm+` the row is a 2-column flex where the right column is
 * a fixed 16rem (w-64). Every control inside is `w-full` so the right edges
 * of inputs, selects, and compound widgets (input + suffix) all align on the
 * same vertical line. On mobile the row stacks (label above control).
 */
const SettingsField = ({
	labelId,
	htmlFor,
	label,
	help,
	children,
	className,
	controlAlign = "stretch",
}: SettingsFieldProps) => {
	const resolvedLabelId = labelId ?? (htmlFor ? `label-${htmlFor}` : undefined)
	return (
		<div
			className={cn(
				"gap-s-200 sm:gap-m-400 flex flex-col sm:flex-row sm:items-center sm:justify-between",
				className
			)}
		>
			<div className="min-w-0 flex-1">
				{typeof label === "string" ? (
					<Label
						id={resolvedLabelId ?? `label-${label}`}
						htmlFor={htmlFor}
						className="text-small text-txt-100"
					>
						{label}
					</Label>
				) : (
					label
				)}
				{help ? (
					<p className="mt-s-100 text-tiny text-txt-300">{help}</p>
				) : null}
			</div>
			<div
				className={cn(
					"w-full sm:w-64 sm:shrink-0",
					controlAlign === "end" && "flex justify-end"
				)}
			>
				{children}
			</div>
		</div>
	)
}

export { SettingsField }
