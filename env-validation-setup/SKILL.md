---
name: env-validation-setup
description: Use this skill when the user wants to validate environment variables in a Next.js or Turborepo project. Triggers when the user asks to add env validation, set up type-safe env vars, configure @t3-oss/env-nextjs, prevent missing env var errors at build time, or make environment variables type-safe. Also use this when the user says things like "validate my env vars", "type-safe env", "add env validation", or "skip build if env is missing" — even if they don't mention t3-env or Zod specifically.
---

# Env Validation Setup (@t3-oss/env-nextjs + Zod)

A skill for setting up type-safe, build-time validated environment variables using `@t3-oss/env-nextjs` and Zod. Supports both standalone Next.js projects and Turborepo monorepos.

---

## Before You Start

- **Is `zod` already installed?** `@t3-oss/env-nextjs` requires it. If not, it'll be installed in Step 1.
- **Turborepo monorepo?** See the Turborepo-specific notes in each step. The `env.ts` file lives inside the app (e.g. `apps/web/src/env.ts`), not at the monorepo root.
- **Next.js version?** This skill targets Next.js 13.4.4+. If older, the `runtimeEnv` setup differs — flag it to the user.
- **`@t3-oss/env-nextjs` is ESM only.** Make sure `tsconfig.json` uses `"moduleResolution": "Bundler"` or `"moduleResolution": "NodeNext"`. If it's set to `"Node"`, imports will fail.

---

## Step 1: Install Dependencies

**Standalone Next.js:**
```bash
bun add @t3-oss/env-nextjs zod
```

**Turborepo — run from inside the app:**
```bash
cd apps/web
bun add @t3-oss/env-nextjs zod
```

**Verify:** Check `package.json` — both `@t3-oss/env-nextjs` and `zod` should appear in `dependencies`.

---

## Step 2: Create src/env.ts

Create `src/env.ts` (adjust path for monorepo — e.g. `apps/web/src/env.ts`):

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side env vars — never exposed to the client.
   * Accessing these on the client will throw a runtime error.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().url(),
    // Add your server vars here:
    // SOME_SECRET_KEY: z.string().min(1),
  },

  /**
   * Client-side env vars — must be prefixed with NEXT_PUBLIC_.
   * You'll get a type error if you forget the prefix.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    // Add your client vars here:
    // NEXT_PUBLIC_SOME_KEY: z.string().min(1),
  },

  /**
   * Destructure all vars from process.env here.
   * Required for Next.js to include them in the bundle.
   * You'll get a type error if any server/client var is missing here.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation in CI or when running scripts that
   * don't need env vars (e.g. linting, type checking).
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   * Prevents accidentally passing "" when a var is unset.
   */
  emptyStringAsUndefined: true,
});
```

> Every time you add a new env var, you must add it in **three places**: the `server` or `client` block, the `runtimeEnv` block, and your `.env` file. Missing any one of them will cause a type or runtime error.

---

## Step 3: Wire Into next.config.ts for Build-Time Validation

Import `env.ts` at the top of `next.config.ts` so validation runs at build time and fails the build if any required var is missing:

```ts
import "./src/env";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // your config here
};

export default nextConfig;
```

> This is what enables build-time validation — without this import, validation only runs at runtime (when the app boots), not during `bun run build`.

**Turborepo note:** If you use `transpilePackages` in `next.config.ts`, add the env package:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@t3-oss/env-nextjs", "@t3-oss/env-core"],
};
```

---

## Step 4: Update .env and .env.example

Add all validated vars to `.env`:

```env
NODE_ENV="development"
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

And to `.env.example` with empty values:

```env
NODE_ENV=
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
```

> `.env.example` is your contract — anyone cloning the repo knows exactly what vars they need to set up.

---

## Step 5: Use env Throughout the App

Import `env` from `@/env` everywhere instead of using `process.env` directly:

```ts
import { env } from "@/env";

// Server component or server action
console.log(env.DATABASE_URL);       // ✓ type-safe
console.log(env.NEXT_PUBLIC_APP_URL); // ✓ works on server too

// Client component
console.log(env.NEXT_PUBLIC_APP_URL); // ✓ works
console.log(env.DATABASE_URL);        // ✗ throws — server-only var
```

> Accessing a server var from a client component will throw a descriptive error at runtime, not a silent `undefined`. This is intentional and much safer than raw `process.env`.

---

## Adding New Env Vars — Checklist

Every time you add a new env var, touch all three places:

```ts
// 1. Add to server or client block in src/env.ts
server: {
  MY_NEW_SECRET: z.string().min(1),
}

// 2. Add to runtimeEnv block in src/env.ts
runtimeEnv: {
  MY_NEW_SECRET: process.env.MY_NEW_SECRET,
}
```

```env
# 3. Add to .env and .env.example
MY_NEW_SECRET="your-value-here"
```

TypeScript will show a type error if you forget steps 1 or 2. Step 3 is on you.

---

## Type Coercion

All env vars are strings by default. Use Zod's `coerce` for non-string types:

```ts
server: {
  PORT: z.coerce.number().default(3000),
  ENABLE_FEATURE: z.coerce.boolean().default(false),
  MAX_RETRIES: z.coerce.number().min(1).max(10),
}
```

---

## Final Verification Checklist

- [ ] `src/env.ts` exists and exports `env`
- [ ] `next.config.ts` imports `"./src/env"` at the top
- [ ] All vars in `server`/`client` blocks are also in `runtimeEnv`
- [ ] All vars are present in `.env` and `.env.example`
- [ ] `bun run build` fails with a clear error if a required var is missing from `.env`
- [ ] Accessing `env.DATABASE_URL` in a client component throws an error
- [ ] `tsconfig.json` uses `"moduleResolution": "Bundler"` or `"NodeNext"`

---

## Common Errors

**`Cannot find module '@t3-oss/env-nextjs'`**
The package isn't installed, or in a Turborepo you ran install at the root instead of inside the app. Run `bun add @t3-oss/env-nextjs zod` from inside `apps/web`.

**`Invalid environment variables: DATABASE_URL`**
The var is missing or malformed in `.env`. Check the value matches the Zod schema (e.g. `z.string().url()` requires a valid URL format like `postgresql://...`).

**`moduleResolution` error on import**
`tsconfig.json` is using `"moduleResolution": "Node"`. Change it to `"Bundler"` — `@t3-oss/env-nextjs` is ESM only and requires a modern module resolution strategy.

**`SKIP_ENV_VALIDATION` is not skipping validation**
Make sure the var is set before the Next.js process starts: `SKIP_ENV_VALIDATION=1 bun run build`. Setting it in `.env` won't work because `.env` is loaded after validation runs.

**Build passes but missing var isn't caught**
`next.config.ts` is not importing `"./src/env"`. Add it as the first line — without it, validation only runs at runtime.

**`process.env.X` returns `undefined` even though it's in `.env`**
You're accessing `process.env` directly instead of using `env.X`. Always import from `@/env` — raw `process.env` bypasses validation entirely.