---
name: postgres-queries
description: Use this skill when the user wants to write efficient PostgreSQL queries using Prisma and TypeScript. Triggers when the user asks to optimize a Prisma query, write a CTE, use window functions, handle transactions, design a schema, or improve database performance. Also use this when the user says things like "how do I write efficient Prisma queries", "optimize my postgres query", "write a CTE with Prisma", "handle transactions in Prisma", or "my query is slow" — even if they don't mention CTEs or window functions specifically.
---

# PostgreSQL Best Practices (Prisma + TypeScript)

A cheatsheet of patterns for writing efficient, production-grade PostgreSQL queries with Prisma and TypeScript. Copy and adapt as needed.

---

## 1. Query Optimization

### Select Only What You Need

Never `findMany` without `select` — fetching entire rows is wasteful, especially on wide tables.

```ts
// ✗ Fetches all columns including heavy ones
const users = await prisma.user.findMany();

// ✓ Only what you need
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
  },
});
```

---

### Use findFirst + take Instead of findMany + [0]

```ts
// ✗ Fetches all matches, discards the rest
const user = (await prisma.user.findMany({ where: { email } }))[0];

// ✓ Stops at first match — LIMIT 1 in SQL
const user = await prisma.user.findFirst({ where: { email } });
```

---

### Batch Reads with findMany + in — Avoid N+1

```ts
// ✗ N+1 — one query per post
const postsWithAuthors = await Promise.all(
  posts.map((post) => prisma.user.findUnique({ where: { id: post.authorId } }))
);

// ✓ Single query — WHERE id IN (...)
const authorIds = posts.map((p) => p.authorId);
const authors = await prisma.user.findMany({
  where: { id: { in: authorIds } },
  select: { id: true, name: true },
});
```

---

### Use Cursor Pagination — Not skip/take at Scale

`skip` translates to SQL `OFFSET` — it scans all skipped rows and gets slower as offset grows.

```ts
// ✗ Slow at scale — OFFSET 1000
const page = await prisma.post.findMany({
  skip: 1000,
  take: 20,
  orderBy: { createdAt: "desc" },
});

// ✓ Cursor-based — always fast
const page = await prisma.post.findMany({
  take: 20,
  cursor: { id: lastSeenId },
  skip: 1,              // skip the cursor itself
  orderBy: { id: "asc" },
});
```

---

### Use $queryRaw for Complex Queries Prisma Can't Express

When Prisma's query builder isn't expressive enough, drop to raw SQL with full type safety:

```ts
import { Prisma } from "@prisma/client";

const result = await prisma.$queryRaw<{ id: string; total: number }[]>`
  SELECT
    u.id,
    COUNT(o.id)::int AS total
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.created_at > ${startDate}
  GROUP BY u.id
  ORDER BY total DESC
  LIMIT ${limit}
`;
```

> Always use tagged template literals with `$queryRaw` — never string interpolation. Prisma automatically parameterizes template values, preventing SQL injection.

---

### Use $executeRaw for Raw Writes

Use `$executeRaw` for raw INSERT, UPDATE, or DELETE statements — not `$queryRaw`, which is for reads.

```ts
// ✗ Wrong — $queryRaw is for SELECT only
await prisma.$queryRaw`UPDATE users SET active = false WHERE last_login < ${cutoff}`;

// ✓ Correct — $executeRaw for writes, returns affected row count
const count = await prisma.$executeRaw`
  UPDATE users
  SET active = false
  WHERE last_login < ${cutoff}
`;
console.log(`Deactivated ${count} users`);
```

---

### Build Dynamic Raw Queries with Prisma.sql

When query conditions are dynamic (optional filters, variable IN lists), use `Prisma.sql` and `Prisma.join` to safely compose raw queries:

```ts
import { Prisma } from "@prisma/client";

// Dynamic optional filters
const conditions: Prisma.Sql[] = [Prisma.sql`deleted_at IS NULL`];

if (status) conditions.push(Prisma.sql`status = ${status}`);
if (userId) conditions.push(Prisma.sql`user_id = ${userId}`);

const where = Prisma.join(conditions, " AND ");

const orders = await prisma.$queryRaw<Order[]>`
  SELECT * FROM orders
  WHERE ${where}
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

// Dynamic IN list
const ids = ["id1", "id2", "id3"];
const users = await prisma.$queryRaw<User[]>`
  SELECT * FROM users
  WHERE id IN (${Prisma.join(ids)})
`;
```

> Never build raw queries with string concatenation or template literal interpolation outside of `Prisma.sql` — that bypasses parameterization and opens SQL injection.

---

### Diagnose Slow Queries with EXPLAIN ANALYZE

Run this directly in psql or a DB client — not via Prisma:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders
WHERE user_id = '123' AND status = 'completed'
ORDER BY created_at DESC;
```

Key things to look for:
- `Seq Scan` on large tables → missing index
- `Rows Removed by Filter` being large → index not selective enough
- `Nested Loop` with large row estimates → consider a hash join hint or schema change
- `Buffers: shared hit` vs `read` → cache hit rate

---

## 2. Indexes

### Define Indexes in Schema

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique          // unique index
  username  String
  createdAt DateTime @default(now())

  @@index([username])                 // single index
  @@index([username, createdAt(sort: Desc)])  // compound index
}
```

> Compound indexes follow the **ESR rule**: Equality fields first, Sort fields second, Range fields last.

---

### Partial Indexes — Index Only What You Query

Index a subset of rows when most queries filter on a condition. Smaller index = faster lookups and less write overhead.

Prisma does not support partial indexes natively — define them via a manual migration. Do **not** also add a `@@index` in the Prisma schema for the same index, or you'll end up with two separate indexes.

Add a new migration file manually:

```sql
CREATE INDEX idx_active_orders ON orders (user_id, created_at DESC)
WHERE status = 'active';
```

Then mark it as applied without re-running:

```bash
prisma migrate resolve --applied "migration_name"
```

Or add it directly inside a new migration file generated by `prisma migrate dev --create-only`.

---

### Indexes for Soft Deletes

Always include `deletedAt` in compound indexes — without it, every query filtering `deletedAt IS NULL` full-scans.

```prisma
model Post {
  id        String    @id @default(cuid())
  authorId  String
  deletedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([deletedAt, createdAt(sort: Desc)])
  @@index([deletedAt, authorId])
}
```

---

### Full-Text Search Index

Prisma does not support `tsvector` columns or FTS GIN indexes natively. Set them up via a manual migration:

```sql
-- Add tsvector column and GIN index
ALTER TABLE articles ADD COLUMN search_vector tsvector;
CREATE INDEX idx_articles_fts ON articles USING GIN(search_vector);

-- Update on insert/update via trigger
CREATE TRIGGER articles_search_update
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION
tsvector_update_trigger(search_vector, 'pg_catalog.english', title, content);
```

Query it with `$queryRaw`:

```ts
const articles = await prisma.$queryRaw<Article[]>`
  SELECT * FROM articles
  WHERE search_vector @@ plainto_tsquery('english', ${query})
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC
  LIMIT 20
`;
```

---

## 3. CTEs & Window Functions

### CTE — Readable Multi-Step Queries

CTEs (`WITH` clauses) break complex queries into named steps — easier to read and maintain than nested subqueries.

```ts
const result = await prisma.$queryRaw<{ userId: string; revenue: number; rank: number }[]>`
  WITH completed_orders AS (
    SELECT user_id, SUM(amount) AS revenue
    FROM orders
    WHERE status = 'completed'
      AND created_at >= ${startDate}
    GROUP BY user_id
  ),
  ranked AS (
    SELECT
      user_id,
      revenue,
      RANK() OVER (ORDER BY revenue DESC) AS rank
    FROM completed_orders
  )
  SELECT * FROM ranked
  WHERE rank <= 10
`;
```

---

### Window Functions — Running Totals, Ranks, Lag/Lead

Window functions compute across a set of rows without collapsing them into groups like `GROUP BY` does.

```ts
// Running total per user
// Note: $queryRaw returns snake_case column names as-is — match your type to the SQL alias
const result = await prisma.$queryRaw<{
  id: string;
  amount: number;
  running_total: number; // matches SQL alias exactly — no auto-camelCase
}[]>`
  SELECT
    id,
    amount,
    SUM(amount) OVER (
      PARTITION BY user_id
      ORDER BY created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total
  FROM orders
  WHERE user_id = ${userId}
  ORDER BY created_at
`;

// Rank users by revenue within each region
const ranked = await prisma.$queryRaw`
  SELECT
    id,
    name,
    region,
    revenue,
    RANK()       OVER (PARTITION BY region ORDER BY revenue DESC) AS rank,
    DENSE_RANK() OVER (PARTITION BY region ORDER BY revenue DESC) AS dense_rank,
    ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC) AS row_num
  FROM users
`;

// Month-over-month growth using LAG
const growth = await prisma.$queryRaw`
  SELECT
    month,
    revenue,
    LAG(revenue)  OVER (ORDER BY month) AS prev_revenue,
    LEAD(revenue) OVER (ORDER BY month) AS next_revenue,
    ROUND(
      (revenue - LAG(revenue) OVER (ORDER BY month))
      / NULLIF(LAG(revenue) OVER (ORDER BY month), 0) * 100,
      2
    ) AS growth_pct
  FROM monthly_revenue
  ORDER BY month
`;
```

---

### Recursive CTE — Tree / Hierarchy Queries

For categories, org charts, threaded comments — anything with parent/child relationships.

```ts
const tree = await prisma.$queryRaw<{
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  path: string;
}[]>`
  WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT id, name, parent_id, 0 AS depth, name::text AS path
    FROM categories
    WHERE parent_id IS NULL

    UNION ALL

    -- Recursive case: children
    SELECT
      c.id,
      c.name,
      c.parent_id,
      ct.depth + 1,
      ct.path || ' > ' || c.name
    FROM categories c
    INNER JOIN category_tree ct ON ct.id = c.parent_id
  )
  SELECT * FROM category_tree
  ORDER BY path
`;
```

---

## 4. Transactions & Locking

### Interactive Transactions — Multiple Operations

Use `$transaction` with a callback for operations that depend on each other's results.

```ts
const result = await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({
    data: { userId, total, status: "pending" },
  });

  // Check stock first — update() throws P2025 if no match, not null
  const product = await tx.product.findFirst({
    where: { id: productId, stock: { gte: quantity } },
  });

  if (!product) throw new Error("Insufficient stock"); // triggers rollback

  await tx.product.update({
    where: { id: productId },
    data: { stock: { decrement: quantity } },
  });

  await tx.user.update({
    where: { id: userId },
    data: { orderCount: { increment: 1 } },
  });

  return order;
});
```

> Any thrown error inside `$transaction` automatically rolls back all operations. Always use `tx` (the transaction client) — not `prisma` — inside the callback.

---

### Set Transaction Timeout

Prevent long-running transactions from holding locks:

```ts
await prisma.$transaction(
  async (tx) => {
    // your operations
  },
  {
    maxWait: 5000,   // max time to acquire a connection (ms)
    timeout: 10000,  // max time for the transaction to complete (ms)
  }
);
```

---

### SELECT FOR UPDATE — Pessimistic Locking

Lock rows for the duration of a transaction to prevent concurrent updates.

```ts
await prisma.$transaction(async (tx) => {
  // Lock the row — other transactions block until this commits
  const [seat] = await tx.$queryRaw<Seat[]>`
    SELECT * FROM seats
    WHERE id = ${seatId} AND status = 'available'
    FOR UPDATE
  `;

  if (!seat) throw new Error("Seat not available");

  await tx.seat.update({
    where: { id: seatId },
    data: { status: "booked", userId },
  });
});
```

> Use `FOR UPDATE SKIP LOCKED` to skip already-locked rows — useful for job queues where you want to process any available item, not wait for a specific one.

---

### SKIP LOCKED — Job Queue Pattern

```ts
const job = await prisma.$transaction(async (tx) => {
  const [next] = await tx.$queryRaw<Job[]>`
    SELECT * FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;

  if (!next) return null;

  return tx.job.update({
    where: { id: next.id },
    data: { status: "processing", startedAt: new Date() },
  });
});
```

---

## 5. Schema Design Patterns

### Use cuid() or uuid() — Never Auto-Increment for Public IDs

Auto-increment IDs leak row counts and are enumerable. Use `cuid()` or `uuid()` for any user-facing ID.

```prisma
model User {
  id String @id @default(cuid())  // ✓ non-guessable
  // id Int @id @default(autoincrement()) ✗ leaks count, enumerable
}
```

---

### Soft Deletes

```prisma
model Post {
  id        String    @id @default(cuid())
  title     String
  deletedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([deletedAt, createdAt(sort: Desc)])
}
```

```ts
// Always filter in queries
const posts = await prisma.post.findMany({
  where: { deletedAt: null },
});

// Soft delete
await prisma.post.update({
  where: { id },
  data: { deletedAt: new Date() },
});
```

---

### Timestamps — Always Add createdAt + updatedAt

```prisma
model Post {
  id        String   @id @default(cuid())
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt      // auto-updated by Prisma on every write
}
```

---

### Enums — Use Postgres Enums, Not Strings

String fields for status/type are unconstrained — any typo silently writes bad data.

```prisma
enum OrderStatus {
  PENDING
  PROCESSING
  COMPLETED
  CANCELLED
  REFUNDED
}

model Order {
  id     String      @id @default(cuid())
  status OrderStatus @default(PENDING)
}
```

---

### Avoid Polymorphic Relations — Use Separate Tables

Polymorphic relations (one foreign key pointing to multiple tables) can't be enforced with real foreign key constraints in PostgreSQL.

```prisma
// ✗ Polymorphic — no real FK constraint, nullable by nature
model Comment {
  id         String  @id @default(cuid())
  targetId   String  // could be postId or videoId — not enforceable
  targetType String  // "Post" | "Video"
  body       String
}

// ✓ Separate join tables per target — real FK constraints
model PostComment {
  id     String @id @default(cuid())
  postId String
  post   Post   @relation(fields: [postId], references: [id])
  body   String
}

model VideoComment {
  id      String @id @default(cuid())
  videoId String
  video   Video  @relation(fields: [videoId], references: [id])
  body    String
}
```

---

### JSON Columns — Use Sparingly

JSON is flexible but unindexable (without GIN), untyped, and can't use FK constraints.

```prisma
model Product {
  id       String @id @default(cuid())
  name     String
  metadata Json?  // ✓ ok for truly dynamic, non-queried data
}
```

```ts
// ✓ Store typed data in metadata
await prisma.product.update({
  where: { id },
  data: {
    metadata: {
      dimensions: { width: 10, height: 20 },
      tags: ["new", "sale"],
    },
  },
});

// Query JSON field
const products = await prisma.product.findMany({
  where: {
    metadata: {
      path: ["tags"],
      array_contains: "sale",
    },
  },
});
```

> If you find yourself filtering or joining on JSON fields frequently, move them to real columns.

---

## Quick Reference — Do's and Don'ts

| ✓ Do | ✗ Don't |
|------|---------|
| `select` only needed fields | Fetch entire rows |
| `findFirst` for single matches | `findMany()[0]` |
| Cursor pagination | `skip`/`take` at scale |
| `$queryRaw` tagged templates | String interpolation in raw SQL |
| `WITH` CTEs for complex queries | Deeply nested subqueries |
| Window functions for rankings/running totals | Multiple queries + JS aggregation |
| `$transaction` callback for dependent ops | Manual rollback logic |
| `FOR UPDATE SKIP LOCKED` for queues | `FOR UPDATE` without `SKIP LOCKED` in queues |
| Compound indexes with ESR rule | Single-column indexes for multi-field queries |
| Include `deletedAt` in compound indexes | Unindexed soft-delete filters |
| Postgres enums for status/type | Unconstrained string fields |
| Separate tables over polymorphic relations | Nullable FK with `targetType` string |
| `cuid()` / `uuid()` for public IDs | `autoincrement()` for user-facing IDs |
SKILLEOF