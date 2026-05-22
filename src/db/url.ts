// Decides which Drizzle driver flavor to use for a given DATABASE_URL.
//
// Production / staging are on Neon, which speaks HTTPS via the
// `@neondatabase/serverless` family (drizzle-orm/neon-http + neon-serverless).
// Worktrees and any future self-hosted Postgres point at a regular Postgres
// host that speaks the native wire protocol — those use `postgres` (postgres-js)
// with drizzle-orm/postgres-js.
//
// Match is anchored to `@…neon.tech` so an unrelated URL whose username or
// password happens to contain "neon" doesn't get misrouted.
export const isNeonUrl = (url: string): boolean =>
	/@[^/]*\.neon\.tech/i.test(url)
