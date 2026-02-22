---
name: shadcn-setup
description: Use this skill when the user wants to set up shadcn/ui in a Next.js project. Triggers when the user asks to add shadcn, install UI components, configure a component library, set up a design system, or customize a theme. Also use this when the user says things like "add shadcn to my project", "set up shadcn", "install shadcn components", "configure my UI library", or "set up theming" — even if they don't mention Tailwind or CSS variables specifically.
---

# shadcn/ui Setup (Next.js + Tailwind v4 + CSS Variables + Custom Theme)

A skill for setting up shadcn/ui in a standalone Next.js project using Tailwind v4, CSS variables, and a customizable brand color palette.

---

## Before You Start

Check these before proceeding:

- **Is Tailwind already installed?** shadcn requires Tailwind CSS. If it's not set up, the `bunx shadcn@latest init` command will set it up for you — but confirm first so you don't overwrite an existing config.
- **Which Next.js version?** This skill targets Next.js 14/15 with App Router. Pages Router works but some paths differ (e.g. `_app.tsx` instead of `layout.tsx`).
- **No `tailwind.config.js` needed for Tailwind v4** — all config lives in `globals.css`. If a `tailwind.config.js` or `tailwind.config.ts` exists from a v3 setup, it should be removed after migration.
- **`tailwindcss-animate` is deprecated for v4** — shadcn now uses `tw-animate-css` instead. Don't install `tailwindcss-animate`.

---

## Step 1: Initialize shadcn

Run the init command from the project root:

```bash
bunx shadcn@latest init
```

When prompted, answer:

- **Style:** Default
- **Base color:** Slate
- **CSS variables:** Yes

This creates:
- `components.json` — shadcn config
- `src/components/ui/` — where components will live
- `src/lib/utils.ts` — the `cn()` helper
- Updates `src/app/globals.css` with base CSS variables

**Verify:** Check that `src/lib/utils.ts` exists and contains the `cn()` helper. If the file is missing, the init failed — re-run with `bunx shadcn@latest init --force`.

---

## Step 2: Install tw-animate-css

shadcn uses `tw-animate-css` for animations in Tailwind v4 (not `tailwindcss-animate`):

```bash
bun add tw-animate-css
```

---

## Step 3: Configure components.json

Confirm `components.json` at the root looks like this:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

> `tailwind.config` must be empty string `""` for Tailwind v4 — no config file is used.

---

## Step 4: Set Up globals.css

Replace the contents of `src/app/globals.css` with the following. This follows the Tailwind v4 `@theme inline` pattern — CSS variables are defined at `:root`, then mapped to Tailwind utilities via `@theme inline`.

```css
@import "tailwindcss";
@import "tw-animate-css";

/* ─── Brand Colors ─────────────────────────────────────────────
   Override these HSL values to match your brand.
   Use a tool like https://www.tints.dev to generate a palette.
──────────────────────────────────────────────────────────────── */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222 47% 11%);

  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222 47% 11%);

  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(222 47% 11%);

  /* Primary — default indigo, override with your brand color */
  --primary: hsl(221 83% 53%);
  --primary-foreground: hsl(0 0% 100%);

  /* Secondary */
  --secondary: hsl(210 40% 96%);
  --secondary-foreground: hsl(222 47% 11%);

  /* Muted */
  --muted: hsl(210 40% 96%);
  --muted-foreground: hsl(215 16% 47%);

  /* Accent */
  --accent: hsl(210 40% 96%);
  --accent-foreground: hsl(222 47% 11%);

  /* Destructive */
  --destructive: hsl(0 84% 60%);
  --destructive-foreground: hsl(0 0% 100%);

  /* Border, Input, Ring */
  --border: hsl(214 32% 91%);
  --input: hsl(214 32% 91%);
  --ring: hsl(221 83% 53%);

  /* Radius */
  --radius: 0.5rem;
}

.dark {
  --background: hsl(222 47% 11%);
  --foreground: hsl(210 40% 98%);

  --card: hsl(222 47% 11%);
  --card-foreground: hsl(210 40% 98%);

  --popover: hsl(222 47% 11%);
  --popover-foreground: hsl(210 40% 98%);

  --primary: hsl(217 91% 60%);
  --primary-foreground: hsl(222 47% 11%);

  --secondary: hsl(217 33% 17%);
  --secondary-foreground: hsl(210 40% 98%);

  --muted: hsl(217 33% 17%);
  --muted-foreground: hsl(215 20% 65%);

  --accent: hsl(217 33% 17%);
  --accent-foreground: hsl(210 40% 98%);

  --destructive: hsl(0 63% 31%);
  --destructive-foreground: hsl(210 40% 98%);

  --border: hsl(217 33% 17%);
  --input: hsl(217 33% 17%);
  --ring: hsl(224 76% 48%);
}

/* ─── Tailwind v4 Theme Mapping ─────────────────────────────────
   Maps CSS variables to Tailwind utility classes.
   e.g. bg-background, text-primary, border-border
──────────────────────────────────────────────────────────────── */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* ─── Base Styles ───────────────────────────────────────────── */
@layer base {
  * {
    @apply border-border;
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
}
```

> To customize your brand colors, change the `--primary` HSL values in `:root` and `.dark`. Use [tints.dev](https://www.tints.dev) or [oklch.com](https://oklch.com) to generate a matching palette.

---

## Step 5: Add a Test Component

Install a button to confirm everything is wired up:

```bash
bunx shadcn@latest add button
```

Then use it in a page:

```tsx
import { Button } from "@/components/ui/button";

export default function Page() {
  return <Button>Click me</Button>;
}
```

**Verify:** Start the dev server with `bun run dev` and visit the page. The button should render with your theme colors. If it renders unstyled, the `@theme inline` mapping in `globals.css` is likely missing or incomplete.

---

## Step 6: Install Core Components

Run the bundled script to install the baseline components used in every project:

```bash
node scripts/add-components.js
```

This installs: `button`, `badge`, `card`, `input`, `dialog`, `dropdown-menu`.

To add more components individually:

```bash
bunx shadcn@latest add <component-name>
```

All components land in `src/components/ui/`. To add to the baseline set, edit `scripts/add-components.sh`.

---

## Adding Custom Brand Colors

To add a color that's not part of the shadcn defaults (e.g. a `brand` color):

```css
/* In globals.css, add to :root and .dark */
:root {
  --brand: hsl(262 83% 58%);
  --brand-foreground: hsl(0 0% 100%);
}

.dark {
  --brand: hsl(262 83% 68%);
  --brand-foreground: hsl(0 0% 100%);
}

/* Add to @theme inline block */
@theme inline {
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
}
```

You can then use `bg-brand`, `text-brand`, `border-brand` as Tailwind utilities.

---

## Final Verification Checklist

- [ ] `src/lib/utils.ts` exists with the `cn()` helper
- [ ] `components.json` has `"config": ""` (Tailwind v4 — no config file)
- [ ] `globals.css` has `:root`, `.dark`, `@theme inline`, and `@layer base`
- [ ] `bun run dev` starts without CSS errors
- [ ] A shadcn `Button` renders with theme colors applied
- [ ] Changing `--primary` HSL in `:root` updates the button color in the browser

---

## Common Errors

**Components render unstyled / Tailwind classes not working**
The `@theme inline` block is missing or incomplete in `globals.css`. Every CSS variable used in components must be mapped there.

**`tailwindcss-animate` not found**
You're using the v3 package. Replace with `tw-animate-css`: `bun add tw-animate-css` and update the import in `globals.css`.

**`Cannot find module '@/components/ui/button'`**
The `@/` alias isn't configured. Check `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`.

**Dark mode colors not updating when switching themes**
You're using `@theme` instead of `@theme inline`. The `inline` keyword is required so utilities reference the CSS variable at runtime instead of baking in the value at build time.

**`bunx shadcn@latest add` overwrites customized components**
shadcn components are meant to be owned by you — they live in your repo and can be edited. Re-adding a component will overwrite your changes. Commit before running `add` on an existing component.

**`tailwind.config` should be empty in components.json**
If you see errors about a missing `tailwind.config.js`, make sure `"config": ""` in `components.json` — Tailwind v4 doesn't use a JS config file.