---
name: turborepo-project-setup
description: Use this skill when the user wants to configure or set up tooling on an already-created Turborepo monorepo. Triggers when the user asks to add Prettier, Husky, lint-staged, or any code quality tooling, establish folder structure and conventions, or make a Turborepo project production-ready. Also use this when the user says things like "set up my Turborepo", "configure tooling for my monorepo", "make my turborepo production grade", or "how should I structure my Turborepo" — even if they don't mention specific tools.
---

# Turborepo Project Setup (Production Grade)

A skill for setting up tooling on a production-ready Turborepo monorepo, with Prettier, Husky, and lint-staged configured out of the box.

---

## Step 1: Install Dev Dependencies

```bash
bun add -d prettier \
  @trivago/prettier-plugin-sort-imports \
  prettier-plugin-tailwindcss \
  husky \
  lint-staged \
  eslint
```

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

Create `.prettierignore`:

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

---

## Step 3: Configure turbo.json

Add these to the `tasks` object in `turbo.json`:

```json
"format": {
  "cache": false
},
"format:check": {
  "cache": false
}
```

---

## Step 4: Add Scripts to package.json

Add these to the `scripts` section of the root `package.json`:

```json
"format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,mdx,css}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,mdx,css}\"",
"lint-staged": "lint-staged",
"prepare": "husky"
```


---

## Step 5: Initialize Husky

```bash
bun run husky init
```

This creates a `.husky/` folder with a `pre-commit` file. Replace its contents with:

```bash
bun run lint-staged
```

---

## Step 6: Configure lint-staged

Create `.lintstagedrc.json` at the root:

```json
{
  "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,mdx,css,scss}": ["prettier --write"]
}
```

---

## Step 7: Add GitHub CI Pipeline

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

## Step 8: Configure ESLint

Create `eslint.config.mjs` at the root:

```js
import { config } from "@repo/eslint-config/base";
export default config;
```