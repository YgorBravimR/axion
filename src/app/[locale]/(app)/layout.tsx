import type { ReactNode } from "react"
import { connection } from "next/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { getEffectiveDate } from "@/lib/effective-date"
import { formatDateKey } from "@/lib/dates"
import { getAccountTypeBrand } from "@/lib/account-brand"
import { getActiveAccountModeForUser } from "@/lib/hawks/account-context"
import { AccountModeProvider } from "@/components/providers/account-mode-provider"
import { EffectiveDateProvider } from "@/components/providers/effective-date-provider"
import { MCCalibrationProvider } from "@/components/providers/mc-calibration-provider"
import { AppShell } from "@/components/layout/app-shell"

interface AppLayoutProps {
	children: ReactNode
}

/** Root layout for the authenticated app shell. Resolves account, effective date, and brand context. */
const AppLayout = async ({ children }: AppLayoutProps) => {
	await connection()
	const [account, accountMode] = await Promise.all([
		getCurrentAccount(),
		getActiveAccountModeForUser(),
	])
	const effectiveDate = getEffectiveDate(account)
	const isReplayAccount = account?.accountType === "replay"
	const replayDate = isReplayAccount ? formatDateKey(effectiveDate) : undefined
	const serverBrand = account
		? getAccountTypeBrand(account.accountType)
		: undefined
	const nowIso = new Date().toISOString()

	return (
		<AccountModeProvider mode={accountMode}>
			<EffectiveDateProvider date={effectiveDate.toISOString()}>
				<MCCalibrationProvider>
					<AppShell
						isReplayAccount={isReplayAccount}
						replayDate={replayDate}
						serverBrand={serverBrand}
						nowIso={nowIso}
					>
						{children}
					</AppShell>
				</MCCalibrationProvider>
			</EffectiveDateProvider>
		</AccountModeProvider>
	)
}

export { AppLayout as default }
