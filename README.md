# skills

A collection of reusable AI agent skills for [skills.sh](https://skills.sh) — opinionated, production-grade setup guides for the tools and workflows I use day to day.

## Installation

Install any skill using the `skills` CLI:

```bash
npx skills add themillenniumfalcon/skills --skill=<skill-name>
```

Or install all skills from this repo at once:

```bash
npx skills add themillenniumfalcon/skills
```

---

## Available Skills

### Setup

| Skill | Description |
|-------|-------------|
| [`turborepo-project-setup`](./skills/turborepo-project-setup/SKILL.md) | Configure tooling on an already-created Turborepo monorepo — Prettier, ESLint, Husky, lint-staged, and GitHub CI |
| [`prisma-setup`](./skills/prisma-setup/SKILL.md) | Set up Prisma ORM with PostgreSQL, MySQL, or SQLite — includes client singleton, Zod schema generation, and migration scripts |
| [`better-auth-setup`](./skills/better-auth-setup/SKILL.md) | Set up Better Auth in a Next.js App Router project — Prisma adapter, Email & Password, Google OAuth, and Admin plugin |
| [`shadcn-setup`](./skills/shadcn-setup/SKILL.md) | Set up shadcn/ui with Tailwind v4, CSS variables, custom brand theme, and a baseline component script |
| [`env-validation-setup`](./skills/env-validation-setup/SKILL.md) | Type-safe, build-time validated environment variables using `@t3-oss/env-nextjs` and Zod |
| [`stripe-setup`](./skills/stripe-setup/SKILL.md) | Integrate Stripe into a Next.js App Router project — one-time payments, subscriptions, webhooks, plan-based feature gating, and usage tracking |
| [`email-setup`](./skills/email-setup/SKILL.md) | Transactional email with Resend and React Email — welcome, password reset, and invoice templates, Better Auth integration, and webhook handling |

### Go

| Skill | Description |
|-------|-------------|
| [`go-api-setup`](./skills/go-api-setup/SKILL.md) | Scaffold a production-grade Go REST API — Chi router, pgx, sqlc, Air hot reload, slog, Makefile, and multi-stage Dockerfile |

### Patterns & Best Practices

| Skill | Description |
|-------|-------------|
| [`tailwind-patterns`](./skills/tailwind-patterns/SKILL.md) | Tailwind CSS patterns — `cn()`, `cva` variants, responsive design, dark mode, and common UI patterns |
| [`mongodb-queries`](./skills/mongodb-queries/SKILL.md) | Efficient MongoDB query patterns — aggregation pipelines, indexes, transactions, and schema design with Mongoose + TypeScript |
| [`postgres-queries`](./skills/postgres-queries/SKILL.md) | Efficient PostgreSQL query patterns — CTEs, window functions, transactions, locking, and schema design with Prisma + TypeScript |

### Debugging

| Skill | Description |
|-------|-------------|
| [`docker-debugging`](./skills/docker-debugging/SKILL.md) | Debug Docker and Docker Compose issues — containers not starting, build failures, networking, volumes, and performance |

---

## What are Skills?

Skills are markdown files that give AI agents (like Claude) reusable, structured instructions for completing specific tasks. Instead of explaining your preferred setup every time, you install a skill once and the agent knows exactly how you like things done.

Think of them like dotfiles — but for your AI agent.

---

## Contributing

These skills are tailored to my personal workflow, but feel free to fork and adapt them for your own. If you spot something wrong or outdated, PRs are welcome.