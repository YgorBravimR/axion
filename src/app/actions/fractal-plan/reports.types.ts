interface RDistRow {
	bucket: "lt_neg1" | "neg1_to_0" | "0_to_1" | "1_to_2" | "ge_2"
	count: number
}

export type { RDistRow }
