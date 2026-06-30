import type { Drawing } from "@/components/hawks-chart/drawings"

type DrawingResult =
	| { readonly status: "success"; readonly drawings: ReadonlyArray<Drawing> }
	| { readonly status: "error"; readonly message: string }

type MutationResult =
	| { readonly status: "success"; readonly drawing: Drawing }
	| { readonly status: "error"; readonly message: string }

type DeleteResult =
	| { readonly status: "success" }
	| { readonly status: "error"; readonly message: string }

export type { DeleteResult, DrawingResult, MutationResult }
