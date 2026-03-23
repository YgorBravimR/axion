import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import { getUserAccounts } from "@/app/actions/auth"
import { AccountComparisonContent } from "@/components/account-comparison"


interface AccountComparisonPageProps {
	params: Promise<{ locale: string }>
}

const AccountComparisonPage = async ({
	params,
}: AccountComparisonPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	// Auth + admin guard
	await requireAuth()
	await requireRole("admin")

	const accounts = await getUserAccounts()

	const accountOptions = accounts.map((a) => ({
		id: a.id,
		name: a.name,
		accountType: a.accountType,
	}))

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<AccountComparisonContent accounts={accountOptions} />
			</div>
		</div>
	)
}

export default AccountComparisonPage
