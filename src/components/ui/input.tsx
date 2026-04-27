import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const Input = ({ className, type, id, ...props }: Omit<ComponentProps<"input">, "id"> & { id: string }) => {
  return (
    <input
      id={id}
      type={type}
      data-slot="input"
      className={cn(
        "file:text-txt-100 placeholder:text-txt-placeholder selection:bg-acc-100 selection:text-bg-100 border-bg-300 h-9 w-full min-w-0 rounded-md border bg-transparent px-s-300 py-s-100 text-body shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-small file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-small",
        "focus-visible:border-acc-100 focus-visible:ring-acc-100/30 focus-visible:ring-[3px]",
        "aria-[invalid=true]:border-fb-error aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-fb-error/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
