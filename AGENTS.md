# Agent Conventions — Axion

## Package manager

**Use `pnpm` only. Never use `bun` or `bunx` in this project.**

- Install: `pnpm install`
- Run script: `pnpm <script>` (e.g. `pnpm dev`, `pnpm test`)
- One-shot binary: `pnpm exec <bin>` (e.g. `pnpm exec tsc --noEmit`)
- Add dep: `pnpm add <pkg>` / `pnpm add -D <pkg>`

This applies to every command issued by an agent: typecheck, tests, codegen, migrations, lint, dev server, anything.
