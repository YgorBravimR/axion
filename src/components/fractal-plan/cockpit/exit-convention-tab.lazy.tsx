"use client"

import dynamic from "next/dynamic"

const ExitConventionTabComponent = dynamic(
	() =>
		import("./exit-convention-tab").then((m) => ({
			default: m.ExitConventionTab,
		})),
	{ ssr: false }
)

const ExitConventionTabLazy = () => {
	return <ExitConventionTabComponent />
}

export { ExitConventionTabLazy }
