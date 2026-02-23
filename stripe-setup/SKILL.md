---
name: stripe-setup
description: Use this skill when the user wants to integrate Stripe into a Next.js App Router project. Triggers when the user asks to add payments, set up subscriptions, handle webhooks, gate features by plan, track usage, or store billing data. Also use this when the user says things like "add Stripe to my Next.js app", "set up subscription payments", "handle Stripe webhooks", "gate features by plan", or "track API usage for billing" — even if they don't mention specific Stripe APIs.
---

# Stripe Setup (Next.js App Router + Prisma + TypeScript)

A skill for integrating Stripe into a Next.js App Router project — one-time payments, subscriptions, webhooks, plan-based feature gating, usage tracking, and retry/grace period handling.

---

## Before You Start

- **Stripe account?** Sign up at [stripe.com](https://stripe.com) if you don't have one.
- **Stripe CLI installed?** Run `stripe --version`. If missing: `brew install stripe/stripe-cli/stripe` (macOS) or see [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).
- **Test mode?** Make sure the Stripe Dashboard has **Test Mode** toggled on — all keys and products created in test mode stay in test mode and won't charge real cards.
- **Env validation setup?** This skill requires `@t3-oss/env-nextjs` for type-safe env vars. Run `env-validation-setup` skill first if not already done — the env additions in Step 2 assume it is in place.
- **Prisma setup?** This skill stores billing data in Postgres via Prisma. Run `prisma-setup` skill first if not already done.
- **Better Auth setup?** This skill assumes `auth()` is available to get the current user. Adjust if using a different auth provider.
- **Products created in Stripe?** Before writing code, create your products and prices in the Stripe Dashboard (or via CLI fixtures). Copy the Price IDs — you'll need them.

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
STRIPE_WEBHOOK_SECRET="whsec_..."          # filled after Step 10
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

> Remember: every new env var must be added in all three places — `server`/`client` block, `runtimeEnv` block, and `.env`. Missing any one will cause a type or runtime error.

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
  id               String             @id @default(cuid())
  userId           String             @unique
  stripeCustomerId String             @unique
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  user             User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscription     Subscription?
  payments         Payment[]

  @@index([stripeCustomerId])
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
  id         String   @id @default(cuid())
  userId     String
  action     String   // e.g. "api_call", "ai_generation"
  quantity   Int      @default(1)
  metadata   Json?
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

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

## Step 6: Billing Helper

Create `src/lib/billing.ts` — shared helpers for getting user billing state:

```ts
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { PLANS, type PlanTier, type UsageLimitKey } from "@/lib/plans";

// Get or create a Stripe customer for a user
// Uses try/catch on upsert to handle race conditions where two simultaneous
// requests both find no customer and both attempt to create one
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
    // P2002 = unique constraint violation — another request created it first
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

// Get the user's current plan tier
export async function getUserPlan(userId: string): Promise<PlanTier> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) return "FREE";

  // Treat grace period as still active — don't immediately downgrade
  const isActive =
    subscription.status === "ACTIVE" ||
    subscription.status === "TRIALING" ||
    (subscription.status === "PAST_DUE" &&
      subscription.gracePeriodEnd &&
      subscription.gracePeriodEnd > new Date());

  if (!isActive) return "FREE";
  return subscription.tier as PlanTier;
}

// Check if a user can perform an action based on their plan
export async function checkUsageLimit(
  userId: string,
  action: keyof (typeof PLANS)["FREE"]["limits"]
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

// Record a usage event — action must match a key in PLANS limits for accurate tracking
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
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId } = await req.json();
  if (!priceId) return NextResponse.json({ error: "Missing priceId" }, { status: 400 });

  const customer = await getOrCreateCustomer(session.user.id, session.user.email);

  // Idempotency key — prevents duplicate charges on retry
  const idempotencyKey = `checkout-${session.user.id}-${priceId}-${Date.now()}`;

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
}
```

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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId } = await req.json();
  if (!priceId) return NextResponse.json({ error: "Missing priceId" }, { status: 400 });

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
  return plan?.tier ?? "FREE";
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
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
    update: {
      stripePriceId: priceId,
      tier,
      status: stripeStatusToEnum(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text(); // must be raw text — not json()
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

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

      case "customer.subscription.updated":
      case "customer.subscription.created": {
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
        // Only subscriptions need the grace period treatment
        if (!invoice.subscription) break;

        const subscriptionId = invoice.subscription as string;
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: "PAST_DUE",
            gracePeriodEnd,
          },
        });
        break;
      }

      case "invoice.payment_succeeded": {
        // Clear grace period on successful payment
        const invoice = event.data.object as Stripe.Invoice;

        // Guard — invoice.subscription is null for one-time payment invoices
        if (!invoice.subscription) break;

        const subscriptionId = invoice.subscription as string;
        if (subscriptionId) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: "ACTIVE", gracePeriodEnd: null },
          });
        }
        break;
      }

      default:
        // Unhandled event — log and return 200 so Stripe doesn't retry
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing event ${event.type}:`, err);
    // Return 500 so Stripe retries the webhook
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

> **Critical:** The webhook route must use `req.text()` not `req.json()` — Stripe signature verification requires the raw unparsed body. If you parse it as JSON first, verification will always fail.

---

## Step 10: Local Webhook Testing with Stripe CLI

```bash
# Login to Stripe CLI
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Copy the webhook secret printed in the terminal
# → set STRIPE_WEBHOOK_SECRET in .env to this value

# In a separate terminal, trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

---

## Step 11: Register Webhook Events in Stripe Dashboard

Before deploying to production, register which events Stripe should send to your webhook endpoint:

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Set the endpoint URL to: `https://yourdomain.com/api/stripe/webhook`
3. Select the following events:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

> If any of these events are missing from the Dashboard registration, Stripe will not send them to your endpoint — even if your handler handles them. This is the most common reason grace periods don't clear or subscriptions don't update in production.

---

## Step 12: Access Control Middleware

Create `src/middleware.ts` (or merge into existing):

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

const PROTECTED_ROUTES: Record<string, keyof typeof PLANS> = {
  "/dashboard/analytics": "PRO",
  "/dashboard/api-keys": "PRO",
  "/dashboard/custom-domain": "PRO",
  "/dashboard/support": "ENTERPRISE",
};

export async function middleware(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  // Auth guard
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Plan guard — check if route requires a specific plan
  // Note: getUserPlan hits the DB on every request. For high-traffic apps,
  // cache the plan in the session token or a short-lived cookie to avoid
  // a DB query per page load.
  const requiredTier = PROTECTED_ROUTES[req.nextUrl.pathname];
  if (requiredTier) {
    const userPlan = await getUserPlan(session.user.id);
    const planOrder: Record<keyof typeof PLANS, number> = {
      FREE: 0,
      PRO: 1,
      ENTERPRISE: 2,
    };

    if (planOrder[userPlan] < planOrder[requiredTier]) {
      return NextResponse.redirect(new URL("/billing/upgrade", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

---

## Step 13: Plan-Based Feature Gating (Server Components)

```ts
// In a Server Component or Server Action
import { auth } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { headers } from "next/headers";

export default async function AnalyticsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const plan = await getUserPlan(session!.user.id);
  const features = PLANS[plan].features;

  if (!features.advancedAnalytics) {
    return <UpgradePrompt feature="Advanced Analytics" requiredPlan="PRO" />;
  }

  return <AnalyticsDashboard />;
}
```

---

## Step 14: Usage Tracking (AI / API-Based Plans)

Use in Server Actions or API routes before performing the metered action:

```ts
import { checkUsageLimit, recordUsage } from "@/lib/billing";

// In a server action
export async function generateAI(userId: string, prompt: string) {
  const { allowed, used, limit } = await checkUsageLimit(userId, "aiGenerationsPerMonth");

  if (!allowed) {
    throw new Error(
      `Monthly AI generation limit reached (${used}/${limit}). Upgrade to continue.`
    );
  }

  // Perform the action
  const result = await callAIProvider(prompt);

  // Record usage after success
  await recordUsage(userId, "aiGenerationsPerMonth", 1, { promptLength: prompt.length });

  return result;
}
```

---

## Final Verification Checklist

- [ ] `stripe listen --forward-to localhost:3000/api/stripe/webhook` runs without error
- [ ] `stripe trigger checkout.session.completed` creates a `Payment` or `Subscription` row in the DB
- [ ] `stripe trigger invoice.payment_failed` sets `status: PAST_DUE` and `gracePeriodEnd` in DB
- [ ] `stripe trigger invoice.payment_succeeded` clears `gracePeriodEnd` and sets `status: ACTIVE`
- [ ] Visiting a PRO-only route as a FREE user redirects to `/billing/upgrade`
- [ ] `checkUsageLimit` returns `allowed: false` when limit is exceeded
- [ ] Duplicate checkout clicks don't create duplicate `Payment` rows (idempotency key works)
- [ ] Webhook signature verification rejects requests without a valid `stripe-signature` header

---

## Common Errors

**`No signatures found matching the expected signature for payload`**
You're parsing the body as JSON before passing it to `constructEvent`. The route must use `req.text()` — never `req.json()`. Check the webhook route.

**`Webhook signing secret is wrong`**
Local testing uses a different webhook secret than production. The secret printed by `stripe listen` is only valid for local CLI forwarding — update `STRIPE_WEBHOOK_SECRET` in `.env` each time you restart `stripe listen`.

**`Customer not found for stripeCustomerId`**
The `checkout.session.completed` webhook fired before the customer row was created. Make sure `getOrCreateCustomer` is called in the checkout route before creating the session, so the `Customer` row always exists before the webhook arrives.

**`Duplicate idempotency key`**
If you reuse an idempotency key for a different request, Stripe returns the original response. Make sure idempotency keys include enough entropy (userId + priceId + timestamp is sufficient).

**`Grace period not clearing after payment`**
Ensure `invoice.payment_succeeded` is in your webhook's listened event list in the Stripe Dashboard. If it's missing, Stripe won't send the event and the grace period stays set.

**`Middleware causing infinite redirect loop`**
`/billing/upgrade` is inside `/dashboard` and also matched by the middleware. Add it to an exclusion list or move it outside `/dashboard`.