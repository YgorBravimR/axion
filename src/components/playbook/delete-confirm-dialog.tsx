"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DeleteConfirmDialogProps {
	strategyName: string
	strategyCode: string
	onConfirm: () => void
	onCancel: () => void
	isPending: boolean
}

export const DeleteConfirmDialog = ({
	strategyName,
	strategyCode,
	onConfirm,
	onCancel,
	isPending,
}: DeleteConfirmDialogProps) => {
	const t = useTranslations("playbook.deactivate")
	const tCommon = useTranslations("common")

	return (
		<AlertDialog open onOpenChange={(open) => { if (!open && !isPending) onCancel() }}>
			<AlertDialogContent className="min-w-0">
				<AlertDialogHeader>
					<AlertDialogMedia className="bg-fb-error/20">
						<AlertTriangle className="text-fb-error h-5 w-5" />
					</AlertDialogMedia>
					<AlertDialogTitle>{t("title")}</AlertDialogTitle>
					<AlertDialogDescription className="break-words min-w-0">
						{t("description", { code: strategyCode, name: strategyName })}
					</AlertDialogDescription>
					<p className="text-tiny text-txt-300 mt-s-200">
						{t("warning")}
					</p>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel
						id="playbook-delete-cancel"
						disabled={isPending}
					>
						{tCommon("cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						id="playbook-delete-confirm"
						variant="destructive"
						onClick={(event) => {
							event.preventDefault()
							onConfirm()
						}}
						disabled={isPending}
					>
						{isPending ? t("deactivating") : t("confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
