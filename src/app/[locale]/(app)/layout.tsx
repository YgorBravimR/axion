import { connection } from "next/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { getEffectiveDate } from "@/lib/effective-date"
import { formatDateKey } from "@/lib/dates"
import { getAccountTypeBrand } from "@/lib/account-brand"
import { EffectiveDateProvider } from "@/components/providers/effective-date-provider"
import { AppShell } from "@/components/layout/app-shell"

interface AppLayoutProps {
	children: React.ReactNode
}

const AppLayout = async ({ children }: AppLayoutProps) => {
	await connection() // Opt into dynamic rendering — prevents prerender errors from auth()
	const account = await getCurrentAccount()
	const effectiveDate = getEffectiveDate(account)
	const isReplayAccount = account?.accountType === "replay"
	const replayDate = isReplayAccount ? formatDateKey(effectiveDate) : undefined
	const serverBrand = account
		? getAccountTypeBrand(account.accountType)
		: undefined

	return (
		<EffectiveDateProvider date={effectiveDate.toISOString()}>
			<AppShell
				isReplayAccount={isReplayAccount}
				replayDate={replayDate}
				serverBrand={serverBrand}
			>
				{children}
			</AppShell>
		</EffectiveDateProvider>
	)
}

export default AppLayout

