"use client"

import dynamic from "next/dynamic"
import type { MonthlyDarfRow } from "@/lib/tax/types"

const TaxTabComponent = dynamic(
	() => import("./tax-tab").then((m) => ({ default: m.TaxTab })),
	{ ssr: false }
)

interface TaxTabLazyProps {
	accountId: string
	accountType: "personal" | "prop"
	year: number
	rows: MonthlyDarfRow[]
}

const TaxTabLazy = (props: TaxTabLazyProps) => {
	return <TaxTabComponent {...props} />
}

export { TaxTabLazy }
