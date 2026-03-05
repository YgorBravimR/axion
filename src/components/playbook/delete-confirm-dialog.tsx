"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

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
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-m-400">
			<div className="border-bg-300 bg-bg-200 w-full max-w-md rounded-lg border p-m-400 sm:p-m-500 lg:p-m-600 shadow-xl">
				<div className="flex items-start gap-m-400">
					<div className="bg-fb-error/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
						<AlertTriangle className="text-fb-error h-5 w-5" />
					</div>
					<div>
						<h3 className="text-body text-txt-100 font-semibold">
							Deactivate Strategy
						</h3>
						<p className="text-small text-txt-200 mt-s-200">
							Are you sure you want to deactivate{" "}
							<span className="bg-bg-300 rounded px-s-100 font-mono text-tiny">
								{strategyCode}
							</span>{" "}
							<span className="font-medium">{strategyName}</span>?
						</p>
						<p className="text-tiny text-txt-300 mt-s-200">
							This will hide the strategy from your playbook. Existing trades linked to this strategy will not be affected.
						</p>
					</div>
				</div>

				<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600 flex justify-end gap-s-300">
					<Button
					id="playbook-delete-cancel"
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
					id="playbook-delete-confirm"
						type="button"
						variant="destructive"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Deactivating..." : "Deactivate"}
					</Button>
				</div>
			</div>
		</div>
	)
}
