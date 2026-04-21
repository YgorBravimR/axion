import type { ReactNode } from "react"
import { connection } from "next/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { getEffectiveDate } from "@/lib/effective-date"
import { formatDateKey } from "@/lib/dates"
import { getAccountTypeBrand } from "@/lib/account-brand"
import { EffectiveDateProvider } from "@/components/providers/effective-date-provider"
import { MCCalibrationProvider } from "@/components/providers/mc-calibration-provider"
import { AppShell } from "@/components/layout/app-shell"

interface AppLayoutProps {
	children: ReactNode
}

/** Root layout for the authenticated app shell. Resolves account, effective date, and brand context. */
const AppLayout = async ({ children }: AppLayoutProps) => {
	await connection()
	const account = await getCurrentAccount()
	const effectiveDate = getEffectiveDate(account)
	const isReplayAccount = account?.accountType === "replay"
	const replayDate = isReplayAccount ? formatDateKey(effectiveDate) : undefined
	const serverBrand = account
		? getAccountTypeBrand(account.accountType)
		: undefined

	return (
		<EffectiveDateProvider date={effectiveDate.toISOString()}>
			<MCCalibrationProvider>
				<AppShell
					isReplayAccount={isReplayAccount}
					replayDate={replayDate}
					serverBrand={serverBrand}
				>
					{children}
				</AppShell>
			</MCCalibrationProvider>
		</EffectiveDateProvider>
	)
}

export { AppLayout as default }

