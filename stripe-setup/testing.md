# Stripe Testing & Dashboard Setup

Covers: local webhook testing with the Stripe CLI and registering webhook events in the Stripe Dashboard for production.

**Complete [payments.md](payments.md) before this file. After completing this file, read [access-control.md](access-control.md).**

---

## Step 1: Local Webhook Testing

Run these in two separate terminals:

**Terminal 1 — forward webhooks to local server:**

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook signing secret printed in the output:

```
> Ready! Your webhook signing secret is whsec_... (^C to quit)
```

Set it in `.env`:

```env
STRIPE_WEBHOOK_SECRET="whsec_..."
```

**Terminal 2 — trigger test events:**

```bash
# Test subscription checkout completion
stripe trigger checkout.session.completed

# Test subscription update
stripe trigger customer.subscription.updated

# Test payment failure + grace period
stripe trigger invoice.payment_failed

# Test grace period clearing
stripe trigger invoice.payment_succeeded
```

After each trigger, verify the expected DB change:

| Event triggered | Expected DB result |
|---|---|
| `checkout.session.completed` (subscription) | New `Subscription` row with `status: ACTIVE` |
| `checkout.session.completed` (payment) | New `Payment` row |
| `invoice.payment_failed` | `Subscription.status = PAST_DUE`, `gracePeriodEnd` set |
| `invoice.payment_succeeded` | `Subscription.status = ACTIVE`, `gracePeriodEnd = null` |
| `customer.subscription.updated` | `Subscription` row updated |

> The webhook secret printed by `stripe listen` is only valid for the current CLI session — update `STRIPE_WEBHOOK_SECRET` in `.env` each time you restart `stripe listen`.

---

## Step 2: Register Webhook Events in Stripe Dashboard

Before deploying to production, register your endpoint and events in the Stripe Dashboard:

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Set the endpoint URL to: `https://yourdomain.com/api/stripe/webhook`
3. Select exactly these events:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

4. Copy the signing secret from the endpoint details page and set it as `STRIPE_WEBHOOK_SECRET` in your production environment.

> If any of these events are missing, Stripe will not send them to your endpoint — even if your handler handles them. This is the most common reason grace periods don't clear or subscriptions don't update in production.

---

## Verification

- [ ] `stripe listen` runs without error
- [ ] `stripe trigger invoice.payment_failed` → `Subscription` row shows `status: PAST_DUE` and `gracePeriodEnd` set in DB
- [ ] `stripe trigger invoice.payment_succeeded` → `Subscription` row shows `status: ACTIVE` and `gracePeriodEnd: null`
- [ ] Production webhook endpoint registered in Stripe Dashboard with all 6 events

**Next: read [access-control.md](access-control.md)**

---

## Common Errors

**`No signatures found matching the expected signature for payload`**
The webhook route is using `req.json()` instead of `req.text()`. Check `src/app/api/stripe/webhook/route.ts`.

**`Webhook signing secret is wrong`**
The secret printed by `stripe listen` changes every session. Copy the latest one and update `STRIPE_WEBHOOK_SECRET` in `.env`.

**`Grace period not clearing after payment`**
`invoice.payment_succeeded` is missing from the Dashboard webhook event list. Add it and redeploy.