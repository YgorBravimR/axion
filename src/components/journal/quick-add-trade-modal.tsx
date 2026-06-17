"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { createTrade } from "@/app/actions/trades"
import { useToast } from "@/components/ui/toast"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { Asset } from "@/db/schema"

// B3 futures session is BRT — datetime-local inputs are interpreted as BRT (UTC-3)
const BRT_OFFSET = "-03:00"

const toDatetimeLocalString = (date: Date): string => {
	const pad = (n: number) => String(n).padStart(2, "0")
	// Render `date` in BRT so the datetime-local input shows São Paulo time
	const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000)
	return `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(
		brt.getUTCDate()
	)}T${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}`
}

const fromDatetimeLocalString = (value: string): Date => {
	// Treat the bare "YYYY-MM-DDTHH:mm" string as BRT, not browser local time
	return new Date(`${value}${BRT_OFFSET}`)
}

const datetimeField = (key: "entryDate" | "exitDate") =>
	z
		.string()
		.min(1, `validation.trade.${key}Required`)
		.refine((val) => !Number.isNaN(new Date(val).getTime()), {
			message: `validation.trade.${key}Invalid`,
		})

const quickAddTradeSchema = z
	.object({
		asset: z
			.string()
			.min(1, "validation.trade.assetRequired")
			.max(20, "validation.trade.assetMaxLength")
			.transform((val) => val.toUpperCase()),
		direction: z.enum(["long", "short"]),
		entryDate: datetimeField("entryDate"),
		exitDate: datetimeField("exitDate"),
		entryPrice: z.coerce
			.number({ message: "validation.trade.entryPriceRequired" })
			.positive("validation.trade.entryPricePositive"),
		exitPrice: z.coerce
			.number({ message: "validation.trade.exitPriceRequired" })
			.positive("validation.trade.exitPricePositive"),
		positionSize: z.coerce
			.number({ message: "validation.trade.positionSizeRequired" })
			.positive("validation.trade.positionSizePositive"),
	})
	.superRefine((data, ctx) => {
		const entry = fromDatetimeLocalString(data.entryDate).getTime()
		const exit = fromDatetimeLocalString(data.exitDate).getTime()
		if (exit < entry) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["exitDate"],
				message: "validation.trade.exitDateAfterEntry",
			})
		}
	})

type QuickAddTradeFormInput = z.infer<typeof quickAddTradeSchema>

interface QuickAddTradeModalProps {
	isOpen: boolean
	onClose: () => void
	availableAssets: Asset[]
	lastAsset?: string
	lastDirection?: "long" | "short"
}

export const QuickAddTradeModal = ({
	isOpen,
	onClose,
	availableAssets,
	lastAsset,
	lastDirection,
}: QuickAddTradeModalProps) => {
	const router = useRouter()
	const t = useTranslations("journal.quickAdd")
	const { showToast } = useToast()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [savedCount, setSavedCount] = useState(0)

	const form = useForm<QuickAddTradeFormInput>({
		resolver: zodResolver(quickAddTradeSchema),
		defaultValues: {
			asset: lastAsset || "",
			direction: lastDirection || "long",
			entryDate: toDatetimeLocalString(new Date()),
			exitDate: toDatetimeLocalString(new Date()),
			entryPrice: undefined,
			exitPrice: undefined,
			positionSize: undefined,
		},
	})

	const onSubmit = useCallback(
		async (data: QuickAddTradeFormInput, keepOpen: boolean = false) => {
			setIsSubmitting(true)
			try {
				const result = await createTrade({
					asset: data.asset,
					direction: data.direction,
					entryDate: fromDatetimeLocalString(data.entryDate),
					exitDate: fromDatetimeLocalString(data.exitDate),
					entryPrice: data.entryPrice,
					exitPrice: data.exitPrice,
					positionSize: data.positionSize,
					source: "quick-add",
				})

				if (result.status === "success") {
					showToast("success", t("tradeCreated"))
					setSavedCount((prev) => prev + 1)

					if (keepOpen) {
						form.reset({
							asset: data.asset,
							direction: data.direction,
							entryDate: toDatetimeLocalString(new Date()),
							exitDate: toDatetimeLocalString(new Date()),
							entryPrice: undefined,
							exitPrice: undefined,
							positionSize: undefined,
						})
					} else {
						router.refresh()
						onClose()
					}
				} else {
					showToast("error", result.message || t("createFailed"))
				}
			} catch (error) {
				showToast(
					"error",
					error instanceof Error ? error.message : t("createFailed")
				)
			} finally {
				setIsSubmitting(false)
			}
		},
		[form, onClose, router, showToast, t]
	)

	const handleClose = useCallback(() => {
		if (savedCount > 0) {
			router.refresh()
		}
		onClose()
		setSavedCount(0)
		form.reset()
	}, [onClose, router, savedCount, form])

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent id="quick-add-trade-modal" className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit((data) => onSubmit(data, false))}>
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="asset"
								render={({ field }) => (
									<FormItem>
										<FormLabel htmlFor="quick-add-asset">
											{t("labels.asset")}
										</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value}
											disabled={isSubmitting || availableAssets.length === 0}
										>
											<FormControl>
												<SelectTrigger id="quick-add-asset">
													<SelectValue
														placeholder={
															availableAssets.length === 0
																? "No assets configured"
																: "Select an asset"
														}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{availableAssets.map((asset) => (
													<SelectItem key={asset.id} value={asset.symbol}>
														<span className="font-mono">{asset.symbol}</span>
														<span className="text-txt-300 ml-s-200">
															{asset.name}
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="direction"
								render={({ field }) => (
									<FormItem>
										<FormLabel htmlFor="quick-add-direction">
											{t("labels.direction")}
										</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value}
											disabled={isSubmitting}
										>
											<FormControl>
												<SelectTrigger id="quick-add-direction">
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="long">
													{t("directions.long")}
												</SelectItem>
												<SelectItem value="short">
													{t("directions.short")}
												</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grid grid-cols-2 gap-3">
								<FormField
									control={form.control}
									name="entryDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel htmlFor="quick-add-entryDate">
												{t("labels.entryDate")}
											</FormLabel>
											<FormControl>
												<Input
													id="quick-add-entryDate"
													type="datetime-local"
													step="1"
													{...field}
													disabled={isSubmitting}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="exitDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel htmlFor="quick-add-exitDate">
												{t("labels.exitDate")}
											</FormLabel>
											<FormControl>
												<Input
													id="quick-add-exitDate"
													type="datetime-local"
													step="1"
													{...field}
													disabled={isSubmitting}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<FormField
									control={form.control}
									name="entryPrice"
									render={({ field }) => (
										<FormItem>
											<FormLabel htmlFor="quick-add-entryPrice">
												{t("labels.entryPrice")}
											</FormLabel>
											<FormControl>
												<Input
													id="quick-add-entryPrice"
													type="number"
													step="0.01"
													placeholder="0.00"
													{...field}
													disabled={isSubmitting}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="exitPrice"
									render={({ field }) => (
										<FormItem>
											<FormLabel htmlFor="quick-add-exitPrice">
												{t("labels.exitPrice")}
											</FormLabel>
											<FormControl>
												<Input
													id="quick-add-exitPrice"
													type="number"
													step="0.01"
													placeholder="0.00"
													{...field}
													disabled={isSubmitting}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="positionSize"
								render={({ field }) => (
									<FormItem>
										<FormLabel htmlFor="quick-add-positionSize">
											{t("labels.positionSize")}
										</FormLabel>
										<FormControl>
											<Input
												id="quick-add-positionSize"
												type="number"
												step="1"
												placeholder="1"
												{...field}
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="mt-6 flex justify-end gap-3">
							<Button
								id="quick-add-cancel"
								type="button"
								variant="outline"
								onClick={handleClose}
								disabled={isSubmitting}
							>
								{t("buttons.cancel")}
							</Button>
							<Button
								id="quick-add-save-and-add"
								type="button"
								variant="outline"
								onClick={form.handleSubmit((data) => onSubmit(data, true))}
								disabled={isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{t("buttons.saveAndAdd")}
							</Button>
							<Button
								id="quick-add-submit"
								type="submit"
								disabled={isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{t("buttons.save")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
