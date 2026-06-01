"use client"

import type { ReactNode } from "react"
import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
} from "react"
import { useTranslations } from "next-intl"
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react"

type ToastType = "success" | "error" | "info" | "warning"

interface ToastAction {
	label: string
	onClick: () => void
}

interface Toast {
	id: string
	type: ToastType
	message: string
	action?: ToastAction
}

interface ToastContextType {
	showToast: (_type: ToastType, _message: string, _action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
	const context = useContext(ToastContext)
	if (!context) {
		throw new Error("useToast must be used within ToastProvider")
	}
	return context
}

const getIcon = (type: ToastType): ReactNode => {
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

const getStyles = (type: ToastType): string => {
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

/**
 * ToastProvider - Context provider for toast notifications
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
	const t = useTranslations("common")
	const [toasts, setToasts] = useState<Toast[]>([])
	const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map()
	)

	useEffect(() => {
		const timers = timerRefs.current
		return () => {
			for (const timer of timers.values()) {
				clearTimeout(timer)
			}
			timers.clear()
		}
	}, [])

	const dismissToast = useCallback((id: string) => {
		const timer = timerRefs.current.get(id)
		if (timer !== undefined) {
			clearTimeout(timer)
			timerRefs.current.delete(id)
		}
		setToasts((prev) => prev.filter((toast) => toast.id !== id))
	}, [])

	const showToast = useCallback(
		(type: ToastType, message: string, action?: ToastAction) => {
			const id = Date.now().toString()
			setToasts((prev) => [...prev, { id, type, message, action }])

			const timer = setTimeout(() => {
				timerRefs.current.delete(id)
				setToasts((prev) => prev.filter((toast) => toast.id !== id))
			}, 5000)
			timerRefs.current.set(id, timer)
		},
		[]
	)

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}

			{/* Toast container */}
			<div className="bottom-m-600 right-m-600 gap-m-400 pointer-events-none fixed z-50 flex flex-col">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className={`gap-m-400 px-m-600 py-m-500 pointer-events-auto flex items-center rounded-lg shadow-xl ${getStyles(toast.type)} animate-in slide-in-from-bottom-5 motion-reduce:animate-none`}
					>
						{getIcon(toast.type)}
						<span className="text-body font-medium">{toast.message}</span>
						{toast.action !== undefined && (
							<button
								type="button"
								onClick={() => {
									toast.action?.onClick()
									dismissToast(toast.id)
								}}
								className="ml-m-400 text-body font-semibold underline-offset-2 hover:underline"
							>
								{toast.action.label}
							</button>
						)}
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
