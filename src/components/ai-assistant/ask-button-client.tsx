"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NarratorPanel } from "./narrator-panel"

interface AskButtonClientProps {
	surface: string
	contextRefId: string
}

const AskButtonClient = ({
	surface,
	contextRefId,
}: AskButtonClientProps): React.ReactElement => {
	const t = useTranslations("assistant")
	const [open, setOpen] = useState(false)

	return (
		<>
			<Button
				id="ai-assistant-ask-button"
				type="button"
				size="sm"
				variant="outline"
				onClick={() => setOpen(true)}
				data-testid="ai-assistant-ask-button"
				data-surface={surface}
				data-context-ref-id={contextRefId}
				className="gap-2"
			>
				<Sparkles className="h-4 w-4" />
				{t("trigger.label")}
			</Button>

			{open ? (
				<NarratorPanel
					open={open}
					onOpenChange={setOpen}
					surface={surface}
					contextRefId={contextRefId}
				/>
			) : null}
		</>
	)
}

export { AskButtonClient }
export type { AskButtonClientProps }
