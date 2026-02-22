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

| Skill | Description |
|-------|-------------|
| [`turborepo-project-setup`](./skills/turborepo-project-setup/SKILL.md) | Configure tooling on an already-created Turborepo monorepo — Prettier, ESLint, Husky, lint-staged, and GitHub CI |

---

## Repo Structure

```
skills/
└── skills/
    └── turborepo-project-setup/
        └── SKILL.md
```

Each skill lives in its own folder under `skills/` and contains a `SKILL.md` file with step-by-step instructions the AI agent follows.

---

## What are Skills?

Skills are markdown files that give AI agents (like Claude) reusable, structured instructions for completing specific tasks. Instead of explaining your preferred setup every time, you install a skill once and the agent knows exactly how you like things done.

Think of them like dotfiles — but for your AI agent.

---

## Contributing

These skills are tailored to my personal workflow, but feel free to fork and adapt them for your own. If you spot something wrong or outdated, PRs are welcome.