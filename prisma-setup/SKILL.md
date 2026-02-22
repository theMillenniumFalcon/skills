---
name: prisma-setup
description: Use this skill when the user wants to set up Prisma ORM in a project. Triggers when the user asks to add Prisma, configure a database connection, set up a schema, generate a Prisma client, or integrate Zod schema generation. Also use this when the user says things like "add Prisma to my project", "set up my database with Prisma", "configure Prisma ORM", or "how do I use Prisma" — even if they don't mention a specific database or Zod.
---

# Prisma Setup (PostgreSQL / MySQL / SQLite + Zod)

A skill for setting up Prisma ORM with Zod schema generation via `zod-prisma-types`. Supports PostgreSQL, MySQL, and SQLite.

---

## Before You Start

Check these before proceeding:

- **Which database?** Ask the user if not clear — PostgreSQL, MySQL, or SQLite. The connection string and schema provider differ per DB.
- **Is the database running?** For PostgreSQL/MySQL, confirm a local or remote instance is available and they have the connection credentials. If not, flag it — `db:migrate` will fail without a live database.
- **Is this a Turborepo monorepo?** If yes, run install commands from the root with `-W` flag and confirm where `src/lib/` lives — it may be inside an app (e.g. `apps/web/src/lib/`) rather than at the root.
- **Is `zod` already installed?** `zod-prisma-types` requires it as a peer dependency. If not, add it: `bun add zod`.

---

## Step 1: Install Dependencies

```bash
bun add @prisma/client zod-prisma-types
bun add -d prisma
```

> In a Turborepo monorepo, run this from inside the app that will use Prisma (e.g. `apps/web`), not the root — unless you want it shared across all apps.

**Verify:** Run `bunx prisma --version` — you should see a version number. If not, the install failed.

---

## Step 2: Initialize Prisma

```bash
bunx prisma init
```

This creates:
- `prisma/schema.prisma` — your schema file
- `.env` — with a `DATABASE_URL` placeholder

> If `.env` already exists, `prisma init` won't overwrite it — just add `DATABASE_URL` manually.

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

Also:
- Add `.env` to `.gitignore` if not already there
- Create `.env.example` with the same keys but empty values

**Verify:** Confirm you can connect to the database before moving on. For PostgreSQL: `psql $DATABASE_URL`. For MySQL: `mysql -u USER -p DBNAME`. If the connection fails, fix it now — every step after this depends on it.

---

## Step 4: Configure prisma/schema.prisma

Update the generator and datasource blocks based on your database:

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

> The `output` path `../src/lib/zod` assumes `schema.prisma` is in `prisma/` and your source is at `src/`. Adjust if your project structure differs — e.g. in a monorepo app it might be `../../apps/web/src/lib/zod`.

---

## Step 5: Create Prisma Client Singleton

Create `src/lib/prisma.ts` (adjust path for your project structure):

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

> The singleton pattern prevents creating multiple Prisma Client instances in development due to hot reloading. Without this, you'll hit `PrismaClientKnownRequestError: Too many connections` after repeated saves.

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

> `prisma migrate` is not supported for SQLite in production — use `db:push` instead. For PostgreSQL/MySQL in production, always use `db:migrate:prod`, never `db:migrate`.

---

## Step 7: Write Your First Model

Add a model to `prisma/schema.prisma` to test the setup. Use this minimal example:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Step 8: Generate Client and Zod Schemas

```bash
bun run db:generate
```

This generates:
- Prisma client in `node_modules/@prisma/client`
- Zod schemas in `src/lib/zod/`

**Verify:** Check that `src/lib/zod/index.ts` was created. If the `zod` folder is missing, the `zod-prisma-types` generator failed — check that `zod` is installed as a dependency.

---

## Step 9: Run First Migration

**PostgreSQL / MySQL:**
```bash
bun run db:migrate
```
Prisma will prompt for a migration name — use `init`.

**SQLite:**
```bash
bun run db:push
```

**Verify:** Run `bunx prisma studio` — it should open a browser tab showing your `User` table. If the table isn't there, the migration didn't apply.

---

## Final Verification Checklist

- [ ] `bunx prisma --version` — prints a version
- [ ] `bunx prisma validate` — schema is valid, no errors
- [ ] `bun run db:generate` — generates without errors, `src/lib/zod/` exists
- [ ] `bun run db:migrate` (or `db:push` for SQLite) — applies without errors
- [ ] `bunx prisma studio` — opens and shows your tables

---

## Common Errors

**`Environment variable not found: DATABASE_URL`**
The `.env` file isn't being picked up. Make sure it's at the same level as `prisma/` and that you haven't accidentally named it `.env.local`. Prisma only reads `.env` by default.

**`Can't reach database server`**
Your database isn't running or the credentials are wrong. Double-check the connection string and that the DB server is up.

**`zod-prisma-types: Cannot find module 'zod'`**
`zod` is a peer dependency of `zod-prisma-types` — install it: `bun add zod`.

**`Output folder already exists and is not empty`**
The `src/lib/zod` folder has stale generated files. Safe to delete and re-run `db:generate`.

**`PrismaClientKnownRequestError: Too many connections`**
You're not using the singleton pattern — make sure `src/lib/prisma.ts` matches Step 5 and you're importing from there everywhere.

**`Error: Migration failed to apply`**
Usually a schema conflict with an existing database. Run `bun run db:reset` (drops all data) or resolve the conflict manually in `prisma/migrations/`.