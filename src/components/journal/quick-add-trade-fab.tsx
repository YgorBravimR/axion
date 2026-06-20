"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QuickAddTradeModal } from "./quick-add-trade-modal"
import type { Asset } from "@/db/schema"

interface QuickAddTradeFabProps {
	availableAssets: Asset[]
	lastAsset?: string
	lastDirection?: "long" | "short"
}

export const QuickAddTradeFab = ({
	availableAssets,
	lastAsset,
	lastDirection,
}: QuickAddTradeFabProps) => {
	const [isOpen, setIsOpen] = useState(false)
	const t = useTranslations("journal")

	return (
		<>
			<Button
				id="quick-add-fab"
				onClick={() => setIsOpen(true)}
				className="fixed right-8 bottom-8 h-14 w-14 rounded-full shadow-lg hover:shadow-xl"
				aria-label={t("quickAddTradeAriaLabel")}
			>
				<Plus className="h-6 w-6" />
			</Button>

			<QuickAddTradeModal
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				availableAssets={availableAssets}
				lastAsset={lastAsset}
				lastDirection={lastDirection}
			/>
		</>
	)
}
