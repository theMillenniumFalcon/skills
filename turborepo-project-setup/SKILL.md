---
name: turborepo-project-setup
description: Use this skill when the user wants to configure or set up tooling on an already-created Turborepo monorepo. Triggers when the user asks to add Prettier, Husky, lint-staged, or any code quality tooling, establish folder structure and conventions, or make a Turborepo project production-ready. Also use this when the user says things like "set up my Turborepo", "configure tooling for my monorepo", "make my turborepo production grade", or "how should I structure my Turborepo" — even if they don't mention specific tools.
---

# Turborepo Project Setup (Production Grade)

A skill for setting up tooling on a production-ready Turborepo monorepo — Prettier, ESLint, Husky, lint-staged, and GitHub CI.

---

## Before You Start

Check that the following already exist before proceeding. If they don't, flag it to the user:

- `turbo.json` at the root — if missing, run `bunx create-turbo@latest` first
- `package.json` at the root with `"workspaces"` defined
- `packages/eslint-config` in the monorepo — needed for Step 3. `create-turbo` generates this package by default, so it should already exist. However, the default scaffold exports a single default export — **not** a named `/base` export. Check before Step 3 by running: `cat packages/eslint-config/package.json` and looking for an `"exports"` field with a `"./base"` entry. If it's missing, follow the fix in Step 3
- `bun.lock` or confirmation that bun is the package manager — if using npm/pnpm, adjust all `bun` commands accordingly

---

## Step 1: Install Dev Dependencies

Run this from the **root** of the monorepo:

```bash
bun add -d prettier \
  @trivago/prettier-plugin-sort-imports \
  prettier-plugin-tailwindcss \
  husky \
  lint-staged \
  eslint
```

> If you see a workspace conflict error, add `-W` flag: `bun add -d -W prettier ...`

---

## Step 2: Configure Prettier

Create `.prettierrc.json` at the root:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": [
    "@trivago/prettier-plugin-sort-imports",
    "prettier-plugin-tailwindcss"
  ],
  "importOrder": [
    "^react",
    "^next",
    "<THIRD_PARTY_MODULES>",
    "^@repo/(.*)$",
    "^@/(.*)$",
    "^[./]"
  ],
  "importOrderSeparation": true,
  "importOrderSortSpecifiers": true,
  "importOrderGroupNamespaceSpecifiers": true,
  "importOrderCaseInsensitive": true
}
```

Create `.prettierignore` at the root:

```
# Dependencies
node_modules
**/node_modules

# Build outputs
.next
out
dist
build
**/dist
**/.next
**/out
**/build

# Generated files
*.min.js
*.min.css
coverage
.nyc_output

# Lock files
package-lock.json
yarn.lock
pnpm-lock.yaml
bun.lock

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode
.idea
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
```

**Verify:** Run `bun run format` — it should format files without errors. If you see `Cannot find module '@trivago/prettier-plugin-sort-imports'`, the install didn't run from the root. Make sure you're not inside a workspace package.

---

## Step 3: Configure ESLint

First, verify that `packages/eslint-config` exports a `/base` entrypoint — `create-turbo` generates the package by default but does **not** include a `/base` export. Check:

```bash
cat packages/eslint-config/package.json
```

Look for an `"exports"` field containing `"./base"`. If it's missing, add it:

```json
{
  "name": "@repo/eslint-config",
  "exports": {
    "./base": "./base.js"
  }
}
```

Then create `packages/eslint-config/base.js` if it doesn't exist:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
```

Install the required deps inside the package:

```bash
cd packages/eslint-config && bun add -d @eslint/js typescript-eslint
```

Now create `eslint.config.mjs` at the monorepo root:

```js
import { config } from "@repo/eslint-config/base";
export default config;
```

**Verify:** Run `bun run lint` — it should lint without a module resolution error. If you see `Cannot find package '@repo/eslint-config'`, run `bun install` from the root to re-link workspaces.

---

## Step 4: Configure turbo.json

Add these to the `tasks` object in `turbo.json`:

```json
"lint": {},
"format": {
  "cache": false
},
"format:check": {
  "cache": false
},
"check-types": {
  "cache": false
},
"build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**", "dist/**"]
}
```

> `dependsOn: ["^build"]` means a package's build waits for all its dependencies to build first — this is correct for most monorepos. `outputs` tells Turborepo what to cache; adjust if your build output goes somewhere different (e.g. `out/**` for static Next.js exports).

---

## Step 5: Add Scripts to package.json

Add these to the `scripts` section of the **root** `package.json`:

```json
"format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,mdx,css}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,mdx,css}\"",
"lint": "eslint .",
"lint-staged": "lint-staged",
"check-types": "tsc --noEmit",
"prepare": "husky"
```

---

## Step 6: Initialize Husky

```bash
bun run husky init
```

This creates `.husky/pre-commit`. Replace its contents with:

```bash
bun run lint-staged
```

**Verify:** Run `git commit --allow-empty -m "test"` — you should see lint-staged execute. If the hook doesn't fire, check that `.husky/pre-commit` is executable: `chmod +x .husky/pre-commit`.

---

## Step 7: Configure lint-staged

Create `.lintstagedrc.json` at the root:

```json
{
  "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,mdx,css,scss}": ["prettier --write"]
}
```

---

## Step 8: Add GitHub CI Pipeline

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches:
      - main
      - dev
  push:
    branches:
      - main
      - dev
jobs:
  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install
      - name: Lint code
        run: bun run lint
  format:
    name: format
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install
      - name: Format code
        run: bun run format
  check-types:
    name: check-types
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install
      - name: Check types
        run: bun run check-types
  build:
    name: build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install
      - name: Build
        run: bun run build
```

---

## Final Verification Checklist

Run through these to confirm everything is wired up correctly:

- [ ] `bun run format` — formats files, no errors
- [ ] `bun run format:check` — passes on a freshly formatted codebase
- [ ] `bun run lint` — lints without module resolution errors
- [ ] `bun run check-types` — no TypeScript errors
- [ ] `bun run build` — builds all apps successfully
- [ ] `git commit --allow-empty -m "test"` — triggers the pre-commit hook and lint-staged runs

---

## Common Errors

**`Cannot find module 'prettier-plugin-tailwindcss'`**
Prettier plugins must be installed at the root, not inside a workspace package. Re-run the install from the monorepo root.

**`Husky pre-commit hook not firing`**
Run `chmod +x .husky/pre-commit` and make sure `prepare` script ran via `bun install`.

**`turbo: command not found`**
Turbo is not installed. Run `bun add -d turbo -W` at the root.

**`eslint: Cannot find module '@repo/eslint-config'`**
The `packages/eslint-config` package isn't linked. Run `bun install` from the root to re-link workspaces.