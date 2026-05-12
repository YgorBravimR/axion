"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/routing"
import { Plus, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { StrategyCard, ComplianceDashboard } from "@/components/playbook"
import { DeleteConfirmDialog } from "@/components/playbook/delete-confirm-dialog"
import { deleteStrategy } from "@/app/actions/strategies"
import type {
	StrategyWithStats,
	ComplianceOverview,
} from "@/app/actions/strategies.types"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { playbookGuide } from "@/components/ui/page-guide/guide-configs/playbook"

interface PlaybookContentProps {
	initialStrategies: StrategyWithStats[]
	initialCompliance: ComplianceOverview | null
}

export const PlaybookContent = ({
	initialStrategies,
	initialCompliance,
}: PlaybookContentProps) => {
	const t = useTranslations("playbook")
	const tActions = useTranslations("playbook.actions")
	const router = useRouter()
	const { showToast } = useToast()
	useRegisterPageGuide(playbookGuide)
	const [strategies, setStrategies] =
		useState<StrategyWithStats[]>(initialStrategies)
	const [compliance, setCompliance] = useState<ComplianceOverview | null>(
		initialCompliance
	)
	const [deleteTarget, setDeleteTarget] = useState<StrategyWithStats | null>(
		null
	)
	const [isPending, startTransition] = useTransition()

	// Reset state when initial props change (e.g., account switch)
	useEffect(() => {
		setStrategies(initialStrategies)
		setCompliance(initialCompliance)
	}, [initialStrategies, initialCompliance])

	const handleDelete = useCallback(
		(strategyId: string) => {
			const strategy = strategies.find((s) => s.id === strategyId)
			if (strategy) {
				setDeleteTarget(strategy)
			}
		},
		[strategies]
	)

	const handleConfirmDelete = useCallback(() => {
		if (!deleteTarget) {
			return
		}

		startTransition(async () => {
			const result = await deleteStrategy(deleteTarget.id)
			if (result.status === "success") {
				setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id))
				showToast("success", tActions("strategyDeletedPermanently"))
			} else {
				showToast("error", tActions("strategyDeleteFailed"))
			}
			setDeleteTarget(null)
		})
	}, [deleteTarget, showToast, tActions])

	const handleEdit = useCallback(
		(strategy: StrategyWithStats) => {
			router.push(`/playbook/${strategy.id}/edit`)
		},
		[router]
	)

	const handleCancelDelete = useCallback(() => setDeleteTarget(null), [])

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Compliance Overview */}
			<ComplianceDashboard data={compliance} />

			{/* Strategy List */}
			<div
				id="playbook-strategies"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<div className="gap-s-300 flex flex-wrap items-center justify-between">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("yourStrategies")}
					</h2>
					<Button id="playbook-new-strategy" asChild>
						<Link href="/playbook/new">
							<Plus className="mr-s-200 h-4 w-4" aria-hidden="true" />
							{t("newStrategy")}
						</Link>
					</Button>
				</div>

				{strategies.length === 0 ? (
					<div className="mt-m-400 sm:mt-m-500 py-l-700 flex flex-col items-center justify-center text-center">
						<BookOpen
							className="text-txt-300 mb-m-400 h-10 w-10"
							aria-hidden="true"
						/>
						<p className="text-body text-txt-200 font-medium">
							{t("noStrategies")}
						</p>
						<p className="text-small text-txt-300 mt-s-200 max-w-xs">
							{t("noStrategiesHint")}
						</p>
						<Button id="playbook-add-strategy" className="mt-m-500" asChild>
							<Link href="/playbook/new">
								<Plus className="mr-s-200 h-4 w-4" aria-hidden="true" />
								{t("addStrategy")}
							</Link>
						</Button>
					</div>
				) : (
					<div className="mt-m-400 sm:mt-m-500 gap-s-300 sm:gap-m-400 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
						{strategies.map((strategy) => (
							<StrategyCard
								key={strategy.id}
								strategy={strategy}
								onEdit={handleEdit}
								onDelete={handleDelete}
							/>
						))}
					</div>
				)}
			</div>

			{/* Delete Confirmation Dialog */}
			{deleteTarget && (
				<DeleteConfirmDialog
					strategyName={deleteTarget.name}
					strategyCode={deleteTarget.code}
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
					isPending={isPending}
				/>
			)}
		</div>
	)
}
