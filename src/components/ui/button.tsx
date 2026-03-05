import type { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-s-200 whitespace-nowrap rounded-sm text-small font-medium transition-colors transition-opacity disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-acc-100 focus-visible:ring-acc-100/50 focus-visible:ring-[3px] aria-invalid:ring-fb-error/20 aria-invalid:border-fb-error",
	{
		variants: {
			variant: {
				default:
					"bg-acc-100 text-bg-100 shadow-small hover:bg-acc-100/90 focus-visible:ring-acc-100/30",
				destructive:
					"bg-fb-error text-bg-100 shadow-small hover:bg-fb-error/90 focus-visible:ring-fb-error/30",
				outline:
					"border border-bg-300 bg-bg-200 shadow-small hover:bg-bg-300 hover:text-txt-100 text-txt-100",
				secondary:
					"bg-acc-200 text-bg-100 shadow-small hover:bg-acc-200/90 focus-visible:ring-acc-200/30",
				ghost: "hover:bg-bg-300 hover:text-txt-100 text-txt-200",
				link: "text-acc-100 underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-m-400 py-s-200 has-[>svg]:px-s-300",
				sm: "h-8 rounded-md gap-s-100 px-s-300 has-[>svg]:px-s-200",
				lg: "h-10 rounded-md px-m-600 has-[>svg]:px-m-400",
				icon: "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
)

const Button = ({
	className,
	variant,
	size,
	asChild = false,
	id,
	...props
}: Omit<ComponentProps<"button">, "id"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean
		id: string
	}) => {
	const Comp = asChild ? Slot : "button"

	return (
		<Comp
			id={id}
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
