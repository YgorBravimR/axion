// Single source of truth for weekday name keys. English literals are i18n keys
// resolved on the client via `analytics.time.dayNames.{key}`. Indexed by JS
// `Date#getDay()` / `getUTCDay()` convention: 0 = Sunday … 6 = Saturday.

export const DAY_NAME_KEYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const satisfies readonly [
	string,
	string,
	string,
	string,
	string,
	string,
	string,
]

// Lowercase variant for translation keys (e.g. `analytics.daysTranslation.monday`).
export const DAY_NAME_KEYS_LOWER = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const satisfies readonly [
	string,
	string,
	string,
	string,
	string,
	string,
	string,
]

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type DayNameKey = (typeof DAY_NAME_KEYS)[DayOfWeek]
export type DayNameKeyLower = (typeof DAY_NAME_KEYS_LOWER)[DayOfWeek]

export const isDayOfWeek = (n: number): n is DayOfWeek =>
	Number.isInteger(n) && n >= 0 && n <= 6

const assertDayOfWeek = (dayOfWeek: number): DayOfWeek => {
	if (!isDayOfWeek(dayOfWeek)) {
		throw new Error(`Invalid dayOfWeek: ${dayOfWeek}`)
	}
	return dayOfWeek
}

// Boundary validators: throw on invalid input rather than returning undefined.
// Use at every site where a weekday number meets a weekday-name-keyed lookup.
export const dayNameKey = (dayOfWeek: number): DayNameKey =>
	DAY_NAME_KEYS[assertDayOfWeek(dayOfWeek)]

export const dayNameKeyLower = (dayOfWeek: number): DayNameKeyLower =>
	DAY_NAME_KEYS_LOWER[assertDayOfWeek(dayOfWeek)]
