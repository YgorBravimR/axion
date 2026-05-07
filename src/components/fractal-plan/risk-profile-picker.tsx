"use client"

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { RiskManagementProfile } from "@/types/risk-profile"

interface RiskProfilePickerProps {
	profiles: RiskManagementProfile[]
	value: string | null
	onChange: (next: string | null) => void
	id: string
	placeholder?: string
	disabled?: boolean
}

const NONE_VALUE = "__none__"

const RiskProfilePicker = ({
	profiles,
	value,
	onChange,
	id,
	placeholder = "Select risk profile",
	disabled = false,
}: RiskProfilePickerProps) => {
	const handleChange = (raw: string) => {
		onChange(raw === NONE_VALUE ? null : raw)
	}

	return (
		<Select
			value={value ?? NONE_VALUE}
			onValueChange={handleChange}
			disabled={disabled}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE_VALUE}>
					<span className="text-txt-300">None (cascade fallback)</span>
				</SelectItem>
				{profiles.map((p) => (
					<SelectItem key={p.id} value={p.id}>
						{p.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export type { RiskProfilePickerProps }
export { RiskProfilePicker }
