---
description: Multi-agent review team — code quality, i18n, simplification, Claude Opus review, then commit
allowed-tools: Agent, Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Read, Glob, Grep, Edit
---

# Finish It

Create an agent team to coordinate multiple agents reviewing the code:

## Phase 1: Review (launch ALL in parallel)

1. **@react-guidelines-enforcer** — Review against CLAUDE.md conventions and react-best-practices rules. Fix violations.
2. **@i18n-translator** — Audit for hardcoded strings that should be in translation files. Extract and add keys.
3. **@code-simplifier** — Look for simplifications, redundancy, and clarity improvements on recently changed code.
4. **@claude (Claude Opus reviewer)** — Launch **@claude** with `model: opus`. Personal-repo policy: reviews are **Claude-only**, no external tools (no Codex, no CodeRabbit). Give it full, self-contained context — it starts fresh and sees none of this conversation.

   Prompt:

   > You are a senior reviewer doing an independent pass on this branch's diff before commit, in a Claude-only review flow (no external reviewers run here).
   >
   > Gather context yourself first: run `git status` and `git diff main...HEAD`; read the repo's `CLAUDE.md` for conventions, invariants, protected paths, and domain rules; read enough surrounding code that each changed line is understood in context.
   >
   > Review for what deep reasoning catches: correctness across the whole change (broken invariants, inconsistent state between files, caller/callee contract mismatches); edge cases, off-by-one, null/empty/boundary handling, concurrency/ordering hazards; security (auth, input validation, secrets, injection); whether the change does what its comments/intent claim; missing error handling, silent failures, observability gaps.
   >
   > Do NOT comment on style, formatting, or naming — the other reviewers and lint-staged handle that. Report findings as a short bulleted list ordered by severity, each as `file:line — problem — suggested fix`. Under 300 words. Fix clear bugs directly via `Edit`; flag judgement calls and stop.

## Phase 2: Commit

After all reviewers complete, use **@git-commit-helper** to stage and commit all changes. **Include the token `[quality-gate: already-reviewed]` in its prompt** — Phase 1 IS the quality gate, so git-commit-helper must skip its own gate and commit directly (otherwise the reviews recurse).

The commit message should be about the actual code changes in the diff — NOT about what the reviewers did.

Focus on: $ARGUMENTS
