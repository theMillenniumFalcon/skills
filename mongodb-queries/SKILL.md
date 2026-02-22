---
name: mongodb-queries
description: Use this skill when the user wants to write efficient MongoDB queries using Mongoose and TypeScript. Triggers when the user asks to write a MongoDB query, optimize a slow query, build an aggregation pipeline, design a schema, handle transactions, or improve database performance. Also use this when the user says things like "how do I query MongoDB", "write an aggregate query", "optimize my mongoose query", "should I embed or reference", or "my query is slow" — even if they don't mention aggregation or optimization specifically.
---

# MongoDB Efficient Queries (Mongoose + TypeScript)

A cheatsheet of patterns for writing efficient, production-grade MongoDB queries with Mongoose and TypeScript. Copy and adapt as needed.

---

## 1. Query Optimization

### Always Use .lean() for Read-Only Queries

`.lean()` returns plain JS objects instead of full Mongoose documents — skips hydration, getters, virtuals, and prototype methods. Significantly faster for read-heavy operations.

```ts
// ✗ Slower — full Mongoose document
const users = await User.find({ active: true });

// ✓ Faster — plain JS object, no overhead
const users = await User.find({ active: true }).lean<IUser[]>();
```

> Skip `.lean()` when you need to call `.save()`, use virtuals, or trigger middleware on the result.

---

### Always Use Projections — Never Fetch What You Don't Need

```ts
// ✗ Fetches entire document
const user = await User.findById(id).lean();

// ✓ Fetch only what you need
const user = await User.findById(id)
  .select("name email avatar")
  .lean<Pick<IUser, "name" | "email" | "avatar">>();
```

---

### Use .select("+field") for Sensitive Fields

Mark sensitive fields as `select: false` in the schema, then opt in explicitly when needed:

```ts
// Schema
const userSchema = new Schema({
  email: { type: String, select: false },
  password: { type: String, select: false },
});

// Query — opt in explicitly
const user = await User.findById(id).select("+email +password").lean();
```

---

### Use explain() to Diagnose Slow Queries

```ts
const result = await User.find({ email: "test@example.com" })
  .explain("executionStats");

console.log(result.executionStats.totalDocsExamined); // should be low
console.log(result.executionStats.executionTimeMillis);
```

> If `totalDocsExamined` >> `nReturned`, you're missing an index.

---

### Efficient Pagination — Use _id Cursor, Not .skip()

`.skip()` scans all skipped documents — it gets slower as the offset grows.

```ts
// ✗ Slow at scale
const page2 = await Post.find().skip(100).limit(20).lean();

// ✓ Cursor-based — always fast
const posts = await Post.find({ _id: { $gt: lastSeenId } })
  .limit(20)
  .sort({ _id: 1 })
  .lean<IPost[]>();
```

---

### populate() vs $lookup — Know When to Switch

`populate()` is convenient but fires a separate query per call — it's N+1 queries under the hood. Use `$lookup` in aggregations for real joins.

```ts
// ✗ populate() — 2 round trips (1 for posts, 1 for users)
const posts = await Post.find().populate("authorId", "name email").lean();

// ✓ $lookup — single round trip, more efficient at scale
const posts = await Post.aggregate([
  {
    $lookup: {
      from: "users",
      localField: "authorId",
      foreignField: "_id",
      as: "author",
      pipeline: [{ $project: { name: 1, email: 1 } }],
    },
  },
  { $unwind: "$author" },
]);
```

> Use `populate()` for simple, low-traffic cases. Switch to `$lookup` when you're joining large collections or need pipeline-level control.

---

## 2. Indexes

### Define Indexes in Schema

```ts
const userSchema = new Schema({
  email: { type: String, unique: true, index: true },
  username: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Compound index — matches queries that filter by both fields
userSchema.index({ username: 1, createdAt: -1 });

// TTL index — auto-deletes documents after 1 hour
const sessionSchema = new Schema({
  createdAt: { type: Date, expires: "1h", default: Date.now },
});
```

> Only index fields that appear in `.find()`, `.sort()`, or aggregation `$match` stages. Over-indexing slows down writes.

---

### Covered Queries — Zero Document Reads

A covered query is served entirely from the index — MongoDB never reads the actual documents.

```ts
// Index on { email: 1, name: 1 }
userSchema.index({ email: 1, name: 1 });

// Query — only requests indexed fields → covered query
const user = await User.findOne({ email: "test@example.com" })
  .select("name -_id")
  .lean();
```

---

### Always Index Soft Delete Fields in Compound Indexes

Without this, every query filtering `deletedAt: null` does a full collection scan.

```ts
// ✗ Missing — full scan on every query
postSchema.index({ createdAt: -1 });

// ✓ Include deletedAt in compound index
postSchema.index({ deletedAt: 1, createdAt: -1 });
postSchema.index({ deletedAt: 1, authorId: 1 });
```

---

## 3. Aggregation Pipelines

### Basic Pipeline Structure

```ts
const results = await Order.aggregate([
  { $match: { status: "completed" } },       // 1. Filter first — reduces docs early
  { $sort: { createdAt: -1 } },              // 2. Sort on indexed field
  { $limit: 100 },                           // 3. Limit early
  { $lookup: { ... } },                      // 4. Join after limiting
  { $project: { total: 1, userId: 1 } },    // 5. Project last
]);
```

> **Rule:** Always `$match` and `$limit` as early as possible. Every subsequent stage processes fewer documents.

---

### Type-Safe Aggregations

Always type the output of `.aggregate<T>()` — otherwise the result is `any[]`.

```ts
interface OrderWithUser {
  _id: Types.ObjectId;
  total: number;
  status: string;
  user: {
    name: string;
    email: string;
  };
}

const orders = await Order.aggregate<OrderWithUser>([
  { $match: { status: "completed" } },
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
      pipeline: [{ $project: { name: 1, email: 1 } }],
    },
  },
  { $unwind: "$user" },
  { $project: { total: 1, status: 1, user: 1 } },
]);

// orders is now OrderWithUser[] — fully typed
```

---

### $lookup — Join Collections

```ts
const orders = await Order.aggregate([
  { $match: { status: "completed" } },
  {
    $lookup: {
      from: "users",           // collection name (not model name)
      localField: "userId",
      foreignField: "_id",
      as: "user",
      pipeline: [              // sub-pipeline — project only what you need
        { $project: { name: 1, email: 1 } },
      ],
    },
  },
  { $unwind: "$user" },        // flatten array to single object
]);
```

---

### $group — Aggregate and Count

```ts
interface UserOrderStats {
  _id: Types.ObjectId;
  totalOrders: number;
  totalRevenue: number;
  avgAmount: number;
}

const orderCounts = await Order.aggregate<UserOrderStats>([
  { $match: { status: "completed" } },
  {
    $group: {
      _id: "$userId",
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: "$amount" },
      avgAmount: { $avg: "$amount" },
    },
  },
  { $sort: { totalRevenue: -1 } },
  { $limit: 10 },
]);
```

---

### $facet — Paginated Results + Total Count in One Query

> Note: `$facet` uses `$skip` internally which has the same scaling limitations as `.skip()`. Use only for moderate dataset sizes or when offset-based pagination is an explicit requirement (e.g. page numbers in a UI).

```ts
interface PaginatedResult<T> {
  data: T[];
  totalCount: { count: number }[];
}

const result = await Product.aggregate<PaginatedResult<IProduct>>([
  { $match: { category: "electronics" } },
  {
    $facet: {
      data: [
        { $sort: { price: 1 } },
        { $skip: page * limit },
        { $limit: limit },
      ],
      totalCount: [
        { $count: "count" },
      ],
    },
  },
]);

const products = result[0].data;
const total = result[0].totalCount[0]?.count ?? 0;
```

---

### $addFields and $set — Computed Fields

```ts
const users = await User.aggregate([
  {
    $addFields: {
      fullName: { $concat: ["$firstName", " ", "$lastName"] },
      isVerified: { $gt: ["$verifiedAt", null] },
    },
  },
]);
```

---

## 4. Atomic Updates

### Prefer findOneAndUpdate Over Find + Save

```ts
// ✗ Two round trips + race condition risk
const post = await Post.findById(id);
post.views += 1;
await post.save();

// ✓ Atomic — single round trip
const post = await Post.findByIdAndUpdate(
  id,
  { $inc: { views: 1 } },
  { new: true, lean: true }
);
```

---

### Always Use runValidators: true on Updates

Without it, Mongoose skips schema validation entirely on `findByIdAndUpdate` and `updateOne`.

```ts
// ✗ Skips validation — can write invalid data
await User.findByIdAndUpdate(id, { email: "not-an-email" });

// ✓ Runs schema validators on update
await User.findByIdAndUpdate(
  id,
  { email: "valid@email.com" },
  { new: true, runValidators: true, lean: true }
);
```

---

### Common Atomic Operators

```ts
// Add to set (no duplicates)
{ $addToSet: { tags: "typescript" } }

// Push to array
{ $push: { comments: { text: "great post", userId } } }

// Remove from array
{ $pull: { tags: "deprecated" } }

// Increment / decrement
{ $inc: { views: 1, score: -5 } }

// Set only if field doesn't exist (useful for upserts)
{ $setOnInsert: { createdAt: new Date() } }
```

---

### bulkWrite — Batch Operations

Never do 100 individual updates in a loop. Use `bulkWrite` — single round trip, orders of magnitude faster.

```ts
// ✗ 100 round trips
for (const item of items) {
  await Product.findByIdAndUpdate(item.id, { $inc: { stock: -item.qty } });
}

// ✓ Single round trip
await Product.bulkWrite(
  items.map((item) => ({
    updateOne: {
      filter: { _id: item.id },
      update: { $inc: { stock: -item.qty } },
    },
  }))
);
```

Other `bulkWrite` operation types:

```ts
// Insert
{ insertOne: { document: { name: "New Product" } } }

// Replace entire document
{ replaceOne: { filter: { _id: id }, replacement: newDoc } }

// Delete
{ deleteOne: { filter: { _id: id } } }

// Upsert
{ updateOne: { filter: { sku: "ABC" }, update: { $set: { price: 9.99 } }, upsert: true } }
```

---

## 5. Schema Design Patterns

### Embed vs Reference

```ts
// ✓ EMBED — data is small, always read together, rarely updated alone
const userSchema = new Schema({
  name: String,
  address: {           // embedded — always needed with user
    street: String,
    city: String,
    zip: String,
  },
});

// ✓ REFERENCE — data is large, updated independently, or shared
const postSchema = new Schema({
  title: String,
  authorId: { type: Schema.Types.ObjectId, ref: "User" },
});
```

> Embed when: data is always read together, array size is bounded (<100 items). Reference when: data is updated independently, unbounded arrays, or shared across documents.

---

### Hybrid Pattern — Embed Hot Fields, Reference the Rest

Avoids expensive `$lookup` for frequently read fields while keeping the full document normalized.

```ts
const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  // Embed frequently read fields — avoids $lookup on every read
  userName: String,
  userEmail: String,
  shipping: {
    address: String,
    status: { type: String, default: "processing" },
  },
});
```

---

### Bucket Pattern — For Time-Series or Activity Data

Instead of one document per event (millions of tiny docs), group events into buckets. Dramatically reduces document count and index size.

```ts
// ✗ One document per metric reading — scales poorly
{ sensorId: "s1", value: 22.4, timestamp: ISODate("...") }
{ sensorId: "s1", value: 22.6, timestamp: ISODate("...") }
// ... millions of docs

// ✓ Bucket pattern — group readings per hour
const bucketSchema = new Schema({
  sensorId: String,
  date: Date,                  // truncated to hour
  readings: [
    {
      value: Number,
      timestamp: Date,
    },
  ],
  count: { type: Number, default: 0 },
  avg: Number,
  min: Number,
  max: Number,
});

bucketSchema.index({ sensorId: 1, date: -1 });

// Insert into bucket — add to existing bucket or create new one
await Bucket.findOneAndUpdate(
  { sensorId, date: hourStart, count: { $lt: 200 } }, // max 200 per bucket
  {
    $push: { readings: { value, timestamp } },
    $inc: { count: 1 },
    $min: { min: value },
    $max: { max: value },
  },
  { upsert: true }
);
```

---

### Soft Deletes

```ts
const postSchema = new Schema({
  title: String,
  deletedAt: { type: Date, default: null },
});

// Compound index — required so queries don't full-scan
postSchema.index({ deletedAt: 1, createdAt: -1 });

// Always filter soft-deleted docs
const posts = await Post.find({ deletedAt: null }).lean();

// Soft delete
await Post.findByIdAndUpdate(id, { deletedAt: new Date() });
```

---

## 6. Transactions

Use transactions when multiple writes must succeed or fail together:

```ts
const session = await mongoose.startSession();

try {
  await session.withTransaction(async () => {
    await Order.create([{ userId, items, total }], { session });

    await User.findByIdAndUpdate(
      userId,
      { $inc: { orderCount: 1 } },
      { session, runValidators: true }
    );

    await Inventory.findByIdAndUpdate(
      itemId,
      { $inc: { stock: -quantity } },
      { session, new: true }
    );
  });
} finally {
  session.endSession();
}
```

> Transactions require a MongoDB replica set or Atlas cluster — they don't work on standalone instances. Use them sparingly; they have a performance cost and hold locks for the duration.

---

## Quick Reference — Do's and Don'ts

| ✓ Do | ✗ Don't |
|------|---------|
| `.lean()` for read-only queries | Fetch full documents for read-only use |
| Project only needed fields | Return entire documents |
| Type aggregations with `aggregate<T>()` | Leave aggregation results as `any[]` |
| `$match` + `$limit` early in pipelines | `$lookup` before `$match` |
| `$lookup` for join-heavy reads | `populate()` on large collections |
| Cursor pagination with `_id` | `.skip()` at scale |
| `findOneAndUpdate` with `runValidators: true` | Find + modify + save |
| `bulkWrite` for batch updates | Looping individual updates |
| Index soft-delete fields in compound indexes | Unindexed `deletedAt: null` filters |
| `session.withTransaction()` | Manual commit/abort |
| Bucket pattern for time-series data | One document per event |