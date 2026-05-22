"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"
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
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					id="delete-trade-button"
					variant="outline"
					className="text-fb-error hover:bg-fb-error/10 hover:text-fb-error"
				>
					<Trash2 className="mr-s-200 h-4 w-4" />
					{tCommon("delete")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("title")}</AlertDialogTitle>
					<AlertDialogDescription>{t("description")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel id="delete-trade-cancel" disabled={isDeleting}>
						{tCommon("cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						id="delete-trade-confirm"
						className="bg-fb-error hover:bg-fb-error/90"
						onClick={(e) => {
							e.preventDefault()
							void handleDelete()
						}}
						disabled={isDeleting}
					>
						{isDeleting ? (
							<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
						) : (
							tCommon("delete")
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
