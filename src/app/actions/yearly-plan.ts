"use server"

import type { ActionResponse } from "@/types"

/**
 * @deprecated Phase 4b: capital is now sourced exclusively from
 * `yearly_plans.initialCapitalCents` + `accountCapitalEvents` ledger. The
 * legacy `monthlyRiskConfig.accountBalance` (encrypted) has been retired.
 * This export is preserved as a no-op until the existence test is removed.
 */
export const syncCapitalBetweenPlans = async (
	_id: string,
	_source: "monthly" | "yearly"
): Promise<ActionResponse<void>> => {
	return {
		status: "success",
		message:
			"syncCapitalBetweenPlans is deprecated — capital lives on yearly_plans",
		data: undefined,
	}
}
