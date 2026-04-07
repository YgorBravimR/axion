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
        "border-input placeholder:text-txt-placeholder focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "aria-[invalid=true]:border-fb-error aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-fb-error/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
