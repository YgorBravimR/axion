import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

interface TextareaProps extends ComponentProps<"textarea"> {
  id: string
}

const Textarea = ({ className, ...props }: TextareaProps) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-bg-300 placeholder:text-txt-placeholder focus-visible:border-acc-100 focus-visible:ring-acc-100/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-s-300 py-s-200 text-body shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-small",
        "aria-[invalid=true]:border-fb-error aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-fb-error/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
