"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/routing"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StrategyCard, ComplianceDashboard } from "@/components/playbook"
import { DeleteConfirmDialog } from "@/components/playbook/delete-confirm-dialog"
import { deleteStrategy } from "@/app/actions/strategies"
import type {
	StrategyWithStats,
	ComplianceOverview,
} from "@/app/actions/strategies"

interface PlaybookContentProps {
	initialStrategies: StrategyWithStats[]
	initialCompliance: ComplianceOverview | null
}

export const PlaybookContent = ({
	initialStrategies,
	initialCompliance,
}: PlaybookContentProps) => {
	const t = useTranslations("playbook")
	const router = useRouter()
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

	const handleDelete = (strategyId: string) => {
		const strategy = strategies.find((s) => s.id === strategyId)
		if (strategy) {
			setDeleteTarget(strategy)
		}
	}

	const handleConfirmDelete = () => {
		if (!deleteTarget) return

		startTransition(async () => {
			const result = await deleteStrategy(deleteTarget.id)
			if (result.status === "success") {
				setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id))
			}
			setDeleteTarget(null)
		})
	}

	const handleEdit = (strategy: StrategyWithStats) => {
		router.push(`/playbook/${strategy.id}/edit`)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Compliance Overview */}
			<ComplianceDashboard data={compliance} />

			{/* Strategy List */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("yourStrategies")}
					</h2>
					<Link href="/playbook/new">
						<Button id="playbook-new-strategy">
							<Plus className="mr-2 h-4 w-4" />
							{t("newStrategy")}
						</Button>
					</Link>
				</div>

				{strategies.length === 0 ? (
					<div className="mt-m-400 sm:mt-m-500 py-l-700 flex flex-col items-center justify-center text-center">
						<p className="text-body text-txt-200">{t("noStrategies")}</p>
						<p className="text-small text-txt-300 mt-s-200">
							{t("noStrategiesHint")}
						</p>
						<Link href="/playbook/new">
							<Button
								id="playbook-add-strategy"
								variant="outline"
								className="mt-m-500"
							>
								<Plus className="mr-2 h-4 w-4" />
								{t("addStrategy")}
							</Button>
						</Link>
					</div>
				) : (
					<div className="mt-m-400 sm:mt-m-500 gap-s-300 sm:gap-m-400 grid grid-cols-1 lg:grid-cols-2">
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
					onCancel={() => setDeleteTarget(null)}
					isPending={isPending}
				/>
			)}
		</div>
	)
}
