// Zod helpers. Centralized to avoid `error.issues[0]!` peppered across actions
// (noUncheckedIndexedAccess types `issues[0]` as ZodIssue | undefined even
// though Zod guarantees at least one issue whenever a parse fails).

import type { ZodError } from "zod"

const FALLBACK_ISSUE_MESSAGE = "Validation failed"

// Returns the first issue's message, or a fallback if Zod's contract is
// somehow violated (should never happen — `success: false` always carries
// at least one issue). Centralizing the fallback prevents drift.
export const firstIssueMessage = <T>(error: ZodError<T>): string =>
	error.issues[0]?.message ?? FALLBACK_ISSUE_MESSAGE
