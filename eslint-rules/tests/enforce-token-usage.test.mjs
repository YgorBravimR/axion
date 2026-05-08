import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-token-usage.mjs"

tsRuleTester.run("enforce-token-usage", rule, {
	valid: [
		{
			name: "valid spacing tokens",
			code: `const x = <div className="gap-s-100 p-m-400 m-l-700" />`,
		},
		{
			name: "valid radius",
			code: `const x = <div className="rounded-md rounded-sm rounded-lg" />`,
		},
		{
			name: "valid typography",
			code: `const x = <div className="text-h1 text-h2 text-body text-micro text-tiny" />`,
		},
		{
			name: "valid semantic colors",
			code: `const x = <div className="text-fb-error bg-warning border-fb-success" />`,
		},
		{
			name: "non-className attribute ignored",
			code: `const x = <div data-test="text-h4" />`,
		},
		{
			name: "non-helper call ignored",
			code: `const x = something("text-h4")`,
		},
		{
			name: "valid class inside cn()",
			code: `import { cn } from "x"\nconst x = cn("p-s-100", "text-body")`,
		},
	],
	invalid: [
		{
			name: "text-h4 demoted",
			code: `const x = <div className="text-h4 font-bold" />`,
			output: `const x = <div className="text-h3 font-bold" />`,
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "rounded-m-200 → rounded-md",
			code: `const x = <div className="rounded-m-200" />`,
			output: `const x = <div className="rounded-md" />`,
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "spacing s-400 → m-400",
			code: `const x = <div className="gap-s-400 p-m-100" />`,
			output: `const x = <div className="gap-m-400 p-s-100" />`,
			errors: [{ messageId: "invalidToken" }, { messageId: "invalidToken" }],
		},
		{
			name: "v3-deprecated flex-shrink-0",
			code: `const x = <div className="flex-shrink-0" />`,
			output: `const x = <div className="shrink-0" />`,
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "arbitrary text-[10px] → text-micro",
			code: `const x = <div className="text-[10px]" />`,
			output: `const x = <div className="text-micro" />`,
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "semantic err-500 → fb-error",
			code: `const x = <div className="text-err-500 bg-warn-300" />`,
			output: `const x = <div className="text-fb-error bg-warning" />`,
			errors: [{ messageId: "invalidToken" }, { messageId: "invalidToken" }],
		},
		{
			name: "cn() string arg flagged",
			code: `import { cn } from "x"\nconst c = cn("text-h4", isActive && "p-s-400")`,
			output: `import { cn } from "x"\nconst c = cn("text-h3", isActive && "p-m-400")`,
			errors: [{ messageId: "invalidToken" }, { messageId: "invalidToken" }],
		},
		{
			name: "template literal in className",
			code: "const x = <div className={`text-h4 ${other}`} />",
			output: "const x = <div className={`text-h3 ${other}`} />",
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "heading-N renamed",
			code: `const x = <div className="text-heading-2" />`,
			output: `const x = <div className="text-h2" />`,
			errors: [{ messageId: "invalidToken" }],
		},
		{
			name: "fb-warning collapsed to warning",
			code: `const x = <div className="bg-fb-warning" />`,
			output: `const x = <div className="bg-warning" />`,
			errors: [{ messageId: "invalidToken" }],
		},
	],
})
