"use client"

import { createContext, useContext, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react"

type ToastType = "success" | "error" | "info" | "warning"

interface Toast {
	id: string
	type: ToastType
	message: string
}

interface ToastContextType {
	showToast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
	const context = useContext(ToastContext)
	if (!context) {
		throw new Error("useToast must be used within ToastProvider")
	}
	return context
}

/**
 * ToastProvider - Context provider for toast notifications
 */
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
	const t = useTranslations("common")
	const [toasts, setToasts] = useState<Toast[]>([])

	const showToast = useCallback((type: ToastType, message: string) => {
		const id = Date.now().toString()
		setToasts((prev) => [...prev, { id, type, message }])

		// Auto-dismiss after 5 seconds
		setTimeout(() => {
			setToasts((prev) => prev.filter((toast) => toast.id !== id))
		}, 5000)
	}, [])

	const dismissToast = (id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id))
	}

	const getIcon = (type: ToastType) => {
		switch (type) {
			case "success":
				return <CheckCircle className="h-5 w-5" />
			case "error":
				return <XCircle className="h-5 w-5" />
			case "info":
				return <Info className="h-5 w-5" />
			case "warning":
				return <AlertTriangle className="h-5 w-5" />
		}
	}

	const getStyles = (type: ToastType) => {
		switch (type) {
			case "success":
				return "bg-acc-100 text-bg-100"
			case "error":
				return "bg-fb-error text-bg-100"
			case "info":
				return "bg-acc-200 text-bg-100"
			case "warning":
				return "bg-acc-100/80 text-bg-100"
		}
	}

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}

			{/* Toast container */}
			<div className="pointer-events-none fixed bottom-m-600 right-m-600 z-50 flex flex-col gap-m-400">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className={`pointer-events-auto flex items-center gap-m-400 rounded-lg px-m-600 py-m-500 shadow-xl ${getStyles(toast.type)} animate-in slide-in-from-bottom-5`}
					>
						{getIcon(toast.type)}
						<span className="text-body font-medium">{toast.message}</span>
						<button
							type="button"
							onClick={() => dismissToast(toast.id)}
							className="ml-m-400 hover:opacity-80"
							aria-label={t("dismiss")}
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	)
}
