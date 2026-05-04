/**
 * CLI runner for fractal plan trade backfill.
 *
 * Usage:
 *   bun run scripts/fractal-plan-backfill.ts --account-id=<uuid>
 *   bun run scripts/fractal-plan-backfill.ts --account-id=<uuid> --dry-run
 */
import { backfillTradesForAccount } from "@/lib/fractal-plan/backfill-trades"

const args = process.argv.slice(2)
const accountIdArg = args.find((a) => a.startsWith("--account-id="))
const dryRun = args.includes("--dry-run")

if (!accountIdArg) {
	console.error("Missing --account-id=<uuid>")
	process.exit(1)
}
const accountId = accountIdArg.split("=")[1]

const main = async () => {
	console.log(JSON.stringify({ accountId, dryRun, status: "starting" }, null, 2))
	const result = await backfillTradesForAccount({ accountId, dryRun })
	console.log(JSON.stringify({ accountId, dryRun, ...result }, null, 2))
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
