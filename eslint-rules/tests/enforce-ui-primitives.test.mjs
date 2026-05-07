import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-ui-primitives.mjs"

tsRuleTester.run("enforce-ui-primitives", rule, {
	valid: [
		{
			name: "Table component allowed",
			code: `import { Table } from "@/components/ui/table"\nconst x = <Table />`,
		},
		{
			name: "Link from next/link allowed",
			code: `import Link from "next/link"\nconst x = <Link href="/dashboard">Go</Link>`,
		},
		{
			name: "external https anchor allowed",
			code: `const x = <a href="https://example.com">External</a>`,
		},
		{
			name: "mailto anchor allowed",
			code: `const x = <a href="mailto:hi@x.com">Email</a>`,
		},
		{
			name: "tel anchor allowed",
			code: `const x = <a href="tel:+39000000">Call</a>`,
		},
		{
			name: "in-page hash anchor allowed",
			code: `const x = <a href="#section">Skip</a>`,
		},
		{
			name: "input type=text allowed",
			code: `const x = <input type="text" />`,
		},
		{
			name: "primitives dir exempt — raw <table> allowed in src/components/ui",
			filename: "/repo/src/components/ui/table/table.tsx",
			code: `const x = <table />`,
		},
	],
	invalid: [
		{
			name: "raw <table> flagged",
			code: `const x = <table />`,
			errors: [{ messageId: "rawTable" }],
		},
		{
			name: "internal <a href> flagged",
			code: `const x = <a href="/dashboard">Go</a>`,
			errors: [{ messageId: "rawAnchor" }],
		},
		{
			name: "dynamic <a href={var}> flagged (assume internal)",
			code: `const x = <a href={url}>Go</a>`,
			errors: [{ messageId: "rawAnchor" }],
		},
		{
			name: "<input type='checkbox'> flagged",
			code: `const x = <input type="checkbox" />`,
			errors: [{ messageId: "rawCheckbox" }],
		},
	],
})
