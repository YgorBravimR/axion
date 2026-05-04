"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { getFeeRates, upsertFeeRates } from "@/app/actions/tax-engine"

const FeeRateForm = () => {
	const { showToast } = useToast()
	const [isLoading, setIsLoading] = useState(true)
	const [isPending, startTransition] = useTransition()

	const [values, setValues] = useState({
		txCorretagem: "0.0500",
		txRegistro: "0.7400",
		emolumentos: "0.4000",
		issRate: "5.00",
		irrfRate: "1.00",
		irRate: "20.00",
		subjectToPersonalIr: true,
	})

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await getFeeRates()
			if (!mounted) return
			if (result.status === "success" && result.data) {
				setValues({
					txCorretagem: (result.data.txCorretagemCents / 100).toFixed(4),
					txRegistro: (result.data.txRegistroCents / 100).toFixed(4),
					emolumentos: (result.data.emolumentosCents / 100).toFixed(4),
					issRate: result.data.issRatePercent,
					irrfRate: (result.data.irrfRateBps / 100).toFixed(2),
					irRate: (result.data.irRateBps / 100).toFixed(2),
					subjectToPersonalIr: result.data.subjectToPersonalIr,
				})
			}
			setIsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [])

	const handleTextChange =
		(field: keyof Omit<typeof values, "subjectToPersonalIr">) =>
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setValues((prev) => ({ ...prev, [field]: e.target.value }))
		}

	const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setValues((prev) => ({ ...prev, subjectToPersonalIr: e.target.checked }))
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		startTransition(async () => {
			const result = await upsertFeeRates({
				txCorretagemCents: Math.round(parseFloat(values.txCorretagem) * 100),
				txRegistroCents: Math.round(parseFloat(values.txRegistro) * 100),
				emolumentosCents: Math.round(parseFloat(values.emolumentos) * 100),
				issRatePercent: values.issRate,
				irrfRateBps: Math.round(parseFloat(values.irrfRate) * 100),
				irRateBps: Math.round(parseFloat(values.irRate) * 100),
				subjectToPersonalIr: values.subjectToPersonalIr,
			})
			if (result.status === "success") {
				showToast("success", "Taxas salvas")
			} else {
				showToast("error", result.message ?? "Erro ao salvar taxas")
			}
		})
	}

	const fields: Array<{
		key: keyof Omit<typeof values, "subjectToPersonalIr">
		label: string
		hint: string
		step: string
	}> = [
		{
			key: "txCorretagem",
			label: "Tx Corretagem (R$/contrato)",
			hint: "Ex: 0.0500 = R$0,05 por contrato",
			step: "0.0001",
		},
		{
			key: "txRegistro",
			label: "Tx Registro (R$/contrato)",
			hint: "Ex: 0.7400 = R$0,74 por contrato",
			step: "0.0001",
		},
		{
			key: "emolumentos",
			label: "Emolumentos (R$/contrato)",
			hint: "Ex: 0.4000 = R$0,40 por contrato",
			step: "0.0001",
		},
		{
			key: "issRate",
			label: "ISS (% sobre Corretagem)",
			hint: "São Paulo: 5,00% (padrão)",
			step: "0.01",
		},
		{
			key: "irrfRate",
			label: "IRRF (%)",
			hint: "Padrão: 1,00%",
			step: "0.01",
		},
		{
			key: "irRate",
			label: "IR Day-trade (%)",
			hint: "Padrão: 20,00%",
			step: "0.01",
		},
	]

	if (isLoading) {
		return <p className="text-small text-txt-300">Carregando taxas...</p>
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-m-400"
			aria-label="Configuração de taxas e corretagem"
		>
			<div className="grid grid-cols-1 gap-m-400 sm:grid-cols-2">
				{fields.map(({ key, label, hint, step }) => (
					<div key={key} className="space-y-s-100">
						<Label id={`fee-${key}-label`} htmlFor={`fee-${key}`} className="text-small text-txt-200">
							{label}
						</Label>
						<Input
							id={`fee-${key}`}
							type="number"
							step={step}
							min="0"
							value={values[key]}
							onChange={handleTextChange(key)}
							aria-describedby={`fee-${key}-hint`}
							className="font-mono"
						/>
						<p id={`fee-${key}-hint`} className="text-tiny text-txt-300">
							{hint}
						</p>
					</div>
				))}
			</div>

			<label className="flex items-center gap-s-200 text-small text-txt-200 cursor-pointer">
				<input
					id="fee-subjectToPersonalIr"
					type="checkbox"
					checked={values.subjectToPersonalIr}
					onChange={handleCheckboxChange}
					aria-label="Sujeito a IR pessoal (desmarcar para contas prop)"
					className="rounded"
				/>
				Sujeito a IR pessoal (desmarcar para contas prop)
			</label>

			<Button
				id="fee-rate-form-submit"
				type="submit"
				disabled={isPending}
				aria-label="Salvar taxas"
			>
				{isPending ? "Salvando..." : "Salvar Taxas"}
			</Button>
		</form>
	)
}

export { FeeRateForm }
