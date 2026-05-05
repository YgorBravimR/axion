/**
 * Returns true when the DATABASE_URL points at a local Postgres instance
 * (localhost / 127.0.0.1, or a plain postgresql://postgres: URL that lacks
 * a Neon hostname). Used to select the correct Drizzle driver at startup.
 */
const isLocalUrl = (url: string): boolean => {
	if (!url) return false
	if (url.includes("neon.tech") || url.startsWith("https://")) return false
	return url.includes("localhost") || url.includes("127.0.0.1") || url.startsWith("postgresql://postgres:")
}

export { isLocalUrl }
