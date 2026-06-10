import type { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-full border border-transparent px-s-200 py-[2px] text-micro font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-s-100 [&>svg]:pointer-events-none focus-visible:border-acc-100 focus-visible:ring-acc-100/30 focus-visible:ring-[3px] aria-invalid:ring-fb-error/20 aria-invalid:border-fb-error transition-[color,box-shadow] overflow-hidden",
	{
		variants: {
			variant: {
				default: "bg-acc-100 text-bg-100 [a&]:hover:bg-acc-100/90",
				secondary: "bg-bg-300 text-txt-100 [a&]:hover:bg-bg-300/80",
				tertiary: "bg-acc-200 text-bg-100 [a&]:hover:bg-acc-200/90",
				destructive:
					"bg-fb-error text-bg-100 [a&]:hover:bg-fb-error/90 focus-visible:ring-fb-error/20",
				outline:
					"border-bg-300 text-txt-200 [a&]:hover:bg-bg-300 [a&]:hover:text-txt-100",
				ghost: "[a&]:hover:bg-bg-300 [a&]:hover:text-txt-100",
				link: "text-acc-100 underline-offset-4 [a&]:hover:underline",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

interface BadgeProps
	extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {
	id: string
	asChild?: boolean
}

const Badge = ({
	className,
	variant = "default",
	asChild = false,
	...props
}: BadgeProps) => {
	const Comp = asChild ? Slot : "span"

	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	)
}

export { Badge, badgeVariants }
