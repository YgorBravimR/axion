# Skill Index

Skills live in `.claude/skills/`. Each has `scope`, `depends`, and `tokens` frontmatter. Shared utility: `.claude/skills/core/_caveman-rules.md`.

When a user request matches a skill, invoke it via the `Skill` tool. When in doubt, invoke the skill. The top-level routing decisions live in `CLAUDE.md`; this file lists the full per-skill catalog.

---

## Engineering Skills

| skill                                      | scope                             | purpose                                                                    |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------- |
| `nextjs-app-router-component-architecture` | `src/app/**, src/components/**`   | Server/client component patterns, RSC boundaries, container-presentational |
| `nextjs-cache-handler-optimization`        | `next.config.*, src/lib/cache/**` | Redis-backed cache handler, TTL strategy, tag invalidation                 |
| `react-best-practices`                     | `src/components/**, src/app/**`   | 45 Vercel perf rules: memoization, bundle, async, server fetching          |
| `harden`                                   | global                            | Error handling, i18n, edge cases, resilience                               |
| `optimize`                                 | global                            | CWV, render perf, animation, bundle size                                   |
| `extract`                                  | global                            | Extract reusable components/tokens into design system                      |

## Design Skills (all depend on `frontend-design` → `teach-impeccable`)

| skill                   | purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `frontend-design`       | Base: design principles, anti-patterns, Context Gathering Protocol |
| `teach-impeccable`      | One-time: gather + persist design context for project              |
| `adapt`                 | Adapt designs across screen sizes/devices/contexts                 |
| `animate`               | Motion library animations + micro-interactions                     |
| `arrange`               | Layout, spacing, visual rhythm                                     |
| `audit`                 | Comprehensive quality audit (a11y/perf/theme/responsive)           |
| `bolder`                | Amplify safe/boring designs                                        |
| `clarify`               | UX copy, error messages, microcopy                                 |
| `colorize`              | Strategic color addition                                           |
| `critique`              | Holistic UX design critique                                        |
| `delight`               | Joy/personality moments                                            |
| `distill`               | Strip unnecessary complexity                                       |
| `normalize`             | Align to design system standards                                   |
| `onboard`               | Onboarding flows, empty states                                     |
| `overdrive`             | Technically ambitious UI (shaders, physics)                        |
| `polish`                | Final quality pass before shipping                                 |
| `quieter`               | Tone down visual aggression                                        |
| `typeset`               | Typography: fonts, hierarchy, sizing                               |
| `web-design-guidelines` | Review against Web Interface Guidelines                            |

## Communication Skills

| skill              | purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `caveman`          | Ultra-compressed comms (lite/full/ultra/wenyan levels)                |
| `caveman-compress` | Compress CLAUDE.md/memory files to caveman format                     |
| `caveman-review`   | Ultra-compressed PR code review comments                              |
| `cavecrew`         | Delegate work to compressed subagents (investigator/builder/reviewer) |
