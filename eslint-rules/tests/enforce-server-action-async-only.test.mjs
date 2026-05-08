import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-server-action-async-only.mjs"

tsRuleTester.run("enforce-server-action-async-only", rule, {
	valid: [
		{
			name: "async arrow exports allowed",
			code: `"use server"\nexport const foo = async () => 1\nexport const bar = async (x) => x + 1`,
		},
		{
			name: "async function declaration allowed",
			code: `"use server"\nexport async function foo() { return 1 }`,
		},
		{
			name: "typed re-export syntax allowed",
			code: `"use server"\nexport type { Foo } from "./types"\nexport const action = async () => 1`,
		},
		{
			name: "non-server file ignored entirely (no directive)",
			code: `export type Foo = "a" | "b"\nexport function foo() {}\nexport class Bar {}`,
		},
		{
			name: "non-export declarations inside server file are fine",
			code: `"use server"\nconst INTERNAL = 5\nfunction internalSync() {}\nexport const action = async () => INTERNAL + 1`,
		},
		{
			name: "cache(async fn) wrapper allowed (React.cache pattern)",
			code: `"use server"\nimport { cache } from "react"\nexport const requireAuth = cache(async () => 1)`,
		},
	],
	invalid: [
		{
			name: "export type alias forbidden",
			code: `"use server"\nexport type Foo = "a" | "b"\nexport const action = async () => 1`,
			errors: [{ messageId: "typeExport" }],
		},
		{
			name: "export interface forbidden",
			code: `"use server"\nexport interface RiskSettings { x: number }\nexport const action = async () => 1`,
			errors: [{ messageId: "interfaceExport" }],
		},
		{
			name: "export class forbidden",
			code: `"use server"\nexport class Foo {}\nexport const action = async () => 1`,
			errors: [{ messageId: "classExport" }],
		},
		{
			name: "sync function forbidden",
			code: `"use server"\nexport function sync() { return 1 }`,
			errors: [{ messageId: "syncFunction" }],
		},
		{
			name: "sync value forbidden",
			code: `"use server"\nexport const VAL = 5`,
			errors: [{ messageId: "syncValue" }],
		},
		{
			name: "barrel re-export forbidden",
			code: `"use server"\nexport { getFoo, updateFoo }`,
			errors: [{ messageId: "barrelReexport" }],
		},
		{
			name: "sync default forbidden",
			code: `"use server"\nexport default function sync() {}`,
			errors: [{ messageId: "syncDefault" }],
		},
	],
})
