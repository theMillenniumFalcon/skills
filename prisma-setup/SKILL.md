---
name: prisma-setup
description: Use this skill when the user wants to set up Prisma ORM in a project. Triggers when the user asks to add Prisma, configure a database connection, set up a schema, generate a Prisma client, or integrate Zod schema generation. Also use this when the user says things like "add Prisma to my project", "set up my database with Prisma", "configure Prisma ORM", or "how do I use Prisma" — even if they don't mention PostgreSQL or Zod specifically.
---

# Prisma Setup (PostgreSQL + Zod)

A skill for setting up Prisma ORM with PostgreSQL and Zod schema generation via `zod-prisma-types`.

---

## Step 1: Install Dependencies

```bash
bun add prisma @prisma/client zod-prisma-types
bun add -d prisma
```

---

## Step 2: Initialize Prisma

```bash
bunx prisma init
```

This creates:
- `prisma/schema.prisma` — your schema file
- `.env` — with a `DATABASE_URL` placeholder

---

## Step 3: Configure Environment Variables

Update `.env` at the root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME"
```

Also add `.env` to `.gitignore` if not already there, and create a `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME"
```

---

## Step 4: Configure prisma/schema.prisma

Update the generator block to include `zod-prisma-types`:

```prisma
generator client {
  provider = "prisma-client-js"
}

generator zod {
  provider = "zod-prisma-types"
  output   = "../src/lib/zod"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

> The `output` path puts generated Zod schemas in `src/lib/zod/`. Adjust if your project structure differs.

---

## Step 5: Create Prisma Client Singleton

Create `src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

Import it everywhere as:

```ts
import { prisma } from "@/lib/prisma";
```

---

## Step 6: Add Scripts to package.json

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:migrate:prod": "prisma migrate deploy",
"db:push": "prisma db push",
"db:studio": "prisma studio",
"db:reset": "prisma migrate reset"
```

---

## Step 7: Run Initial Generate

After writing your first model in `schema.prisma`, run:

```bash
bun run db:generate
```

This generates both the Prisma client and the Zod schemas in `src/lib/zod/`.

---

## Step 8: First Migration

When you're ready to apply your schema to the database:

```bash
bun run db:migrate
```

Prisma will prompt you to name the migration (e.g. `init`).

---

## Usage Notes

- Use `bun run db:push` for rapid prototyping — it syncs the schema without creating migration files
- Use `bun run db:migrate` for any real/production-bound work — it creates versioned migration files
- Generated Zod schemas in `src/lib/zod/` are auto-updated every time you run `db:generate` — don't edit them manually
- Always run `db:generate` after any change to `schema.prisma`