import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const Input = ({ className, type, id, ...props }: Omit<ComponentProps<"input">, "id"> & { id: string }) => {
  return (
    <input
      id={id}
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-txt-placeholder selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-[invalid=true]:border-fb-error aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-fb-error/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
