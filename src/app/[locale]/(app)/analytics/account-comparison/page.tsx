import { setRequestLocale } from "next-intl/server"
import { requireAuth, getUserAccounts } from "@/app/actions/auth"
import { AccountComparisonContent } from "@/components/account-comparison"

interface AccountComparisonPageProps {
	params: Promise<{ locale: string }>
}

const AccountComparisonPage = async ({
	params,
}: AccountComparisonPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	// Run auth check and account fetch in parallel — requireAuth uses React.cache()
	// so the auth() call inside getUserAccounts is deduplicated within this request.
	const [, accounts] = await Promise.all([requireAuth(), getUserAccounts()])

	const accountOptions = accounts.map((a) => ({
		id: a.id,
		name: a.name,
		accountType: a.accountType,
	}))

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<AccountComparisonContent accounts={accountOptions} />
			</div>
		</div>
	)
}

export { AccountComparisonPage as default }
