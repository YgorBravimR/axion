interface ScreenLabel {
	key: "renko60" | "macd" | "emaStack" | "vwap" | "ajuste"
	label: string
	hint: string
}

const getScreenLabel = (
	key: ScreenLabel["key"],
	bias: "long" | "short" | "neutral",
	t: (_key: string) => string
): ScreenLabel => {
	const baseKey = {
		renko60: "screenRenko60",
		macd: "screenMacd",
		emaStack: "screenEmaStack",
		vwap: "screenVwap",
		ajuste: "screenAjuste",
	}[key]

	const hintKey = `${baseKey}Hint`

	if (bias === "short") {
		return {
			key,
			label: t(`${baseKey}Short`),
			hint: t(`${hintKey}Short`),
		}
	}

	return {
		key,
		label: t(baseKey),
		hint: t(hintKey),
	}
}

export { getScreenLabel, type ScreenLabel }
