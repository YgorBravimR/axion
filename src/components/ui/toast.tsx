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
	count: number
}

const TOAST_DURATION_MS = 5000

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

	const scheduleAutoDismiss = useCallback((id: string) => {
		const existing = timerRefs.current.get(id)
		if (existing !== undefined) {
			clearTimeout(existing)
		}
		const timer = setTimeout(() => {
			timerRefs.current.delete(id)
			setToasts((prev) => prev.filter((toast) => toast.id !== id))
		}, TOAST_DURATION_MS)
		timerRefs.current.set(id, timer)
	}, [])

	const pauseAutoDismiss = useCallback((id: string) => {
		const existing = timerRefs.current.get(id)
		if (existing !== undefined) {
			clearTimeout(existing)
			timerRefs.current.delete(id)
		}
	}, [])

	const showToast = useCallback(
		(type: ToastType, message: string, action?: ToastAction) => {
			// Stack identical action-less toasts: same type + same message bumps the
			// existing toast's count and resets its timer. Action-bearing toasts
			// never stack — each undo onClick captures a unique closure, so merging
			// them would make "undo which one?" ambiguous.
			if (action === undefined) {
				let stackedId: string | undefined
				setToasts((prev) => {
					const matchIndex = prev.findIndex(
						(toast) =>
							toast.type === type &&
							toast.message === message &&
							toast.action === undefined
					)
					if (matchIndex === -1) {
						return prev
					}
					stackedId = prev[matchIndex]?.id
					return prev.map((toast, i) =>
						i === matchIndex ? { ...toast, count: toast.count + 1 } : toast
					)
				})
				if (stackedId !== undefined) {
					scheduleAutoDismiss(stackedId)
					return
				}
			}
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
			setToasts((prev) => [...prev, { id, type, message, action, count: 1 }])
			scheduleAutoDismiss(id)
		},
		[scheduleAutoDismiss]
	)

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}

			{/* Toast container */}
			<div className="bottom-m-600 right-m-600 gap-m-400 pointer-events-none fixed z-50 flex flex-col">
				{toasts.map((toast) => {
					const stacked = toast.count > 1
					return (
						<div
							key={toast.id}
							role="status"
							onMouseEnter={() => pauseAutoDismiss(toast.id)}
							onMouseLeave={() => scheduleAutoDismiss(toast.id)}
							onFocus={() => pauseAutoDismiss(toast.id)}
							onBlur={() => scheduleAutoDismiss(toast.id)}
							className={`gap-m-400 px-m-600 py-m-500 pointer-events-auto relative isolate flex items-center rounded-lg shadow-xl ${getStyles(toast.type)} animate-in slide-in-from-bottom-5 motion-reduce:animate-none ${
								stacked
									? "before:absolute before:inset-0 before:-z-10 before:translate-x-1.5 before:translate-y-1.5 before:rounded-lg before:bg-current before:opacity-50 after:absolute after:inset-0 after:-z-20 after:translate-x-3 after:translate-y-3 after:rounded-lg after:bg-current after:opacity-25"
									: ""
							}`}
						>
							{stacked && (
								<span
									className="bg-bg-100 text-txt-100 text-tiny shadow-small absolute -top-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-semibold"
									aria-label={t("stackedCount", { count: toast.count })}
								>
									{toast.count}
								</span>
							)}
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
					)
				})}
			</div>
		</ToastContext.Provider>
	)
}
