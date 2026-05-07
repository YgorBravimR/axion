"use client"

import { useState, useTransition, useEffect, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog"
import {
	createAsset,
	updateAsset,
	type AssetWithType,
} from "@/app/actions/assets"
import type { AssetType } from "@/db/schema"
import { Loader2 } from "lucide-react"
import { fromCents } from "@/lib/money"

interface AssetFormProps {
	asset?: AssetWithType | null
	assetTypes: AssetType[]
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: () => void
}

export const AssetForm = ({
	asset,
	assetTypes,
	open,
	onOpenChange,
	onSuccess,
}: AssetFormProps) => {
	const t = useTranslations("settings.assets")
	const tCommon = useTranslations("common")
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)

	const [formData, setFormData] = useState({
		symbol: asset?.symbol ?? "",
		name: asset?.name ?? "",
		assetTypeId: asset?.assetTypeId ?? "",
		tickSize: asset?.tickSize ?? "",
		currency: asset?.currency ?? "BRL",
		multiplier: asset?.multiplier ?? "1",
	})
	const [tickValue, setTickValue] = useState<number | null>(
		asset?.tickValue ? fromCents(asset.tickValue) : null
	)

	useEffect(() => {
		if (asset) {
			setFormData({
				symbol: asset.symbol ?? "",
				name: asset.name ?? "",
				assetTypeId: asset.assetTypeId ?? "",
				tickSize: asset.tickSize ?? "",
				currency: asset.currency ?? "BRL",
				multiplier: asset.multiplier ?? "1",
			})
			setTickValue(asset.tickValue ? fromCents(asset.tickValue) : null)
		} else {
			setFormData({
				symbol: "",
				name: "",
				assetTypeId: "",
				tickSize: "",
				currency: "BRL",
				multiplier: "1",
			})
			setTickValue(null)
		}
	}, [asset])

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			const data = {
				symbol: formData.symbol,
				name: formData.name,
				assetTypeId: formData.assetTypeId,
				tickSize: parseFloat(formData.tickSize.toString()),
				tickValue: tickValue ?? 0,
				currency: formData.currency,
				multiplier: parseFloat(formData.multiplier.toString()),
				isActive: true,
			}

			const result = asset
				? await updateAsset({ ...data, id: asset.id })
				: await createAsset(data)

			if (result.success) {
				onOpenChange(false)
				onSuccess?.()
				setFormData({
					symbol: "",
					name: "",
					assetTypeId: "",
					tickSize: "",
					currency: "BRL",
					multiplier: "1",
				})
				setTickValue(null)
			} else {
				setError(result.error ?? tCommon("genericError"))
			}
		})
	}

	const handleChange = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent id="asset-form-dialog" className="max-w-md">
				<DialogHeader>
					<DialogTitle>{asset ? t("editAsset") : t("addAsset")}</DialogTitle>
					<DialogDescription>
						{asset ? t("updateAsset") : t("addAssetDesc")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-m-400">
					{error && (
						<div className="bg-fb-error/10 p-s-300 text-small text-fb-error rounded-md">
							{error}
						</div>
					)}

					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
						<div className="space-y-s-200">
							<Label
								id="label-asset-symbol"
								htmlFor="symbol"
								required
								filled={!!formData.symbol.trim()}
							>
								{t("symbol")}
							</Label>
							<Input
								id="symbol"
								placeholder={t("symbolPlaceholder")}
								value={formData.symbol}
								onChange={(e) =>
									handleChange("symbol", e.target.value.toUpperCase())
								}
								required
							/>
						</div>

						<div className="space-y-s-200">
							<Label
								id="label-asset-type"
								htmlFor="assetTypeId"
								required
								filled={!!formData.assetTypeId}
							>
								{t("type")}
							</Label>
							<Select
								value={formData.assetTypeId}
								onValueChange={(value) => handleChange("assetTypeId", value)}
								required
							>
								<SelectTrigger id="assetTypeId">
									<SelectValue placeholder={t("selectType")} />
								</SelectTrigger>
								<SelectContent>
									{assetTypes.map((type) => (
										<SelectItem key={type.id} value={type.id}>
											{type.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-s-200">
						<Label
							id="label-asset-name"
							htmlFor="name"
							required
							filled={!!formData.name.trim()}
						>
							{t("name")}
						</Label>
						<Input
							id="name"
							placeholder={t("namePlaceholder")}
							value={formData.name}
							onChange={(e) => handleChange("name", e.target.value)}
							required
						/>
					</div>

					<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-3">
						<div className="space-y-s-200">
							<Label
								id="label-asset-tick-size"
								htmlFor="tickSize"
								required
								filled={!!formData.tickSize}
							>
								{t("tickSize")}
							</Label>
							<Input
								id="tickSize"
								type="number"
								step="any"
								placeholder={t("tickSizePlaceholder")}
								value={formData.tickSize}
								onChange={(e) => handleChange("tickSize", e.target.value)}
								required
							/>
						</div>

						<div className="space-y-s-200">
							<Label
								id="label-asset-tick-value"
								htmlFor="tickValue"
								required
								filled={tickValue !== null && tickValue > 0}
							>
								{t("tickValue")} ({formData.currency})
							</Label>
							<CurrencyInput
								id="tickValue"
								value={tickValue}
								onValueChange={setTickValue}
								decimals={2}
								showPrefix={false}
							/>
							<p className="text-tiny text-txt-300">{t("tickValueHint")}</p>
						</div>

						<div className="space-y-s-200">
							<Label id="label-asset-currency" htmlFor="currency">
								{t("currency")}
							</Label>
							<Select
								value={formData.currency}
								onValueChange={(value) => handleChange("currency", value)}
							>
								<SelectTrigger id="currency">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="BRL">BRL</SelectItem>
									<SelectItem value="USD">USD</SelectItem>
									<SelectItem value="EUR">EUR</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-s-200">
						<Label id="label-asset-multiplier" htmlFor="multiplier">
							{t("multiplier")}
						</Label>
						<Input
							id="multiplier"
							type="number"
							step="any"
							placeholder="1"
							value={formData.multiplier}
							onChange={(e) => handleChange("multiplier", e.target.value)}
						/>
					</div>

					<DialogFooter>
						<Button
							id="asset-form-cancel"
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button id="asset-form-submit" type="submit" disabled={isPending}>
							{isPending && (
								<Loader2 className="mr-s-200 h-4 w-4 animate-spin motion-reduce:animate-none" />
							)}
							{asset ? tCommon("saveChanges") : t("addAsset")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
