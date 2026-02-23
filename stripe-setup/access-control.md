# Stripe Access Control, Feature Gating & Usage Tracking

Covers: middleware for route-level plan protection, server-component feature gating, and usage tracking for metered actions.

**Complete [payments.md](payments.md) and [testing.md](testing.md) before this file.**

---

## Step 1: Access Control Middleware

Create `src/middleware.ts` (or merge into your existing middleware):

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

// Map protected routes to the minimum plan required to access them
const PROTECTED_ROUTES: Record<string, keyof typeof PLANS> = {
  "/dashboard/analytics": "PRO",
  "/dashboard/api-keys": "PRO",
  "/dashboard/custom-domain": "PRO",
  "/dashboard/support": "ENTERPRISE",
};

const planOrder: Record<keyof typeof PLANS, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

export async function middleware(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  // Auth guard
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Plan guard
  // Note: getUserPlan queries the DB on every request. For high-traffic apps,
  // cache the plan in the session token or a short-lived cookie.
  const requiredTier = PROTECTED_ROUTES[req.nextUrl.pathname];
  if (requiredTier) {
    const userPlan = await getUserPlan(session.user.id);

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

> If `/billing/upgrade` is inside `/dashboard`, it will match the middleware and cause an infinite redirect loop. Either move it outside `/dashboard` or add it as an exclusion in `matcher`.

---

## Step 2: Feature Gating in Server Components

Check plan features directly in Server Components to conditionally render UI:

```tsx
// src/app/dashboard/analytics/page.tsx
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

This pattern works for any feature flag in `PLANS`:

```ts
features.advancedAnalytics  // boolean
features.prioritySupport    // boolean
features.customDomain       // boolean
```

To add a new feature gate:
1. Add the feature to `PLANS` in `src/lib/plans.ts`
2. Gate it in the relevant Server Component or Server Action

---

## Step 3: Usage Tracking for Metered Actions

Use this pattern in Server Actions or API routes for any AI or API-rate-limited feature:

```ts
// src/app/actions/generate.ts
"use server";

import { checkUsageLimit, recordUsage } from "@/lib/billing";

export async function generateAI(userId: string, prompt: string) {
  // 1. Check limit before doing anything
  const { allowed, used, limit } = await checkUsageLimit(userId, "aiGenerationsPerMonth");

  if (!allowed) {
    throw new Error(
      `Monthly AI generation limit reached (${used}/${limit}). Upgrade your plan to continue.`
    );
  }

  // 2. Perform the action
  const result = await callAIProvider(prompt);

  // 3. Record usage after success — not before, so failed calls don't count
  await recordUsage(userId, "aiGenerationsPerMonth", 1, {
    promptLength: prompt.length,
  });

  return result;
}
```

Available usage limit keys (defined in `src/lib/plans.ts`):

```ts
"apiCallsPerMonth"        // general API call tracking
"aiGenerationsPerMonth"   // AI generation tracking
```

To add a new metered action:
1. Add the key to `limits` in every plan tier in `src/lib/plans.ts`
2. Use `checkUsageLimit` and `recordUsage` with the new key

---

## Verification

- [ ] Visiting a PRO-only route as a FREE user redirects to `/billing/upgrade`
- [ ] Visiting a PRO-only route as a PRO user loads correctly
- [ ] `checkUsageLimit` returns `{ allowed: false }` when monthly limit is exceeded
- [ ] `recordUsage` creates a `UsageRecord` row in the DB
- [ ] No infinite redirect loop on `/billing/upgrade`

---

## Common Errors

**`Middleware causing infinite redirect loop`**
`/billing/upgrade` is matched by `/dashboard/:path*`. Move the upgrade page outside `/dashboard` or add a negative matcher:

```ts
export const config = {
  matcher: ["/dashboard/:path*", "!/dashboard/upgrade"],
};
```

**`getUserPlan always returns FREE`**
Check that the webhook handler correctly created a `Subscription` row. Query the DB directly: `SELECT * FROM "Subscription" WHERE "customerId" = '...'`.

**`checkUsageLimit always returns allowed: true`**
The `action` string doesn't match any `UsageRecord` rows. Check that `recordUsage` is being called with the same `action` key as `checkUsageLimit`.