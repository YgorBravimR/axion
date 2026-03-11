"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { deleteTrade } from "@/app/actions/trades"

interface DeleteTradeButtonProps {
	tradeId: string
}

export const DeleteTradeButton = ({ tradeId }: DeleteTradeButtonProps) => {
	const router = useRouter()
	const { showToast } = useToast()
	const t = useTranslations("journal.delete")
	const tCommon = useTranslations("common")
	const [isDeleting, setIsDeleting] = useState(false)
	const [showConfirm, setShowConfirm] = useState(false)

	const handleDelete = async () => {
		setIsDeleting(true)
		try {
			const result = await deleteTrade(tradeId)

			if (result.status === "success") {
				showToast("success", t("success"))
				router.push("/journal")
			} else {
				showToast("error", result.message || t("failed"))
			}
		} catch {
			showToast("error", t("unexpectedError"))
		} finally {
			setIsDeleting(false)
			setShowConfirm(false)
		}
	}

	if (showConfirm) {
		return (
			<div className="flex items-center gap-s-200">
				<span className="text-small text-txt-200">{t("confirmPrompt")}</span>
				<Button
				id="delete-trade-confirm-yes"
					variant="destructive"
					size="sm"
					onClick={handleDelete}
					disabled={isDeleting}
				>
					{isDeleting ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						tCommon("yes")
					)}
				</Button>
				<Button
				id="delete-trade-confirm-no"
					variant="outline"
					size="sm"
					onClick={() => setShowConfirm(false)}
					disabled={isDeleting}
				>
					{tCommon("no")}
				</Button>
			</div>
		)
	}

	return (
		<Button
			id="delete-trade-button"
			variant="outline"
			onClick={() => setShowConfirm(true)}
			className="text-fb-error hover:bg-fb-error/10 hover:text-fb-error"
		>
			<Trash2 className="mr-2 h-4 w-4" />
			{tCommon("delete")}
		</Button>
	)
}
