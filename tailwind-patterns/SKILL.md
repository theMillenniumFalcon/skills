---
name: tailwind-patterns
description: Use this skill when the user wants to write better Tailwind CSS. Triggers when the user asks about Tailwind patterns, component variants, responsive design, dark mode, conditional classes, or how to organize Tailwind in a React/Next.js project. Also use this when the user says things like "how do I do variants in Tailwind", "clean up my Tailwind classes", "set up dark mode", "responsive Tailwind", "use cva", or "how do I use cn()" — even if they don't mention cva or class-variance-authority specifically.
---

# Tailwind CSS Patterns (Next.js + TypeScript)

A cheatsheet of patterns for writing clean, maintainable, production-grade Tailwind CSS in a Next.js + TypeScript project.

---

## 1. cn() — Conditional Class Merging

Always use `cn()` to combine classes — never string concatenation. It handles conflicts, conditionals, and third-party class merging correctly.

### Setup

```bash
bun add clsx tailwind-merge
```

`src/lib/utils.ts` (already created by shadcn if you used `shadcn-setup`):

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Usage

```tsx
import { cn } from "@/lib/utils";

// ✗ String concatenation — breaks on conflicts
const className = `px-4 py-2 ${isActive ? "bg-blue-500" : "bg-gray-200"}`;

// ✓ cn() — merges correctly, resolves conflicts
const className = cn(
  "px-4 py-2 rounded",
  isActive ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800",
  isDisabled && "opacity-50 cursor-not-allowed",
  className  // safely merge external className prop
);
```

### Why tailwind-merge matters

```tsx
// Without twMerge — both classes apply, last one wins unpredictably
cn("px-4", "px-8") // → "px-4 px-8" ✗

// With twMerge — conflict resolved, last one wins intentionally
cn("px-4", "px-8") // → "px-8" ✓
cn("p-4", "px-8")  // → "p-4 px-8" ✓ (px-8 overrides only x-axis)
```

---

## 2. cva — Component Variants

Use `cva` (class-variance-authority) for components with multiple variants. Replaces messy conditional class strings with a typed, scalable API.

### Setup

```bash
bun add class-variance-authority
```

### Basic Pattern

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base classes — always applied
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

// Infer props from the cva definition — fully typed
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
```

Usage:

```tsx
<Button>Default</Button>
<Button variant="destructive" size="lg">Delete</Button>
<Button variant="outline" size="icon"><TrashIcon /></Button>
```

### Compound Variants

Apply classes only when a specific combination of variants is active:

```tsx
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: { default: "", outline: "border" },
    pulse: { true: "", false: "" },
  },
  compoundVariants: [
    // Only apply animation when variant=default AND pulse=true
    {
      variant: "default",
      pulse: true,
      class: "animate-pulse bg-primary text-primary-foreground",
    },
    {
      variant: "outline",
      pulse: true,
      class: "animate-pulse border-primary text-primary",
    },
  ],
  defaultVariants: {
    variant: "default",
    pulse: false,
  },
});
```

---

## 3. Responsive Design

### Mobile-First — Always

Tailwind is mobile-first. Unprefixed classes apply to all sizes, prefixed classes apply at that breakpoint and up.

```tsx
// ✗ Desktop-first thinking
<div className="lg:flex hidden" />

// ✓ Mobile-first
<div className="hidden lg:flex" />

// Layout that stacks on mobile, side-by-side on desktop
<div className="flex flex-col gap-4 md:flex-row md:gap-8">
  <aside className="w-full md:w-64 shrink-0">...</aside>
  <main className="flex-1">...</main>
</div>
```

### Breakpoints

| Prefix | Min-width |
|--------|-----------|
| `sm`   | 640px     |
| `md`   | 768px     |
| `lg`   | 1024px    |
| `xl`   | 1280px    |
| `2xl`  | 1536px    |

### Responsive Typography

```tsx
<h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl xl:text-5xl">
  Heading
</h1>

<p className="text-sm leading-relaxed sm:text-base lg:text-lg">
  Body text
</p>
```

### Responsive Grid

```tsx
// 1 col mobile → 2 cols tablet → 3 cols desktop → 4 cols wide
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} />)}
</div>
```

### Container with Max Width

```tsx
<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

---

## 4. Dark Mode

### Setup in globals.css (Tailwind v4)

```css
@import "tailwindcss";

/* CSS variables already handle dark mode via .dark class */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222 47% 11%);
}

.dark {
  --background: hsl(222 47% 11%);
  --foreground: hsl(210 40% 98%);
}
```

### Dark Mode Classes

```tsx
// ✗ Duplicating classes for dark mode
<div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white" />

// ✓ Use semantic CSS variable tokens — dark mode handled automatically
<div className="bg-background text-foreground" />

// When you need explicit dark overrides
<div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700" />
```

### Toggle Dark Mode (Next.js)

Use `next-themes` — handles SSR flicker, system preference, and persistence:

```bash
bun add next-themes
```

```tsx
// app/layout.tsx
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

```tsx
// components/theme-toggle.tsx
"use client";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Toggle
    </button>
  );
}
```

> `suppressHydrationWarning` on `<html>` is required — `next-themes` changes the `class` attribute on the client after hydration, which would otherwise trigger a React warning.

---

## 5. Class Organization

### Consistent Ordering

Group classes in a consistent order — easier to scan and diff:

```tsx
// Order: layout → sizing → spacing → typography → colors → borders → effects → states
<div className="
  flex items-center justify-between
  w-full h-16
  px-4 py-2
  text-sm font-medium
  bg-background text-foreground
  border-b border-border
  shadow-sm
  hover:bg-accent transition-colors
" />
```

> Install the [Prettier Tailwind plugin](https://github.com/tailwindlabs/prettier-plugin-tailwindcss) to auto-sort classes on save — already included if you used `turborepo-project-setup`.

### Extract Long Class Strings with cva or Variables

```tsx
// ✗ Unreadable inline classes
<div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">

// ✓ Named variable for reuse
const cardClass = cn(
  "flex flex-col gap-2 rounded-lg",
  "border border-border bg-card",
  "p-6 shadow-sm",
  "transition-shadow hover:shadow-md"
);

<div className={cardClass}>
```

---

## 6. Common Patterns

### Centering

```tsx
// Center in viewport (full page)
<div className="flex min-h-screen items-center justify-center">

// Center in container
<div className="flex items-center justify-center">

// Absolute center
<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">

// Margin auto (horizontal only)
<div className="mx-auto max-w-lg">
```

---

### Truncate Text

```tsx
// Single line truncate
<p className="truncate">Very long text...</p>

// Multi-line clamp (2 lines)
<p className="line-clamp-2">Very long text that spans multiple lines...</p>

// Multi-line clamp (3 lines)
<p className="line-clamp-3">...</p>
```

---

### Overlay / Backdrop

```tsx
// Modal overlay
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

// Gradient overlay on image
<div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
```

---

### Skeleton Loading

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-muted", className)} />
  );
}

// Usage
<Skeleton className="h-4 w-3/4" />
<Skeleton className="h-4 w-1/2" />
<Skeleton className="h-32 w-full" />
```

---

### Divider

```tsx
// Horizontal
<hr className="border-border" />

// With label
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t border-border" />
  </div>
  <div className="relative flex justify-center text-xs">
    <span className="bg-background px-2 text-muted-foreground">OR</span>
  </div>
</div>
```

---

### Focus Ring (Accessible)

```tsx
// Consistent focus ring across all interactive elements
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
```

> Use `focus-visible` not `focus` — `focus-visible` only shows the ring for keyboard navigation, not mouse clicks.

---

### Scrollable Area

```tsx
// Horizontal scroll
<div className="overflow-x-auto">
  <table className="min-w-full">...</table>
</div>

// Vertical scroll with max height
<div className="max-h-96 overflow-y-auto">
  {items.map(...)}
</div>

// Hide scrollbar but keep scroll
<div className="overflow-y-auto scrollbar-hide">
```

---

## Quick Reference — Do's and Don'ts

| ✓ Do | ✗ Don't |
|------|---------|
| Use `cn()` for all class merging | String concatenation for conditional classes |
| Use `cva` for multi-variant components | Long ternary chains in className |
| Mobile-first with unprefixed base classes | Desktop-first with `lg:` as base |
| Semantic tokens (`bg-background`) for theme colors | Raw colors (`bg-white`) for themed elements |
| `focus-visible:ring` for focus styles | `focus:ring` (shows on mouse click too) |
| `next-themes` for dark mode toggle | Manual `localStorage` theme logic |
| Prettier Tailwind plugin for auto-sort | Manual class ordering |
| `line-clamp-{n}` for text truncation | Custom CSS for multi-line truncation |
| Extract long strings to `cva` or variables | 20+ class strings inline |