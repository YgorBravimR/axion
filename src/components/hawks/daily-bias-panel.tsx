import { formatDateKey } from "@/lib/dates"
import { getServerEffectiveNow } from "@/lib/effective-date"
import {
	getActiveHawksAccount,
	getDailyHawksBias,
} from "@/lib/hawks/account-context"
import { DailyBiasForm } from "./daily-bias-form"

const DailyBiasPanel = async () => {
	const hawks = await getActiveHawksAccount()
	if (!hawks) {
		return null
	}
	const effectiveNow = await getServerEffectiveNow()
	const tradingDay = formatDateKey(effectiveNow)
	const initialBias = await getDailyHawksBias(tradingDay)

	return <DailyBiasForm tradingDay={tradingDay} initialBias={initialBias} />
}

export { DailyBiasPanel }
