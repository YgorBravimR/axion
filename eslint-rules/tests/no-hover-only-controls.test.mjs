import { tsRuleTester } from "./_helpers.mjs"
import rule from "../no-hover-only-controls.mjs"

tsRuleTester.run("no-hover-only-controls", rule, {
	valid: [
		{
			name: "no hover pattern",
			code: `const x = <div className="opacity-100" />`,
		},
		{
			name: "hover pattern with focus-visible escape",
			code: `const x = <button className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />`,
		},
		{
			name: "hover pattern with aria-label",
			code: `const x = <button className="opacity-0 group-hover:opacity-100" aria-label="Edit" />`,
		},
		{
			name: "opacity-40 (not opacity-0) is allowed dimming",
			code: `const x = <div className="opacity-40 group-hover:opacity-100" />`,
		},
		{
			name: "responsive hide+reveal with focus escape",
			code: `const x = <button className="sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100" />`,
		},
		{
			name: "no className attribute",
			code: `const x = <div data-foo="bar" />`,
		},
		{
			name: "aria-hidden decorative element exempt",
			code: `const x = <span aria-hidden="true" className="opacity-0 group-hover:opacity-100" />`,
		},
		{
			name: "group-focus-within escape",
			code: `const x = <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />`,
		},
	],
	invalid: [
		{
			name: "pure hover-only fails",
			code: `const x = <div className="opacity-0 group-hover:opacity-100" />`,
			errors: [{ messageId: "hoverOnly" }],
		},
		{
			name: "responsive hover-only fails",
			code: `const x = <div className="sm:opacity-0 sm:group-hover:opacity-100" />`,
			errors: [{ messageId: "hoverOnly" }],
		},
		{
			name: "hover-only via cn() helper",
			code: `import { cn } from "x"\nconst x = <div className={cn("opacity-0", "group-hover:opacity-100")} />`,
			errors: [{ messageId: "hoverOnly" }],
		},
		{
			name: "hover-only via template literal",
			code: "const x = <div className={`opacity-0 group-hover:opacity-100 ${flag && 'extra'}`} />",
			errors: [{ messageId: "hoverOnly" }],
		},
	],
})
