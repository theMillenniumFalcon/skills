---
name: prisma-setup
description: Use this skill when the user wants to set up Prisma ORM in a project. Triggers when the user asks to add Prisma, configure a database connection, set up a schema, generate a Prisma client, or integrate Zod schema generation. Also use this when the user says things like "add Prisma to my project", "set up my database with Prisma", "configure Prisma ORM", or "how do I use Prisma" — even if they don't mention a specific database or Zod.
---

# Prisma Setup (PostgreSQL / MySQL / SQLite + Zod)

A skill for setting up Prisma ORM with Zod schema generation via `zod-prisma-types`. Supports PostgreSQL, MySQL, and SQLite.

---

## Step 1: Install Dependencies

```bash
bun add @prisma/client zod-prisma-types
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

Update `.env` based on your database:

**PostgreSQL**
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME"
```

**MySQL**
```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DBNAME"
```

**SQLite**
```env
DATABASE_URL="file:./dev.db"
```

Also add `.env` to `.gitignore` if not already there, and create a `.env.example` with the same format but empty credentials.

---

## Step 4: Configure prisma/schema.prisma

Update the generator and datasource blocks:

**PostgreSQL**
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

**MySQL**
```prisma
generator client {
  provider = "prisma-client-js"
}

generator zod {
  provider = "zod-prisma-types"
  output   = "../src/lib/zod"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

**SQLite**
```prisma
generator client {
  provider = "prisma-client-js"
}

generator zod {
  provider = "zod-prisma-types"
  output   = "../src/lib/zod"
}

datasource db {
  provider = "sqlite"
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

> Note: `prisma migrate` is not supported for SQLite in production — use `db:push` instead.

---

## Step 7: Run Initial Generate

After writing your first model in `schema.prisma`, run:

```bash
bun run db:generate
```

This generates both the Prisma client and the Zod schemas in `src/lib/zod/`.

---

## Step 8: First Migration

```bash
bun run db:migrate
```

Prisma will prompt you to name the migration (e.g. `init`).

---

## Usage Notes

- Use `bun run db:push` for rapid prototyping — syncs the schema without creating migration files
- Use `bun run db:migrate` for production-bound work — creates versioned migration files
- Generated Zod schemas in `src/lib/zod/` are auto-updated every time you run `db:generate` — don't edit them manually
- Always run `db:generate` after any change to `schema.prisma`
- SQLite is great for local dev and simple apps but not recommended for production at scale