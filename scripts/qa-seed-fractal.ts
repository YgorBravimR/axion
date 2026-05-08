import "dotenv/config"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

const main = async () => {
	const accountRows = await sql`
		SELECT a.id, a.name, a.account_start_year, a.account_start_month
		FROM trading_accounts a
		WHERE a.name = 'TESTING'
		LIMIT 1
	`
	if (accountRows.length === 0) {
		console.error("TESTING account not found")
		process.exit(1)
	}
	const account = accountRows[0]
	console.log("Account:", account)

	await sql`
		UPDATE trading_accounts
		SET account_start_month = 1, account_start_year = 2026
		WHERE id = ${account.id}
	`
	console.log("Account start set to 2026-01")

	const yearRows = await sql`
		SELECT id FROM yearly_plans
		WHERE account_id = ${account.id} AND year = 2026
		LIMIT 1
	`
	if (yearRows.length === 0) {
		console.error("yearly_plan 2026 not found")
		process.exit(1)
	}
	const yearlyPlanId = yearRows[0].id

	const monthRows = await sql`
		SELECT mp.id, mp.month
		FROM monthly_plan mp
		JOIN quarterly_plan qp ON qp.id = mp.quarterly_plan_id
		WHERE qp.yearly_plan_id = ${yearlyPlanId}
		ORDER BY mp.month
	`
	console.log(`monthly_plan rows: ${monthRows.length}`)

	const janMonth = monthRows.find((m) => m.month === 1)
	const mayMonth = monthRows.find((m) => m.month === 5)

	if (janMonth) {
		const janWeeks = await sql`
			SELECT id, iso_week FROM weekly_plan WHERE monthly_plan_id = ${janMonth.id} ORDER BY iso_week
		`
		console.log(`Jan weeks: ${janWeeks.length}`)
		for (const [i, wk] of janWeeks.entries()) {
			if (i === 0) {
				await sql`UPDATE weekly_plan SET target_r = '2.00', actual_r = '1.50' WHERE id = ${wk.id}`
			} else {
				await sql`UPDATE weekly_plan SET target_r = '2.00', actual_r = NULL WHERE id = ${wk.id}`
			}
		}
		console.log("Jan: targetR=2.00 all, actualR=1.50 on week 1")
	}

	if (mayMonth) {
		const mayWeeks = await sql`
			SELECT id, iso_week FROM weekly_plan WHERE monthly_plan_id = ${mayMonth.id} ORDER BY iso_week
		`
		console.log(`May weeks: ${mayWeeks.length}`)
		for (const wk of mayWeeks) {
			await sql`UPDATE weekly_plan SET target_r = '2.00' WHERE id = ${wk.id}`
		}
		console.log("May: targetR=2.00 all weeks")
	}

	for (const monthInt of [1, 2]) {
		const monthDate = `2026-${String(monthInt).padStart(2, "0")}-01`
		const exists = await sql`
			SELECT id FROM monthly_tax_ledger
			WHERE account_id = ${account.id} AND month = ${monthDate}
			LIMIT 1
		`
		if (exists.length === 0) {
			const grossGain = monthInt === 1 ? 50000 : 80000
			const irs = monthInt === 1 ? 7500 : 12000
			const darfStatus = monthInt === 1 ? "paid" : "pending"
			const paidAmount = monthInt === 1 ? irs : null
			const paidAt = monthInt === 1 ? "2026-02-20" : null
			await sql`
				INSERT INTO monthly_tax_ledger (
					account_id, month,
					gross_gain_cents, total_tx_corretagem_cents, total_tx_registro_cents,
					total_emolumentos_cents, total_iss_cents, total_fees_cents,
					total_contracts_executed,
					net_gain_before_carryover_cents, taxable_gain_cents, ir_gross_cents,
					darf_due_cents, darf_status, darf_due_date, darf_paid_at, darf_paid_amount_cents,
					net_liquid_cents, is_dirty, computed_at, trade_count,
					created_at, updated_at
				) VALUES (
					${account.id}, ${monthDate},
					${grossGain}, 100, 50, 50, 0, 200,
					'10.0000',
					${grossGain - 200}, ${grossGain - 200}, ${irs},
					${irs}, ${darfStatus}, ${`2026-${String(monthInt + 1).padStart(2, "0")}-20`}, ${paidAt}, ${paidAmount},
					${grossGain - 200 - irs}, false, NOW(), 5,
					NOW(), NOW()
				)
			`
			console.log(`Inserted tax ledger ${monthDate}`)
		} else {
			console.log(`Tax ledger ${monthDate} already exists`)
		}
	}

	console.log("DONE")
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
