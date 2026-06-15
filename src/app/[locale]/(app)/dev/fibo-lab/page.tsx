import { loadHawksEngineLabData } from "@/app/actions/hawks-engine-lab-data"
import { FiboLab } from "@/components/dev/fibo-lab"
import { requireRole } from "@/lib/auth-utils"

// Restricted 5-day window for focused Fibo anchor validation. Pulls
// only the days Ygor wants to scrub in the 2026-06-15 session: a clean
// canvas with no engine clutter, only candles + fibo overlays.
const FIBO_DAYS = [
	"2026-05-11",
	"2026-05-12",
	"2026-05-13",
	"2026-05-14",
	"2026-05-15",
	"2026-05-18",
	"2026-05-19",
	"2026-05-20",
	"2026-05-21",
	"2026-05-22",
] as const

const FROM = FIBO_DAYS[0]!
const TO = FIBO_DAYS[FIBO_DAYS.length - 1]!

const FiboLabPage = async () => {
	await requireRole("admin")
	const data = await loadHawksEngineLabData(FROM, TO)
	const days = data.days.filter((d) =>
		(FIBO_DAYS as ReadonlyArray<string>).includes(d.dayKey)
	)

	return (
		<div className="h-screen w-full">
			<FiboLab days={days} from={FROM} to={TO} />
		</div>
	)
}

export { FiboLabPage as default }
