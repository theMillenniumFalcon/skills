# Resend Webhook Handling

Covers: setting up a webhook endpoint to receive delivery events from Resend — bounces, complaints, delivery confirmations, and opens/clicks. Includes signature verification and storing events in the database.

**Complete [templates.md](templates.md) and [auth-emails.md](auth-emails.md) before this file.**

---

## Why handle webhooks

Resend sends webhook events when emails are delivered, bounced, or marked as spam. Without handling these you have no visibility into delivery failures, and you risk continuing to send emails to addresses that have hard-bounced (which damages your sender reputation).

**Minimum you should handle:**
- `email.bounced` — hard bounces. Stop sending to this address.
- `email.complained` — spam reports. Stop sending immediately.

**Nice to have:**
- `email.delivered` — confirmation of delivery
- `email.opened` / `email.clicked` — engagement tracking

---

## Step 1: Add Prisma Model

Add an `EmailEvent` table to `schema.prisma` to log webhook events:

```prisma
model EmailEvent {
  id        String   @id @default(cuid())
  resendId  String   @unique  // Resend email ID
  type      String            // e.g. "email.delivered", "email.bounced"
  to        String
  createdAt DateTime @default(now())
  payload   Json              // full event payload for debugging

  @@index([resendId])
  @@index([to, type])
}
```

Run migration:

```bash
bun run db:migrate
```

---

## Step 2: Add Webhook Secret to Env

In the Resend Dashboard → **Webhooks** → create a webhook, copy the signing secret.

Add to `.env`:

```env
RESEND_WEBHOOK_SECRET="whsec_..."
```

Add to `.env.example`:

```env
RESEND_WEBHOOK_SECRET=
```

Add to `src/env.ts`:

```ts
server: {
  RESEND_WEBHOOK_SECRET: z.string().min(1),
},
runtimeEnv: {
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
},
```

---

## Step 3: Webhook Route

Create `src/app/api/email/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

// Resend webhooks are signed using svix
// Install: bun add svix

export const runtime = "nodejs";

type ResendWebhookEvent = {
  type: string;
  data: {
    email_id: string;
    to: string[];
    created_at: string;
    [key: string]: unknown;
  };
};

export async function POST(req: NextRequest) {
  const body = await req.text();

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  let event: ResendWebhookEvent;

  try {
    const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.error("Resend webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const { type, data } = event;
    const to = data.to?.[0] ?? "";

    // Log every event for debugging
    await prisma.emailEvent.upsert({
      where: { resendId: data.email_id },
      create: {
        resendId: data.email_id,
        type,
        to,
        payload: data as any,
      },
      update: {
        type,
        payload: data as any,
      },
    });

    switch (type) {
      case "email.bounced": {
        // Hard bounce — stop sending to this address
        // Optionally mark the user as unbounced in your DB:
        // await prisma.user.updateMany({
        //   where: { email: to },
        //   data: { emailBounced: true },
        // });
        console.warn(`Hard bounce for ${to} — consider suppressing future sends`);
        break;
      }

      case "email.complained": {
        // Spam complaint — stop sending immediately
        console.warn(`Spam complaint from ${to} — suppress all future sends`);
        break;
      }

      case "email.delivered": {
        console.log(`Email ${data.email_id} delivered to ${to}`);
        break;
      }

      case "email.opened":
      case "email.clicked": {
        // Engagement tracking — no action needed unless you're building analytics
        break;
      }

      default:
        console.log(`Unhandled Resend event type: ${type}`);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Return 500 so Resend retries
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

Install `svix` (Resend's signing library):

```bash
bun add svix
```

---

## Step 4: Register the Webhook in Resend Dashboard

1. Go to **Resend Dashboard → Webhooks → Add endpoint**
2. Set the URL to: `https://yourdomain.com/api/email/webhook`
3. Select the events to receive:

```
email.sent
email.delivered
email.delivery_delayed
email.bounced
email.complained
email.opened
email.clicked
```

4. Copy the signing secret and set it as `RESEND_WEBHOOK_SECRET` in your production environment.

---

## Step 5: Local Testing with Resend CLI

Resend doesn't have a CLI webhook forwarder like Stripe. Instead, use `ngrok` or a similar tunnel for local testing:

```bash
# Install ngrok if you don't have it
brew install ngrok

# Start your Next.js app
bun run dev

# In a second terminal, expose it
ngrok http 3000
```

Copy the `https://...ngrok-free.app` URL, set it as the webhook endpoint in the Resend Dashboard temporarily, then trigger a test send to see events arrive.

---

## Verification

- [ ] `bun add svix` installed
- [ ] `EmailEvent` table created after migration
- [ ] Webhook endpoint registered in Resend Dashboard with all 7 events
- [ ] Sending a test email and checking `EmailEvent` table shows a `email.delivered` row
- [ ] Svix signature verification rejects requests without valid headers

---

## Common Errors

**`Missing svix headers`**
The request is not coming from Resend — it's missing the `svix-id`, `svix-timestamp`, or `svix-signature` headers. Check you're hitting the correct endpoint URL in the Resend Dashboard.

**`Invalid signature`**
`RESEND_WEBHOOK_SECRET` doesn't match the signing secret for this webhook endpoint. Each webhook endpoint in Resend has its own secret — make sure you copied the right one.

**`email.bounced` not firing for test sends**
Resend does not simulate bounces for test sends in the Dashboard. Use a dedicated bounce-test address like `bounced@resend.dev` to trigger a real bounce event.

**`upsert conflict on resendId`**
Resend can send duplicate webhook events (at-least-once delivery). The `upsert` on `resendId` handles this — idempotent by design.