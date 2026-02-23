# Stripe Payments Setup

Covers: dependencies, env vars, Prisma schema, Stripe singleton, plan config, billing helpers, one-time checkout, subscription checkout, and webhook handler.

**After completing this file, read [testing.md](testing.md).**

---

## Step 1: Install Dependencies

```bash
bun add stripe @stripe/stripe-js
```

---

## Step 2: Environment Variables

Add to `.env`:

```env
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."          # filled in testing.md
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
STRIPE_PRO_PRICE_ID="price_..."           # from Stripe Dashboard
STRIPE_ENTERPRISE_PRICE_ID="price_..."    # from Stripe Dashboard
```

Add to `.env.example`:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=
STRIPE_PRO_PRICE_ID=
STRIPE_ENTERPRISE_PRICE_ID=
```

Add to `src/env.ts`:

```ts
server: {
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRO_PRICE_ID: z.string().min(1),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1),
},
client: {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
},
runtimeEnv: {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID,
  STRIPE_ENTERPRISE_PRICE_ID: process.env.STRIPE_ENTERPRISE_PRICE_ID,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
},
```

> Every env var must be in all three places — `server`/`client` block, `runtimeEnv` block, and `.env`. Missing any one will cause a type or runtime error.

---

## Step 3: Prisma Schema

Add billing tables to `schema.prisma`:

```prisma
enum SubscriptionStatus {
  ACTIVE
  CANCELED
  INCOMPLETE
  INCOMPLETE_EXPIRED
  PAST_DUE
  TRIALING
  UNPAID
  PAUSED
}

enum PlanTier {
  FREE
  PRO
  ENTERPRISE
}

model Customer {
  id               String        @id @default(cuid())
  userId           String        @unique
  stripeCustomerId String        @unique
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  user             User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscription     Subscription?
  payments         Payment[]
}

model Subscription {
  id                   String             @id @default(cuid())
  customerId           String             @unique
  stripeSubscriptionId String             @unique
  stripePriceId        String
  tier                 PlanTier           @default(FREE)
  status               SubscriptionStatus
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean            @default(false)
  trialEnd             DateTime?
  gracePeriodEnd       DateTime?          // set on payment failure
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  customer             Customer           @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([stripeSubscriptionId])
  @@index([status, currentPeriodEnd])
}

model Payment {
  id                String   @id @default(cuid())
  customerId        String
  stripePaymentId   String   @unique
  amount            Int      // in cents
  currency          String   @default("usd")
  status            String
  idempotencyKey    String?  @unique
  createdAt         DateTime @default(now())

  customer          Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([stripePaymentId])
}

model UsageRecord {
  id        String   @id @default(cuid())
  userId    String
  action    String
  quantity  Int      @default(1)
  metadata  Json?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, action, createdAt(sort: Desc)])
}
```

Run migration:

```bash
bun run db:migrate
```

---

## Step 4: Stripe Singleton

Create `src/lib/stripe.ts`:

```ts
import Stripe from "stripe";
import { env } from "@/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30.basil",
  typescript: true,
});
```

---

## Step 5: Plan Config

Create `src/lib/plans.ts` — single source of truth for all plan definitions:

```ts
import { env } from "@/env";

export const PLANS = {
  FREE: {
    tier: "FREE",
    name: "Free",
    stripePriceId: null,
    limits: {
      apiCallsPerMonth: 100,
      aiGenerationsPerMonth: 10,
    },
    features: {
      advancedAnalytics: false,
      prioritySupport: false,
      customDomain: false,
    },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    stripePriceId: env.STRIPE_PRO_PRICE_ID,
    limits: {
      apiCallsPerMonth: 10_000,
      aiGenerationsPerMonth: 500,
    },
    features: {
      advancedAnalytics: true,
      prioritySupport: false,
      customDomain: true,
    },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    stripePriceId: env.STRIPE_ENTERPRISE_PRICE_ID,
    limits: {
      apiCallsPerMonth: Infinity,
      aiGenerationsPerMonth: Infinity,
    },
    features: {
      advancedAnalytics: true,
      prioritySupport: true,
      customDomain: true,
    },
  },
} as const;

export type PlanTier = keyof typeof PLANS;
export type UsageLimitKey = keyof (typeof PLANS)["FREE"]["limits"];
```

---

## Step 6: Billing Helpers

Create `src/lib/billing.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { PLANS, type PlanTier, type UsageLimitKey } from "@/lib/plans";

// Get or create a Stripe customer for a user.
// Uses try/catch to handle race conditions where two simultaneous
// requests both find no customer and both attempt to create one.
export async function getOrCreateCustomer(userId: string, email: string) {
  const existing = await prisma.customer.findUnique({ where: { userId } });
  if (existing) return existing;

  const stripeCustomer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  try {
    return await prisma.customer.create({
      data: { userId, stripeCustomerId: stripeCustomer.id },
    });
  } catch (err: any) {
    // P2002 = unique constraint — another request created the row first
    if (err?.code === "P2002") {
      const existing = await prisma.customer.findUnique({ where: { userId } });
      if (existing) return existing;
    }
    throw err;
  }
}

// Get the current subscription for a user
export async function getUserSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { customer: { userId } },
    include: { customer: true },
  });
}

// Get the user's current plan tier.
// Treats PAST_DUE within the grace period as still active.
export async function getUserPlan(userId: string): Promise<PlanTier> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) return "FREE";

  const isActive =
    subscription.status === "ACTIVE" ||
    subscription.status === "TRIALING" ||
    (subscription.status === "PAST_DUE" &&
      subscription.gracePeriodEnd &&
      subscription.gracePeriodEnd > new Date());

  if (!isActive) return "FREE";
  return subscription.tier as PlanTier;
}

// Check if a user can perform a metered action based on their plan
export async function checkUsageLimit(
  userId: string,
  action: UsageLimitKey
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const plan = await getUserPlan(userId);
  const limit = PLANS[plan].limits[action];

  if (limit === Infinity) return { allowed: true, used: 0, limit: Infinity };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const used = await prisma.usageRecord.aggregate({
    where: { userId, action, createdAt: { gte: startOfMonth } },
    _sum: { quantity: true },
  });

  const usedCount = used._sum.quantity ?? 0;
  return { allowed: usedCount < limit, used: usedCount, limit };
}

// Record a usage event
export async function recordUsage(
  userId: string,
  action: UsageLimitKey,
  quantity = 1,
  metadata?: Record<string, unknown>
) {
  return prisma.usageRecord.create({
    data: { userId, action, quantity, metadata },
  });
}
```

---

## Step 7: Checkout — One-Time Payment

Create `src/app/api/stripe/checkout/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/billing";
import { env } from "@/env";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId, idempotencyKey } = await req.json();
    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotencyKey" }, { status: 400 });
    }

    const customer = await getOrCreateCustomer(session.user.id, session.user.email);

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        customer: customer.stripeCustomerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "payment",
        success_url: `${env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/billing`,
        metadata: { userId: session.user.id, idempotencyKey },
      },
      { idempotencyKey }
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
```

> The `idempotencyKey` must be generated client-side (e.g. `crypto.randomUUID()`) and sent with the request — not generated server-side with `Date.now()`. A stable client-side key ensures retries from the same user action reuse the same Stripe session instead of creating duplicates.

---

## Step 8: Checkout — Subscription

Create `src/app/api/stripe/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/billing";
import { env } from "@/env";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId } = await req.json();
    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    const customer = await getOrCreateCustomer(session.user.id, session.user.email);

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/billing`,
      subscription_data: {
        metadata: { userId: session.user.id },
        trial_period_days: 14, // remove if no trial
      },
      metadata: { userId: session.user.id },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to create subscription session" }, { status: 500 });
  }
}
```

---

## Step 9: Webhook Handler

Create `src/app/api/stripe/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import type Stripe from "stripe";
import { PLANS } from "@/lib/plans";

// Required — webhooks need raw body, not parsed JSON
export const runtime = "nodejs";

const GRACE_PERIOD_DAYS = 3;

function tierFromPriceId(priceId: string) {
  const plan = Object.values(PLANS).find((p) => p.stripePriceId === priceId);
  if (!plan) {
    console.error(`No plan found for priceId: ${priceId} — check STRIPE_PRO_PRICE_ID and STRIPE_ENTERPRISE_PRICE_ID env vars`);
    return "FREE";
  }
  return plan.tier;
}

const STRIPE_STATUS_MAP: Record<Stripe.Subscription.Status, string> = {
  active: "ACTIVE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  past_due: "PAST_DUE",
  trialing: "TRIALING",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

function stripeStatusToEnum(status: Stripe.Subscription.Status): string {
  const mapped = STRIPE_STATUS_MAP[status];
  if (!mapped) {
    console.warn(`Unknown Stripe subscription status: ${status} — defaulting to ACTIVE`);
    return "ACTIVE";
  }
  return mapped;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const customer = await prisma.customer.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!customer) {
    console.error(`No customer found for stripeCustomerId: ${customerId}`);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id ?? "";
  const tier = tierFromPriceId(priceId);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      customerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: stripeStatusToEnum(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
    update: {
      stripePriceId: priceId,
      tier,
      status: stripeStatusToEnum(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text(); // must be raw text — not json()
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          await upsertSubscription(subscription);
        }

        if (session.mode === "payment" && session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(
            session.payment_intent as string
          );
          const customer = await prisma.customer.findUnique({
            where: { stripeCustomerId: session.customer as string },
          });
          if (customer) {
            await prisma.payment.create({
              data: {
                customerId: customer.id,
                stripePaymentId: pi.id,
                amount: pi.amount,
                currency: pi.currency,
                status: pi.status,
                idempotencyKey: session.metadata?.idempotencyKey,
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "CANCELED" },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        // Guard — invoice.subscription is null for one-time payment invoices
        if (!invoice.subscription) break;

        const subscriptionId = invoice.subscription as string;
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: "PAST_DUE", gracePeriodEnd },
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        // Guard — invoice.subscription is null for one-time payment invoices
        if (!invoice.subscription) break;

        const subscriptionId = invoice.subscription as string;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: "ACTIVE", gracePeriodEnd: null },
        });
        break;
      }

      default:
        // Unhandled event — log and return 200 so Stripe doesn't retry
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

> **Critical:** The webhook route must use `req.text()` not `req.json()` — Stripe signature verification requires the raw unparsed body. If you parse it as JSON first, verification will always fail.

---

## Verification

- [ ] `bun run db:migrate` ran without errors
- [ ] `src/lib/stripe.ts`, `src/lib/plans.ts`, `src/lib/billing.ts` all created
- [ ] Both checkout routes created at `src/app/api/stripe/checkout/route.ts` and `src/app/api/stripe/subscribe/route.ts`
- [ ] Webhook route created at `src/app/api/stripe/webhook/route.ts`

**Next: read [testing.md](testing.md)**

---

## Common Errors

**`Cannot find module '@/env'`**
`env-validation-setup` skill hasn't been run. Complete that first.

**`Migration failed — relation "User" does not exist`**
The `User` model in your Prisma schema must exist before running this migration. Ensure `prisma-setup` and `better-auth-setup` were completed first.

**`No signatures found matching the expected signature for payload`**
The webhook route is using `req.json()` instead of `req.text()`. Check the webhook route.

**`No plan found for priceId`**
`STRIPE_PRO_PRICE_ID` or `STRIPE_ENTERPRISE_PRICE_ID` in `.env` doesn't match the price ID in the Stripe webhook event. Check for test vs live mode mismatch.