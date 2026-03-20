"use client"

import { createContext, useContext, useId, forwardRef } from "react"
import type {
	ComponentPropsWithoutRef,
	HTMLAttributes,
	ElementRef,
} from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
	Controller,
	FormProvider,
	useFormContext,
} from "react-hook-form"
import type {
	ControllerProps,
	FieldPath,
	FieldValues,
} from "react-hook-form"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName
}

const FormFieldContext = createContext<FormFieldContextValue>(
	{} as FormFieldContextValue
)

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	)
}

const useFormField = () => {
	const fieldContext = useContext(FormFieldContext)
	const itemContext = useContext(FormItemContext)
	const { getFieldState, formState } = useFormContext()

	const fieldState = getFieldState(fieldContext.name, formState)

	if (!fieldContext) {
		throw new Error("useFormField should be used within <FormField>")
	}

	const { id } = itemContext

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		...fieldState,
	}
}

type FormItemContextValue = {
	id: string
}

const FormItemContext = createContext<FormItemContextValue>(
	{} as FormItemContextValue
)

const FormItem = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
	const id = useId()

	return (
		<FormItemContext.Provider value={{ id }}>
			<div ref={ref} className={cn("space-y-s-200", className)} {...props} />
		</FormItemContext.Provider>
	)
})
FormItem.displayName = "FormItem"

interface FormLabelProps extends ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
	id: string
	/** Whether this field is required (shows * indicator) */
	required?: boolean
	/** Whether the field has a value (controls * color) */
	filled?: boolean
}

const FormLabel = forwardRef<
	ElementRef<typeof LabelPrimitive.Root>,
	FormLabelProps
>(({ className, id, required, filled, ...props }, ref) => {
	const { error, formItemId } = useFormField()

	return (
		<Label
			ref={ref}
			id={id}
			required={required}
			filled={filled}
			className={cn(error && "text-fb-error", className)}
			htmlFor={formItemId}
			{...props}
		/>
	)
})
FormLabel.displayName = "FormLabel"

const FormControl = forwardRef<
	ElementRef<typeof Slot>,
	ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
	const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

	return (
		<Slot
			ref={ref}
			id={formItemId}
			aria-describedby={
				!error
					? `${formDescriptionId}`
					: `${formDescriptionId} ${formMessageId}`
			}
			aria-invalid={!!error}
			{...props}
		/>
	)
})
FormControl.displayName = "FormControl"

const FormDescription = forwardRef<
	HTMLParagraphElement,
	HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
	const { formDescriptionId } = useFormField()

	return (
		<p
			ref={ref}
			id={formDescriptionId}
			className={cn("text-tiny text-txt-300", className)}
			{...props}
		/>
	)
})
FormDescription.displayName = "FormDescription"

const FormMessage = forwardRef<
	HTMLParagraphElement,
	HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
	const { error, formMessageId } = useFormField()
	const body = error ? String(error?.message) : children

	if (!body) {
		return null
	}

	return (
		<p
			ref={ref}
			id={formMessageId}
			className={cn("text-tiny font-medium text-fb-error", className)}
			{...props}
		>
			{body}
		</p>
	)
})
FormMessage.displayName = "FormMessage"

export {
	useFormField,
	Form,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
	FormField,
}
