import { RenkoSizesTable } from "@/components/dev/renko-sizes-table"
import {
	currentWeekAnchor,
	listHawksRenkoSizes,
} from "@/app/actions/hawks-renko"
import { requireRole } from "@/lib/auth-utils"

const RenkoSizesPage = async () => {
	await requireRole("admin")
	const [rows, anchor] = await Promise.all([
		listHawksRenkoSizes("WIN"),
		currentWeekAnchor(),
	])

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-screen-2xl">
			<RenkoSizesTable rows={rows} currentWeek={anchor} />
		</div>
	)
}

export { RenkoSizesPage as default }
