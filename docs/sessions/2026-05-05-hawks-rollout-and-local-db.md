# Session — 2026-05-05 — Hawks Mode rollout finish + local Postgres dev

Branch: `feat/hawks-mode-rollout` (renamed from `brief-blackberry`).
Stack touched: Next.js 16 App Router, Drizzle ORM, Neon HTTP / node-postgres, next-intl, Tailwind v4 tokens.

---

## 1. Premises going in

### 1.1 Architectural

- **No parallel routes.** Hawks Mode must embed into existing surfaces (`/journal`, `/playbook`, `/command-center`, `/settings`, `/analytics`). Three exceptions are additive content, not duplicates: `/hawks/learning`, `/hawks/mentor`, `/hawks/analytics`.
- **Per-account scope.** Hawks state lives in `accountModes` row (one per `tradingAccount`). A trader can run Hawks on a prop account while keeping a personal account in default mode.
- **Marker-prefix idempotence.** Seeded rows are tagged with `HWK_*` codes (strategies) and `Hawks *` names (tags, checklists). Activation upserts; deactivation removes only marker-prefixed rows. User-authored playbook entries are never touched.
- **Single boolean plumbing.** `isHawksActive` flows from `command-center/page.tsx` (server) through children as a prop. No global context, no client-side fetch on mount, no parallel store.

### 1.2 Methodology (Pedro Palmezani)

- 24 scenarios → 24 setup tags + 5 mistake tags (24 + 5 = 29 Hawks-managed tags).
- Daily trade cap = 3 (enforced via `monthlyPlans.maxDailyTrades`).
- Cascade stop-day rule: −5R single trade *or* −10R cumulative.
- Method 3 stop trail: stop never moves against the position. Violations recorded in `hawksStopAudit`.
- Triple-screen confirmation: Renko 60min direction + MACD 27/117/55 + EMA 27/55 stack + VWAP respected + ajuste D−1 respected.

### 1.3 Code conventions (project)

- Tabs, not spaces.
- Arrow functions, named exports only (no `default`).
- TypeScript strict; never `any`.
- Tailwind v4 custom token namespaces — `acc-100`, `bg-100`, `text-txt-200`, `space-y-m-500`, etc. No raw hex.
- React: import named utilities directly (no `import * as React`).
- Bold reserved for major emphasis only.

---

## 2. What was built this session

### 2.1 Hawks visual integration (commit `65c5f8a`)

Plumbed `isHawksActive` through command-center surfaces and added gold-accent affordances:

| Component | Effect when Hawks active |
| --- | --- |
| `circuit-breaker-panel.tsx` | Gold banner above metrics: "stop the day at −5R single trade or −10R cumulative." |
| `daily-checklist.tsx` | Gold ring on the "Hawks — Viés diário (60min)" checklist row |
| `bias-selector.tsx` | Gold ring + Hawks aria-label for bias dropdown per asset |
| `asset-rules-panel.tsx` | Forwards `isHawks` to both `BiasSelector` instances |
| `checklist-manager.tsx` | Locked-hint banner when editing a Hawks-managed checklist |

i18n keys added under `hawksMode.bias.hawksAriaLabel`, `hawksMode.circuitBreaker.cascadeHint`, `hawksMode.checklistManager.hawksLockedHint` (en + pt-BR).

### 2.2 DB-drift hotfix (commit `594e6ae`)

**Problem.** Hawks activation 500'd: `column "target_r_multiple" of relation "strategies" does not exist`. Shared Neon DB had been migrated forward by cousin branch (`feat/yearly-tax-reporting`) which dropped `targetRMultiple` in favor of an R-template suite (`stop_r`, `partial_r`, `partial_proportion`, `final_r`, `protection_r`, `default_instrument_symbol`). Branch `brief-blackberry` was 10 migrations behind.

**Fix.** Surgical drop of `targetRMultiple` from the Hawks strategy *seed insert payload* (`src/lib/hawks/activate-mode.ts`) and from the `HawksSeedStrategy` type + 5 strategy entries (`src/lib/hawks/seed-data.ts`). Drizzle only emits explicitly-passed columns in INSERTs, so the dropped column no longer appears in SQL. Schema-level drift remains for other paths but Hawks activation succeeds.

### 2.3 Local Postgres dev support (commit `242ff61`)

User moved off the shared Neon DB to a local Postgres at `postgresql://postgres:postgres@localhost:5438/main` (PG17). Two blockers:

1. **drizzle-kit refused to migrate** — `@neondatabase/serverless` is HTTP-only, won't speak Postgres wire protocol. Resolution: install `pg` + `@types/pg`. drizzle-kit auto-picks `node-postgres` driver when `pg` is present.
2. **Runtime driver couldn't connect.** Resolution: dual-driver pattern.

**Files:**

- `src/db/local-url.ts` (NEW) — single source of truth for URL classification:

  ```ts
  const isLocalUrl = (url: string): boolean => {
      if (!url) return false
      if (url.includes("neon.tech") || url.startsWith("https://")) return false
      return url.includes("localhost")
        || url.includes("127.0.0.1")
        || url.startsWith("postgresql://postgres:")
  }
  ```

- `src/db/drizzle.ts` — runtime now branches on URL:
  - Local → `drizzle(pg.Pool)` from `drizzle-orm/node-postgres`
  - Remote → `drizzle(url)` from `drizzle-orm/neon-http`
  - Cast back to neon-http return type so existing consumers (`db.query.x`, `db.insert(...)`) keep their type signatures unchanged.

- `scripts/_db-adapter.ts` (NEW) — shared helper for seed scripts that use `neon()` template-tag syntax. Returns `{sql, db, close}`. The `sql` shim translates `sql\`SELECT ${x}\`` → `pool.query("SELECT $1", [x])` for local Postgres.

- `scripts/seed.ts` — swapped `import { neon } from "@neondatabase/serverless"` for the adapter; calls `await close()` at end. Other seed scripts (`seed-hawks-global`, `seed-playbooks-tags`, `seed-analytical-tags`) still use neon directly — port on demand.

**Verified.** All 28 migrations applied to local. Seed completed (admin user + 3 accounts + strategies + tags + settings). App returns 200 on `/en/login`.

### 2.4 pnpm-only enforcement (commit `7089ac0`)

Bun migration during install was a wrong call. Reverted to pnpm-only:

- Deleted `bun.lock`.
- Added `preinstall` script: `npx -y only-allow pnpm` — aborts non-pnpm installs before any deps land.
- Added `engines` sentinels for `npm`, `yarn`, `bun` with junk version values so engine checks fail too. Belt-and-suspenders.
- Resynced `pnpm-lock.yaml` with `pg` + `@types/pg`.
- `packageManager: "pnpm@10.30.3"` retained.

### 2.5 Branch hygiene

- Renamed `brief-blackberry` → `feat/hawks-mode-rollout` (matches majority of branch commits).
- Pushed new name, deleted old remote branch.

---

## 3. Learnings (durable)

### 3.1 Drizzle behavior

- **Drizzle INSERT only emits explicitly-passed columns.** This makes surgical column-drop fixes possible without touching `schema.ts` — useful when DB has drifted ahead of code.
- **drizzle-kit driver detection.** With `dialect: "postgresql"`, drizzle-kit picks `pg` if installed, otherwise falls back to `@neondatabase/serverless`. Neon driver refuses to migrate against plain Postgres.

### 3.2 Neon vs node-postgres

- **`@neondatabase/serverless` HTTP driver speaks HTTPS-over-Neon-edge only.** It cannot connect to vanilla Postgres on a TCP socket without a wsproxy. For local dev: swap to `node-postgres` or run a Neon proxy container.
- **URL sniffing keeps prod untouched.** Detecting `localhost` / `127.0.0.1` / `postgresql://postgres:` in the connection string lets the same codebase use the edge driver in production and the TCP driver locally — no env flag, no build step.
- **Type erasure via cast.** Both drivers return Drizzle clients with overlapping but not identical type unions. Casting the union back to the neon-http return type keeps consumer call sites stable. Acceptable because the runtime API surface (`db.query.*`, `db.insert(...)`, `db.select(...)`) is identical.

### 3.3 Tagged-template SQL shim

- `neon(url)` returns a tagged-template function: `sql\`SELECT ${x} FROM y\`` runs over Neon's HTTP API.
- For pg.Pool, the equivalent shim walks `strings: TemplateStringsArray` interleaved with `values: unknown[]`, building a parametrized query (`SELECT $1 FROM y`) and calling `pool.query(text, values)`. Returns `result.rows` to match neon's return shape.

### 3.4 DB drift on shared Neon

- Multiple worktrees pointing at the same Neon DB means migrations on one branch affect *all* branches' runtime queries.
- Symptoms: SELECTs return shape that doesn't match `schema.ts`, INSERTs fail on dropped columns, FK errors when a referenced table changes.
- Mitigation: each branch on its own DB (this session's path), or strict migration coordination, or a per-branch Neon child branch.

### 3.5 Package-manager lockdown

- `only-allow pnpm` (small package, no deps) hooks `preinstall` and detects manager via `npm_config_user_agent`.
- `engines` field accepts arbitrary version strings — junk values like `"please-use-pnpm"` make engine checks fail with a readable error for npm/yarn/bun.
- Combine both: belt-and-suspenders. One blocks before deps install, the other blocks even if `--ignore-scripts` is passed.

---

## 4. Open items

- Other seed scripts (`seed-hawks-global`, `seed-playbooks-tags`, `seed-analytical-tags`, etc.) still import `neon` directly. Port to `getScriptDb()` if/when they need to run against local.
- Branch is still 10 migrations behind cousin branch `feat/yearly-tax-reporting`. With the local DB switch this is no longer a runtime hazard, but merge-time conflicts are still pending.
- Trade seeding loop in `scripts/seed.ts` produces 0 trades silently — cosmetic for current Hawks testing but worth chasing.
- Origin remote URL still points at old `profitJournal.git` redirect. Run `git remote set-url origin https://github.com/YgorBravimR/axion.git` to skip the redirect.

---

## 5. Commit log (this session)

```
242ff61 feat(db): dual-driver support for local Postgres dev
7089ac0 chore: enforce pnpm-only, sync lockfile with pg deps
```

Earlier same-branch Hawks work referenced for context:

```
594e6ae fix(hawks): drop targetRMultiple from strategy seed (column removed in DB)
65c5f8a feat(hawks): visually integrate Hawks Mode in command-center surfaces
2337d52 feat(hawks): admin calibration form + drop duplicate hawksDailyBias
80bf999 refactor(hawks): consolidate into existing surfaces, drop duplicate features
```
