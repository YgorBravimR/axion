"use client"

import type { ComponentProps } from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface RadioGroupProps extends ComponentProps<typeof RadioGroupPrimitive.Root> {
  id: string
}

const RadioGroup = ({
  className,
  ...props
}: RadioGroupProps) => {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-s-300", className)}
      {...props}
    />
  )
}

interface RadioGroupItemProps extends ComponentProps<typeof RadioGroupPrimitive.Item> {
  id: string
}

const RadioGroupItem = ({
  className,
  ...props
}: RadioGroupItemProps) => {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-bg-300 text-acc-100 focus-visible:border-acc-100 focus-visible:ring-acc-100/30 aria-invalid:ring-fb-error/30 aria-invalid:border-fb-error aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-acc-100 absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
