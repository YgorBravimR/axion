"use client"

/**
 * NarratorPanel — the AI Assistant client UI.
 *
 * Renders a Sheet (right-side slideover) that:
 *   1. Shows suggested prompts (i18n-driven, one click → send).
 *   2. Lets the user type a question.
 *   3. POSTs to `/api/ai/narrate` and reads the SSE stream.
 *   4. Renders tool calls as collapsed lines (so the user sees the audit
 *      trail) and the final narration text in full.
 *
 * The component is rendered ONLY by an open <AskButton/> — when the gate is
 * closed, the AskButton returns null and this code path is unreachable.
 * No defensive gate check here; the server is the source of truth.
 */
import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NarratorPanelProps {
	open: boolean
	onOpenChange: (_open: boolean) => void
	tradeId: string
}

interface ToolTraceEntry {
	name: string
	result: unknown
}

interface AgentEventBase {
	type: string
}

const NarratorPanel = ({
	open: isOpen,
	onOpenChange,
	tradeId,
}: NarratorPanelProps): React.ReactElement => {
	const t = useTranslations("assistant")
	const [prompt, setPrompt] = useState("")
	const [streaming, setStreaming] = useState(false)
	const [narration, setNarration] = useState<string | null>(null)
	const [tools, setTools] = useState<ToolTraceEntry[]>([])
	const [errorMsg, setErrorMsg] = useState<string | null>(null)
	const [budgetExceeded, setBudgetExceeded] = useState<{
		capCents: number
		spentCents: number
	} | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	const reset = useCallback(() => {
		setNarration(null)
		setTools([])
		setErrorMsg(null)
		setBudgetExceeded(null)
	}, [])

	const send = useCallback(
		async (userMessage: string) => {
			if (!userMessage.trim() || streaming) {
				return
			}
			reset()
			setStreaming(true)
			const controller = new AbortController()
			abortRef.current = controller

			try {
				const response = await fetch("/api/ai/narrate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ tradeId, userMessage }),
					signal: controller.signal,
				})

				if (response.status === 404) {
					setErrorMsg(t("errors.unavailable"))
					return
				}
				if (!response.ok || !response.body) {
					setErrorMsg(t("errors.network"))
					return
				}

				const reader = response.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ""

				while (true) {
					// SSE consumption is inherently sequential — each chunk depends
					// on the previous read having completed. Parallelizing is a
					// category error.
					// eslint-disable-next-line no-await-in-loop
					const { value, done } = await reader.read()
					if (done) {
						break
					}
					buffer += decoder.decode(value, { stream: true })
					let nlIdx = buffer.indexOf("\n\n")
					while (nlIdx !== -1) {
						const frame = buffer.slice(0, nlIdx)
						buffer = buffer.slice(nlIdx + 2)
						const dataLine = frame
							.split("\n")
							.find((l) => l.startsWith("data:"))
						if (dataLine) {
							const json = dataLine.slice(5).trim()
							try {
								const event = JSON.parse(json) as AgentEventBase
								handleEvent(event)
							} catch {
								// Malformed frame — skip, keep stream alive.
							}
						}
						nlIdx = buffer.indexOf("\n\n")
					}
				}
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					setErrorMsg(t("errors.network"))
				}
			} finally {
				setStreaming(false)
				abortRef.current = null
			}
		},
		[reset, streaming, t, tradeId]
	)

	const handleEvent = (event: AgentEventBase) => {
		switch (event.type) {
			case "tool_call": {
				const ev = event as AgentEventBase & { name: string }
				setTools((prev) => [...prev, { name: ev.name, result: null }])
				break
			}
			case "tool_result": {
				const ev = event as AgentEventBase & {
					name: string
					result: unknown
				}
				setTools((prev) => {
					const next = [...prev]
					for (let i = next.length - 1; i >= 0; i -= 1) {
						const entry = next[i]
						if (entry && entry.name === ev.name && entry.result === null) {
							next[i] = { ...entry, result: ev.result }
							return next
						}
					}
					return next
				})
				break
			}
			case "token": {
				const ev = event as AgentEventBase & { text: string }
				setNarration(ev.text)
				break
			}
			case "budget_exceeded": {
				const ev = event as AgentEventBase & {
					capCents: number
					spentCents: number
				}
				setBudgetExceeded({
					capCents: ev.capCents,
					spentCents: ev.spentCents,
				})
				break
			}
			case "error": {
				const ev = event as AgentEventBase & { code: string; message: string }
				setErrorMsg(ev.message || t("errors.generic"))
				break
			}
			case "done":
			default:
				break
		}
	}

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		void send(prompt)
		setPrompt("")
	}

	const suggestedPrompts = [
		t("suggested.narrate"),
		t("suggested.indicators"),
		t("suggested.cohort"),
	]

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent
				id="ai-assistant-narrator"
				side="right"
				className="bg-bg-100 flex w-full max-w-xl flex-col gap-4 overflow-y-auto p-6"
			>
				<SheetHeader>
					<SheetTitle>{t("title")}</SheetTitle>
					<SheetDescription>{t("subtitle")}</SheetDescription>
				</SheetHeader>

				{!narration && !streaming && !errorMsg && !budgetExceeded ? (
					<div className="flex flex-col gap-2">
						<p className="text-tiny text-txt-300">{t("suggested.label")}</p>
						{suggestedPrompts.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => void send(s)}
								className="border-bg-300 bg-bg-200 text-small text-txt-100 hover:border-acc-100 hover:bg-bg-300 rounded-md border px-3 py-2 text-left transition"
							>
								{s}
							</button>
						))}
					</div>
				) : null}

				{tools.length > 0 ? (
					<div className="border-bg-300 bg-bg-200 rounded-md border p-3">
						<p className="text-tiny text-txt-300 mb-2 font-semibold">
							{t("audit.label")}
						</p>
						<ul className="space-y-1">
							{tools.map((tc, i) => (
								<li
									key={`${tc.name}-${i}`}
									className="text-tiny text-txt-300 font-mono"
								>
									→ {tc.name}
									{tc.result === null ? "…" : " ✓"}
								</li>
							))}
						</ul>
					</div>
				) : null}

				{narration ? (
					<div
						className={cn(
							"border-bg-300 bg-bg-200 text-small text-txt-100 rounded-md border p-4 whitespace-pre-wrap"
						)}
						data-testid="narrator-output"
					>
						{narration}
					</div>
				) : null}

				{streaming ? (
					<p className="text-tiny text-txt-300">{t("streaming")}</p>
				) : null}

				{budgetExceeded ? (
					<div
						className="border-warning bg-bg-200 text-small text-warning rounded-md border p-3"
						data-testid="narrator-budget-exceeded"
					>
						{t("errors.budget", {
							spent: (budgetExceeded.spentCents / 100).toFixed(2),
							cap: (budgetExceeded.capCents / 100).toFixed(2),
						})}
					</div>
				) : null}

				{errorMsg ? (
					<div
						className="border-trade-sell bg-bg-200 text-small text-trade-sell rounded-md border p-3"
						data-testid="narrator-error"
					>
						{errorMsg}
					</div>
				) : null}

				<form onSubmit={onSubmit} className="mt-auto flex flex-col gap-2">
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={t("input.placeholder")}
						rows={3}
						disabled={streaming}
						className="border-bg-300 bg-bg-200 text-small text-txt-100 placeholder:text-txt-300 focus:border-acc-100 w-full resize-none rounded-md border p-3 focus:outline-none disabled:opacity-50"
						data-testid="narrator-input"
					/>
					<div className="flex justify-between gap-2">
						<Button
							id="ai-assistant-clear"
							type="button"
							variant="ghost"
							size="sm"
							onClick={reset}
							disabled={streaming}
						>
							{t("actions.clear")}
						</Button>
						<Button
							id="ai-assistant-send"
							type="submit"
							size="sm"
							disabled={streaming || !prompt.trim()}
							data-testid="narrator-send"
						>
							{streaming ? t("actions.streaming") : t("actions.send")}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	)
}

export { NarratorPanel }
export type { NarratorPanelProps }
