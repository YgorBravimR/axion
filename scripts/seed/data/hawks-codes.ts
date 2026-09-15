// The 47 Hawks strategy codes, decomposed.
//
// Source: ~/vault/raw/hawks/mentoria/_assets/ESTRATEGIAS.pdf (delivered with
// Module 5), as merged into playbook.md §14 "Códigos de estratégia Hawks".
//
// WHY THIS IS A TABLE AND NOT A PARSER: the codes cannot be reliably decomposed
// by stripping prefixes. `T` is overloaded — teste in `TPA`/`TLTA`, triângulo in
// `TA`/`TD`/`TS` — and prefixes stack, so `DTPA` is dobra + teste + price-action,
// three levels deep. A naive prefix strip fails on 6 of 47. This mapping is
// explicit on purpose.
//
// WHY THESE ARE NOT ROWS IN `strategies`: a code is the cross product of an
// execution and a level. `VBRM` IS `exec:virada` + `nivel:medias`. Storing 47
// rows makes every analytical question unanswerable, because each code carries
// two or three trades. `strategies` holds the 8 families; the axes below become
// tags, and the code is reconstructible from them.
//
// ⚠️ NAME COLLISION: the code `OCO` here means Ombro-Cabeça-Ombro (head and
// shoulders). It has nothing to do with the `hawks_weekly_oco` table, where OCO
// means One-Cancels-Other. Both appear in this codebase. Do not conflate them.

export type Family =
	| "virada-de-box"
	| "media"
	| "ajuste"
	| "vwap"
	| "price-action"
	| "figura"
	| "fibonacci"
	| "leilao"
	| "config"

export type Exec = "teste" | "virada" | "rompimento" | "leilao" | "dobra" | "na"

export interface HawksCode {
	code: string
	name: string
	family: Family
	exec: Exec
	/** Tag value on the `nivel:` axis, or null where the code carries no level. */
	nivel: string | null
	active: boolean
	/** Why it is inactive. Null when active. */
	inactiveReason: string | null
}

const DOBRA = "overlay §18.5 — dobra documented, out of the arsenal"
const FIGURA = "overlay §18.3 — price read by pivots, not chart figures"
const FIB = "overlay §18.10 — retracement entries at 61,8% only"

export const HAWKS_CODES: readonly HawksCode[] = [
	// ── Virada de box ────────────────────────────────────────────────────────
	{
		code: "VB",
		name: "Continuar movimento na virada de box",
		family: "virada-de-box",
		exec: "virada",
		nivel: null,
		active: true,
		inactiveReason: null,
	},
	{
		code: "SDVB",
		name: "Stop Dobrado na Virada de Box",
		family: "virada-de-box",
		exec: "dobra",
		nivel: null,
		active: false,
		inactiveReason:
			"martingale — Pedro: 'eu não faço de jeito nenhum'. Belongs in §13, not the arsenal. Seeded as a mistake tag instead.",
	},

	// ── Retorno às médias ────────────────────────────────────────────────────
	{
		code: "RM1",
		name: "Teste em cima da 1ª média",
		family: "media",
		exec: "teste",
		nivel: "media-1",
		active: true,
		inactiveReason: null,
	},
	{
		code: "RM2",
		name: "Teste em cima da 2ª média",
		family: "media",
		exec: "teste",
		nivel: "media-2",
		active: true,
		inactiveReason: null,
	},
	{
		code: "DRM1",
		name: "Dobra na 1ª média",
		family: "media",
		exec: "dobra",
		nivel: "media-1",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "DRM2",
		name: "Dobra na 2ª média",
		family: "media",
		exec: "dobra",
		nivel: "media-2",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "VBRM",
		name: "Virada de box na região das médias",
		family: "media",
		exec: "virada",
		nivel: "medias",
		active: true,
		inactiveReason: null,
	},
	{
		code: "VBRM1",
		name: "Virada de box na 1ª média",
		family: "media",
		exec: "virada",
		nivel: "media-1",
		active: true,
		inactiveReason: null,
	},
	{
		code: "VBRM2",
		name: "Virada de box na 2ª média",
		family: "media",
		exec: "virada",
		nivel: "media-2",
		active: true,
		inactiveReason: null,
	},

	// ── Ajuste ───────────────────────────────────────────────────────────────
	{
		code: "AJUSTE",
		name: "Teste em cima do ajuste",
		family: "ajuste",
		exec: "teste",
		nivel: "ajuste",
		active: true,
		inactiveReason: null,
	},
	{
		code: "DAJUSTE",
		name: "Dobra no ajuste",
		family: "ajuste",
		exec: "dobra",
		nivel: "ajuste",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "VBAJUSTE",
		name: "Virada de box no ajuste",
		family: "ajuste",
		exec: "virada",
		nivel: "ajuste",
		active: true,
		inactiveReason: null,
	},

	// ── VWAP ─────────────────────────────────────────────────────────────────
	{
		code: "VWAP",
		name: "Teste em cima da VWAP",
		family: "vwap",
		exec: "teste",
		nivel: "vwap",
		active: true,
		inactiveReason: null,
	},
	{
		code: "DVWAP",
		name: "Dobra na VWAP",
		family: "vwap",
		exec: "dobra",
		nivel: "vwap",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "VBVWAP",
		name: "Virada de box na VWAP",
		family: "vwap",
		exec: "virada",
		nivel: "vwap",
		active: true,
		inactiveReason: null,
	},

	// ── Price action ─────────────────────────────────────────────────────────
	{
		code: "PA",
		name: "Rompimento de suporte ou resistência",
		family: "price-action",
		exec: "rompimento",
		nivel: "suporte-resistencia",
		active: true,
		inactiveReason: null,
	},
	{
		code: "TPA",
		name: "Teste do price action",
		family: "price-action",
		exec: "teste",
		nivel: "suporte-resistencia",
		active: true,
		inactiveReason: null,
	},
	{
		code: "DTPA",
		name: "Dobra no teste do price action",
		family: "price-action",
		exec: "dobra",
		nivel: "suporte-resistencia",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "VBPA",
		name: "Virada de box no price action",
		family: "price-action",
		exec: "virada",
		nivel: "suporte-resistencia",
		active: true,
		inactiveReason: null,
	},
	{
		code: "TLTA",
		name: "Teste da LTA",
		family: "price-action",
		exec: "teste",
		nivel: "lta",
		active: true,
		inactiveReason: null,
	},
	{
		code: "VBLTA",
		name: "Virada de box na LTA",
		family: "price-action",
		exec: "virada",
		nivel: "lta",
		active: true,
		inactiveReason: null,
	},
	{
		code: "TLTB",
		name: "Teste da LTB",
		family: "price-action",
		exec: "teste",
		nivel: "ltb",
		active: true,
		inactiveReason: null,
	},
	{
		code: "VBLTB",
		name: "Virada de box na LTB",
		family: "price-action",
		exec: "virada",
		nivel: "ltb",
		active: true,
		inactiveReason: null,
	},

	// ── Figuras gráficas (all inactive, §18.3) ───────────────────────────────
	{
		code: "TA",
		name: "Triângulo ascendente",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "TD",
		name: "Triângulo descendente",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "TS",
		name: "Triângulo simétrico",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "BANDEIRA",
		name: "Bandeira",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "FLAMULA",
		name: "Flâmula",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "OCO",
		name: "Ombro-cabeça-ombro, rompimento da linha de pescoço",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "OCOI",
		name: "Ombro-cabeça-ombro invertido, rompimento da linha de pescoço",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},
	{
		code: "AOCO",
		name: "Antecipação do OCO no ombro",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: `${FIGURA}; also anticipates before the neckline break, against the complete-box rule §10`,
	},
	{
		code: "AOCOI",
		name: "Antecipação do OCOI no ombro",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: `${FIGURA}; also anticipates before the neckline break, against the complete-box rule §10`,
	},
	{
		code: "DERIVA",
		name: "Deriva",
		family: "figura",
		exec: "rompimento",
		nivel: "figura",
		active: false,
		inactiveReason: FIGURA,
	},

	// ── Retrações Fibonacci ──────────────────────────────────────────────────
	{
		code: "RF38",
		name: "Teste na retração de 38,2%",
		family: "fibonacci",
		exec: "teste",
		nivel: "fib-38",
		active: false,
		inactiveReason: `${FIB}. Pedro also bans the teste here outright.`,
	},
	{
		code: "RF50",
		name: "Teste na retração de 50%",
		family: "fibonacci",
		exec: "teste",
		nivel: "fib-50",
		active: false,
		inactiveReason: `${FIB}. Pedro also bans the teste here outright.`,
	},
	{
		code: "RF61",
		name: "Teste na retração de 61,8%",
		family: "fibonacci",
		exec: "teste",
		nivel: "fib-61",
		active: true,
		inactiveReason: null,
	},
	{
		code: "DRF38",
		name: "Dobra na retração de 38,2%",
		family: "fibonacci",
		exec: "dobra",
		nivel: "fib-38",
		active: false,
		inactiveReason: `${DOBRA}; ${FIB}`,
	},
	{
		code: "DRF50",
		name: "Dobra na retração de 50%",
		family: "fibonacci",
		exec: "dobra",
		nivel: "fib-50",
		active: false,
		inactiveReason: `${DOBRA}; ${FIB}`,
	},
	{
		code: "DRF61",
		name: "Dobra na retração de 61,8%",
		family: "fibonacci",
		exec: "dobra",
		nivel: "fib-61",
		active: false,
		inactiveReason: DOBRA,
	},
	{
		code: "VBRF38",
		name: "Virada de box na retração de 38,2%",
		family: "fibonacci",
		exec: "virada",
		nivel: "fib-38",
		active: false,
		inactiveReason: `${FIB}. This is the one Pedro PERMITS and the overlay removes.`,
	},
	{
		code: "VBRF50",
		name: "Virada de box na retração de 50%",
		family: "fibonacci",
		exec: "virada",
		nivel: "fib-50",
		active: false,
		inactiveReason: `${FIB}. This is the one Pedro PERMITS and the overlay removes.`,
	},
	{
		code: "VBRF61",
		name: "Virada de box na retração de 61,8%",
		family: "fibonacci",
		exec: "virada",
		nivel: "fib-61",
		active: true,
		inactiveReason: null,
	},
	{
		code: "VBRF",
		name: "Virada dentro da região de retrações",
		family: "fibonacci",
		exec: "virada",
		nivel: "fib-61",
		active: false,
		inactiveReason: "redundant with VBRF61 once 38,2% and 50% are out (§18.10)",
	},

	// ── Leilões ──────────────────────────────────────────────────────────────
	{
		code: "LEILAOA",
		name: "Leilão de abertura",
		family: "leilao",
		exec: "leilao",
		nivel: "leilao-abertura",
		active: true,
		inactiveReason: null,
	},
	{
		code: "LEILAOF",
		name: "Pré-leilão de fechamento",
		family: "leilao",
		exec: "leilao",
		nivel: "leilao-fechamento",
		active: true,
		inactiveReason: null,
	},

	// ── Regiões (chart configuration, never was a strategy) ──────────────────
	{
		code: "1REGIOES",
		name: "Gráfico principal no 1min",
		family: "config",
		exec: "na",
		nivel: null,
		active: false,
		inactiveReason:
			"chart configuration, not a strategy — belongs on account settings",
	},
	{
		code: "5REGIOES",
		name: "Gráfico principal no 5min",
		family: "config",
		exec: "na",
		nivel: null,
		active: false,
		inactiveReason:
			"chart configuration, not a strategy — belongs on account settings. This IS Ygor's setup (§18.1).",
	},
]

export const ACTIVE_CODES = HAWKS_CODES.filter((c) => c.active)
