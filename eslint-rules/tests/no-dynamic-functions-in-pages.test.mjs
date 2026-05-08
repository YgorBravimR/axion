import { tsRuleTester } from "./_helpers.mjs"
import rule from "../no-dynamic-functions-in-pages.mjs"

tsRuleTester.run("no-dynamic-functions-in-pages", rule, {
	valid: [
		{
			name: "non-page file allowed",
			filename: "/repo/src/lib/auth.ts",
			code: `import { cookies } from "next/headers"\nexport const x = async () => cookies()`,
		},
		{
			name: "page file with safe imports",
			filename: "/repo/src/app/dashboard/page.tsx",
			code: `import { Suspense } from "react"\nexport default function Page() { return null }`,
		},
		{
			name: "non-banned name from next/headers",
			filename: "/repo/src/app/page.tsx",
			code: `import { something } from "next/headers"\nexport default function Page() { return null }`,
		},
		{
			name: "connection() from next/server is explicit opt-in (allowed)",
			filename: "/repo/src/app/page.tsx",
			code: `import { connection } from "next/server"\nexport default async function Page() { await connection(); return null }`,
		},
	],
	invalid: [
		{
			name: "cookies in page.tsx flagged",
			filename: "/repo/src/app/dashboard/page.tsx",
			code: `import { cookies } from "next/headers"\nexport default function Page() { return null }`,
			errors: [{ messageId: "dynamicInPage" }],
		},
		{
			name: "headers in layout.tsx flagged",
			filename: "/repo/src/app/(app)/layout.tsx",
			code: `import { headers } from "next/headers"\nexport default function Layout() { return null }`,
			errors: [{ messageId: "dynamicInPage" }],
		},
		{
			name: "draftMode in template.tsx flagged",
			filename: "/repo/src/app/template.tsx",
			code: `import { draftMode } from "next/headers"\nexport default function Template() { return null }`,
			errors: [{ messageId: "dynamicInPage" }],
		},
		{
			name: "multiple bans in one import",
			filename: "/repo/src/app/page.tsx",
			code: `import { cookies, headers } from "next/headers"\nexport default function Page() { return null }`,
			errors: [{ messageId: "dynamicInPage" }, { messageId: "dynamicInPage" }],
		},
	],
})
