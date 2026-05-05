-- Phase 2 of fee-config unification.
-- Backfill account_fee_rates with NULL-symbol default rows for any account that
-- has no rows yet. Uses B3 typical defaults from asset-defaults.ts so trade
-- insertion (which now reads from account_fee_rates) doesn't zero-out
-- commissions for accounts configured only via legacy defaultCommission/defaultFees.
--
-- Idempotent: WHERE NOT EXISTS guard means re-running produces no inserts.

INSERT INTO account_fee_rates (
    account_id,
    asset_symbol,
    tx_corretagem_cents,
    tx_registro_cents,
    emolumentos_cents,
    iss_rate_percent,
    irrf_rate_bps,
    ir_rate_bps,
    subject_to_personal_ir
)
SELECT
    ta.id,
    NULL,
    5,
    74,
    40,
    '5.00',
    100,
    2000,
    true
FROM trading_accounts ta
WHERE NOT EXISTS (
    SELECT 1 FROM account_fee_rates afr
    WHERE afr.account_id = ta.id
);
