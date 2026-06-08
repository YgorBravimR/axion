# Hawks — Manual Seed for Zero-to-Hero (Stage 1 walkthrough)

> Copy/paste values for manually creating **Tags**, **Trading Conditions**, and **Playbooks** through the Axion UI as a Hawks user. Use this in place of running the SQL seed scripts when you want to validate that the human flow works end-to-end.
>
> **Source of truth:** synthesized from `vault/wiki/hawks/playbook.md` §1–§10, mirrored by `scripts/seed/tags.ts`, `scripts/seed/conditions.ts`, and `scripts/seed/playbooks-hawks.ts`. Tags here are Hawks-specific (the SQL seed seeds generic setup/mistake tags — those are fine but not what a real Hawks operator would log against).
>
> **Pre-condition:** Stage 0 complete (logged in) and Stage 1 partial complete (you already have a Hawks-mode trading account, WIN + WDO assets, M5/M15/H1 timeframes, and a "Standard 1R" risk profile). This doc only covers Stage 1 steps **#4 (Tags)**, **#5 (Conditions)**, and the **"Build the Hawks playbook"** section.
>
> **Order to enter:** 1 → 2 → 3. Conditions must exist before playbooks can attach them.

---

## 1. Tags

**Where:** `Settings → Tags` → click **Add Tag** for each row.

**Form fields exposed:** `Name` (required, max 50), `Type` (setup / mistake / general), `Color` (8 preset swatches + custom hex picker), `Description` (optional, max 500).

> **Account scope.** Tags are stored per `account_id`. If you trade multiple accounts (personal + prop), repeat the list under each account you want Hawks-tagged trades in. For Zero-to-Hero, do it once in your personal Hawks-mode account.

### 1a. Setup tags — Hawks (8)

These describe **what you saw** that justified the trade. They map 1:1 to the Hawks entry matrix in playbook.md §5.

| Name                    | Type  | Color (hex) | Description                                                                                  |
| ----------------------- | ----- | ----------- | -------------------------------------------------------------------------------------------- |
| Tendência Clara (MMA)   | setup | `#10B981`   | 60min alinhado, MMA completa, pullback no 5min na EMA 27/55, triple-screen confirmado.       |
| Pullback EMA 27         | setup | `#3B82F6`   | Pullback raso até EMA 27 do 5min com candle de rejeição no MMA.                              |
| Pullback EMA 55         | setup | `#06B6D4`   | Pullback mais profundo até EMA 55 do 5min; usado quando o 60min vem mais esticado.           |
| Confluência Tripla      | setup | `#8B5CF6`   | VWAP diária + ajuste + média 60min coincidentes no mesmo preço — entrada premium.            |
| Dobra (2 gatilhos)      | setup | `#EC4899`   | Dois gatilhos coincidem no preço (média 60 + ajuste, ou média 60 + VWAP). Qualidade dobrada. |
| Virada 60min (pullback) | setup | `#F59E0B`   | 60min flip confirmado (renko close + MACD slope); entrada só após pullback estabilizar.      |
| Lateral — fade extremo  | setup | `#F97316`   | Range 60min sem renovação de topo/fundo; rejeição no extremo (doji no MMA), alvo = oposto.   |
| CT com MMA completo     | setup | `#3B82F6`   | Contra-tendência do 60min só aceita com MMA totalmente alinhado contra no 5min, lote 50%.    |

### 1b. Mistake tags — Hawks (10)

These drive the **Mistake Cost Analysis** in Reports. Be honest — this is the behavioral mirror.

| Name                     | Type    | Color (hex) | Description                                                                           |
| ------------------------ | ------- | ----------- | ------------------------------------------------------------------------------------- |
| Entrou em rompimento     | mistake | `#EF4444`   | Quebrou a regra de ouro Hawks — entrou no rompimento em vez de aguardar pullback.     |
| Stop movido contra       | mistake | `#991B1B`   | Afastou o stop do preço para "não ser stopado". Cláusula pétrea violada.              |
| Sem stop                 | mistake | `#7F1D1D`   | Operou sem stop colocado. Sentence de morte da conta.                                 |
| Preço médio              | mistake | `#B91C1C`   | Empilhou contratos contra a operação para baixar o preço médio. "Peru de Natal."      |
| Parcial sem razão        | mistake | `#F97316`   | Realizou parcial fora da regra de gestão dividida. "Massagem de ego."                 |
| Operou na tarde (>13h)   | mistake | `#FB923C`   | Entrou depois das 13h. Tarde sempre fora — liquidez baixa, expansões mortas.          |
| MMA incompleto           | mistake | `#FACC15`   | Tentou CT sem MMA totalmente alinhado contra. CT exige alinhamento completo.          |
| Operou contra 60min      | mistake | `#DC2626`   | Comprou abaixo do 60min / vendeu acima — sem CT válido. "Minha religião não permite." |
| Revenge trade            | mistake | `#7C2D12`   | Tentou recuperar perda imediatamente. Excesso de confiança = pior estado mental.      |
| Ignorou calendário macro | mistake | `#F59E0B`   | Posicionado antes de FOMC/payroll/CPI/Powell sem stop calibrado para evento.          |

### 1c. General tags — Hawks context (2)

Use these as **opt-in flags** on trades for later analytics slicing.

| Name            | Type    | Color (hex) | Description                                                            |
| --------------- | ------- | ----------- | ---------------------------------------------------------------------- |
| Pedro spot-on   | general | `#22C55E`   | Operação feita exatamente como Pedro descreveu na live do dia.         |
| Mentorado lição | general | `#6B7280`   | Trade aprendido por correção pública em live (catalogar para revisão). |

> **Sanity check after entering tags:** the Tags page should show **20 rows** for the active account (8 setup + 10 mistake + 2 general).

---

## 2. Trading Conditions

**Where:** `Settings → Conditions` → click **Add Condition** for each row.

**Form fields exposed:** `Name` (required, max 100), `Category` (indicator / price_action / market_context / custom), `Description` (optional, max 500).

> **Scope.** Conditions are **user-scoped** (not account-scoped) and are reused across every strategy you build. Enter once.
>
> Order below is the same as the SQL seed in `scripts/seed/conditions.ts` so you can cross-check.

### 2a. Indicator (6)

| Name                   | Category  | Description                                                          |
| ---------------------- | --------- | -------------------------------------------------------------------- |
| MACD slope up (5min)   | indicator | MACD line + histogram slope up on the 5min screen.                   |
| MACD slope up (15min)  | indicator | MACD line + histogram slope up on the 15min screen.                  |
| MACD slope up (60min)  | indicator | MACD line + histogram slope up on the 60min screen.                  |
| Cláudia (cloud) válida | indicator | MACD cloud structure forming Cláudia — directional cloud thickening. |
| Renko close > EMA 27   | indicator | Renko brick closes on the right side of the 27-period EMA.           |
| Renko close > EMA 55   | indicator | Renko brick closes on the right side of the 55-period EMA.           |

### 2b. Price Action (6)

| Name                    | Category     | Description                                                                   |
| ----------------------- | ------------ | ----------------------------------------------------------------------------- |
| Pullback no EMA 27      | price_action | Price pulls back to EMA 27 and rejects — entry trigger.                       |
| Pullback no EMA 55      | price_action | Price pulls back to EMA 55 and rejects — deeper retrace entry.                |
| Higher high 60min       | price_action | 60min printed a higher high than the prior swing — bullish structure.         |
| Lower low 60min         | price_action | 60min printed a lower low than the prior swing — bearish structure.           |
| NÃO entra em rompimento | price_action | Hard rule: never enter on the rompimento (break of high/low) — pullback only. |
| Doji at MMA             | price_action | Doji / reversal candle right at the MMA confluence zone.                      |

### 2c. Market Context (4)

| Name                  | Category       | Description                                                              |
| --------------------- | -------------- | ------------------------------------------------------------------------ |
| VWAP respeitado       | market_context | VWAP holding as dynamic support/resistance for the direction.            |
| Ajuste respeitado     | market_context | Previous day's ajuste (settlement) holding — confirms continuation.      |
| MMA alinhada          | market_context | MMA — Médias e MACDs Alinhados — all three timeframes pointing same way. |
| Pre-market sem evento | market_context | No FOMC, COPOM, payroll, or other macro event blocking entry.            |

### 2d. Custom (2)

| Name                    | Category | Description                                                         |
| ----------------------- | -------- | ------------------------------------------------------------------- |
| Renko semanal calibrado | custom   | Renko brick size matches this week's calibration (Monday Telegram). |
| Sem trigger emocional   | custom   | Trader not in FOMO / revenge / fatigue state — clear mind.          |

> **Sanity check after entering conditions:** the Conditions page should show **18 rows**. Confirm category filters work (6 indicator / 6 price_action / 4 market_context / 2 custom).

---

## 3. Playbooks (Strategies)

**Where:** `Playbook → New Strategy`.

**Form fields exposed:**

- `Code` (3–10 chars, uppercase — unique identifier)
- `Strategy name` (required)
- `Description` (optional, textarea)
- `Reference image` (optional — skip for now; add chart screenshots later)
- `Entry criteria` (textarea, ~5 rows)
- `Exit criteria` (textarea, ~5 rows)
- `Additional notes` (textarea, ~3 rows)
- `Risk management rules` (textarea, ~5 rows)
- `Final R` (number, e.g. 3.0)
- `Max risk per trade %` (number, e.g. 1)
- **Conditions picker** (Premium only) — select existing conditions, set tier (`mandatory` / `tier_2` / `tier_3`) and sort order. Conditions reference the entries from §2.

> **Create the 4 strategies below in order.** Skip the screenshot field on first pass; you can attach Hawks reference images from `vault/wiki/hawks/playbook.md` later.

---

### 3.1 Playbook · Tendência Clara (MMA)

**Code:** `HWK_TENDENCIA_CLARA`
**Strategy name:** `Hawks · Tendência Clara (MMA)`
**Final R:** `3.0`
**Max risk per trade %:** `1`

**Description:**

```
Mercado em tendência clara no 60min, MMA alinhada, entrada por pullback no 5min.
O setup principal da metodologia — Pedro 3x. NUNCA entra em rompimento.
```

**Entry criteria:**

```
60min com viés definido (renkoClose, MACD slope, EMA stack, VWAP, ajuste).
Espera pullback no 5min na EMA 27 ou 55. MMA alinhada nas três telas.
Triple-screen confirmado. Entra na rejeição do pullback.

Comprar — TODOS simultaneamente:
- 60min comprador (acima 27/55 exp + MACD > 0 + topos/fundos ascendentes)
- Pullback ATIVO até média ou 38.2/50/61.8% Fib
- MACD do 5min comprador
- Box 5min fecha COMPRADOR no nível
- Caminho à frente limpo (sem ajuste/VWAP/resistência próxima)

Vender = espelhado.
```

**Exit criteria:**

```
Alvo fixo +3R (Pedro pattern). Stop a -1R do entry.
Move stop a zero (BE) quando +1R favor. NUNCA move stop contra a operação.
Cabeça do Pivô → 76,4% → 100% → 161,8% (exaustão).
Trail box-a-box opcional após +3R (override Ygor): trail 2 boxes behind.
```

**Risk management rules:**

```
1R = valor do tier corrente (resolveOneR). Stop = 1R, alvo = 3R. Sem parcial.
Stop diário = capital ÷ 20 (0,5–1% do capital).
Vola dobra → contratos pela metade.
NUNCA empilhar lote para recuperar perda (preço médio = Peru de Natal).
Mão constante intraday — sem manejo de lote dentro do pregão.
```

**Additional notes:**

```
"Minha religião não permite comprar abaixo do 60min." Aplicação histórica:
2026-03-23, 2026-03-27. Confluência tripla (VWAP + ajuste + média 60min) =
entrada premium — usar variante HWK_TENDENCIA_CLARA com BE após 1 box.
```

**Conditions — Mandatory (4):**

1. `MMA alinhada` (sort 0)
2. `VWAP respeitado` (sort 1)
3. `Ajuste respeitado` (sort 2)
4. `NÃO entra em rompimento` (sort 3)

**Conditions — Tier 2 (3):**

1. `MACD slope up (5min)` (sort 100)
2. `MACD slope up (15min)` (sort 101)
3. `MACD slope up (60min)` (sort 102)

**Conditions — Tier 3 (3):**

1. `Higher high 60min` (sort 200)
2. `Cláudia (cloud) válida` (sort 201)
3. `Renko close > EMA 27` (sort 202)

---

### 3.2 Playbook · Pullback no 5min

**Code:** `HWK_PULLBACK_5M`
**Strategy name:** `Hawks · Pullback no 5min`
**Final R:** `3.0`
**Max risk per trade %:** `1`

**Description:**

```
Variação do tendência clara focada no gatilho 5min: pullback na EMA 27 (raso)
ou na EMA 55 (mais profundo) com rejeição clara. Triple-screen confirma na entrada.
```

**Entry criteria:**

```
Triple-screen alinhado (5/15/60min Renko). Aguarda pullback no 5min até
EMA 27 (setup raso) ou EMA 55 (setup profundo). Entra apenas após candle
de rejeição (doji / pin bar) no MMA. Confirma Cláudia (cloud).
```

**Exit criteria:**

```
Alvo +3R. Stop a -1R do entry (atrás do pavio do candle de rejeição se
mais conservador). BE quando +1R favor.
```

**Risk management rules:**

```
1R fixo do tier. Em mercados de alta volatilidade (Renko semanal
recalibrado intra-semana), reduzir contratos pela metade.
```

**Additional notes:**

```
Variante mais "limpa" do HWK_TENDENCIA_CLARA — use quando a entrada acontece
exclusivamente no gatilho 5min (sem confluência VWAP/ajuste). Útil em dias
de tendência clara mas sem confluências adicionais.
```

**Conditions — Mandatory (4):**

1. `MMA alinhada` (sort 0)
2. `VWAP respeitado` (sort 1)
3. `Pullback no EMA 27` (sort 2)
4. `NÃO entra em rompimento` (sort 3)

**Conditions — Tier 2 (2):**

1. `MACD slope up (5min)` (sort 100)
2. `MACD slope up (15min)` (sort 101)

**Conditions — Tier 3 (2):**

1. `Renko close > EMA 27` (sort 200)
2. `Cláudia (cloud) válida` (sort 201)

---

### 3.3 Playbook · Lateralização + Reversão

**Code:** `HWK_LATERAL_REVERSAO`
**Strategy name:** `Hawks · Lateralização + Reversão`
**Final R:** `2.0`
**Max risk per trade %:** `0.7`

**Description:**

```
60min sem renovação de topo nem fundo — mercado lateral. Fade nos extremos
da range com reversão confirmada (doji no MMA, divergência MACD). Alvo
menor (+2R) porque a estrutura não suporta 3R.
```

**Entry criteria:**

```
60min lateral (sem higher high nem lower low recentes). Preço nos extremos
da range. Doji ou reversão no MMA. VWAP atuando como mean reversion.
NÃO opera rompimento da lateral — só rejeições.
Idealmente 2 toques no topo + 2 toques no fundo confirmando a range.
```

**Exit criteria:**

```
Alvo +2R (não 3R — range não comporta). Stop a -1R. BE quando +1R favor.
Cancela operação se range é rompida no caminho — vira setup novo (volta
a usar expansão Fib).
```

**Risk management rules:**

```
1R fixo do tier. Tamanho de posição reduzido (~70% do tendência clara)
por natureza do trade ser counter-trend dentro da range.
4 toques no mesmo nível sem romper = confirma lateralidade, NÃO opera.
```

**Additional notes:**

```
Aplicação histórica: 2026-02-09 (range identificada); 2026-03-17
(4 toques sem romper = não opera). Não usar expansão de Fibonacci como
alvo aqui — alvo é o extremo oposto da range.
```

**Conditions — Mandatory (3):**

1. `VWAP respeitado` (sort 0)
2. `Doji at MMA` (sort 1)
3. `NÃO entra em rompimento` (sort 2)

**Conditions — Tier 2 (2):**

1. `Ajuste respeitado` (sort 100)
2. `MACD slope up (15min)` (sort 101)

**Conditions — Tier 3 (2):**

1. `Pullback no EMA 27` (sort 200)
2. `Pullback no EMA 55` (sort 201)

---

### 3.4 Playbook · Dia de Virada do 60min

**Code:** `HWK_VIRADA_60M`
**Strategy name:** `Hawks · Dia de Virada do 60min`
**Final R:** `3.0`
**Max risk per trade %:** `0.5`

**Description:**

```
Avançado. 60min vira direção intra-dia (renkoClose flip + MACD slope flip).
Espera confirmação por 2 candles do 60min antes de qualquer trade na nova
direção. Não opera no momento da virada — só após estabilização.
```

**Entry criteria:**

```
60min flip confirmado (renko close + MACD slope ambos na nova direção).
Aguarda pelo menos 2 candles do 60min na nova direção. Pullback no 5min
na nova EMA. Renko semanal calibrado (não opera em semana com Renko
incerto).

Suporte rompido vira resistência: preço perdeu o 60min (box abriu E
fechou abaixo) → pullback até a região = ponta vendedora.
Resistência rompida vira suporte: simétrico.
```

**Exit criteria:**

```
Alvo +3R. Stop -1R (apertado — virada é frágil até consolidar).
BE em +1R favor.
```

**Risk management rules:**

```
1R fixo do tier, MAS reduzir contratos pela metade no primeiro trade
pós-virada. Voltar ao tamanho normal apenas se o segundo trade na nova
direção também ganhar.
```

**Additional notes:**

```
Aplicação histórica: 2025-12-10 (+700 + +2.500 pts no dia);
2026-01-30 (-6.000 pts no índice); 2026-02-27 (suporte rompido);
2026-04-22 (continuidade vendedora pós-virada).
"60min não vira no mesmo dia exceto em lateralização."
```

**Conditions — Mandatory (3):**

1. `MMA alinhada` (sort 0)
2. `NÃO entra em rompimento` (sort 1)
3. `Renko semanal calibrado` (sort 2)

**Conditions — Tier 2 (3):**

1. `MACD slope up (60min)` (sort 100)
2. `VWAP respeitado` (sort 101)
3. `Ajuste respeitado` (sort 102)

**Conditions — Tier 3 (2):**

1. `Higher high 60min` (sort 200)
2. `Lower low 60min` (sort 201)

---

## Post-seed validation (manual smoke)

Run these checks before moving to Stage 2 of Zero-to-Hero:

1. **Tags page** — 20 rows visible, color swatches render, filter by `setup` / `mistake` / `general` returns expected counts (8 / 10 / 2).
2. **Conditions page** — 18 rows visible, filter by `indicator` / `price_action` / `market_context` / `custom` returns 6 / 6 / 4 / 2.
3. **Playbook page** — 4 strategies listed: `HWK_TENDENCIA_CLARA`, `HWK_PULLBACK_5M`, `HWK_LATERAL_REVERSAO`, `HWK_VIRADA_60M`. Open each one and confirm the conditions panel shows the tiered grouping (mandatory / tier_2 / tier_3).
4. **Journal entry form** — open `Journal → New Trade`. The setup-tag and mistake-tag dropdowns should now expose every Hawks tag from §1. The "Strategy" dropdown should list the 4 playbooks from §3.
5. **Command Center → Hawks scorecard** — should be wired against the 4 strategies. (If the scorecard shows "no playbook" empty state, double-check that the Hawks-mode toggle is on for the active account.)

If any of these fail, that's a **flow gap** worth filing — the seed is canonical, so a missing surface is a UI bug, not a data problem.

---

## What this doc deliberately does NOT cover

- **Trading accounts, assets, timeframes, risk profiles, fee rates** — assumed done in Stage 1 prior steps. The SQL seed (`pnpm seed`) covers these idempotently if you want to skip the manual entry.
- **Scenarios (HWK_S01..HWK_S24)** — these are global, code-managed in `src/lib/hawks/seed-data.ts`, and seeded once via `seedHawksScenarios`. They don't have a UI create flow; they're system data.
- **Hawks CSV import** — Stage 4 post-market step, out of scope here.
- **Fractal plan / backtest** — Stage 2 and Stage 3, separate docs.

---

## Reference paths

- Zero-to-Hero overview: [`docs/zero-to-hero.md`](./zero-to-hero.md)
- E2E plan (Stage 1 spec): [`docs/design/zero-to-hero-e2e.md`](./design/zero-to-hero-e2e.md) §01-foundation
- Hawks playbook (canonical): `vault/wiki/hawks/playbook.md`
- Existing SQL seeds (for cross-checking values):
  - `scripts/seed/tags.ts`
  - `scripts/seed/conditions.ts`
  - `scripts/seed/playbooks-hawks.ts`
