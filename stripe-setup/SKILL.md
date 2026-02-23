---
name: stripe-setup
description: Use this skill when the user wants to integrate Stripe into a Next.js App Router project. Triggers when the user asks to add payments, set up subscriptions, handle webhooks, gate features by plan, track usage, or store billing data. Also use this when the user says things like "add Stripe to my Next.js app", "set up subscription payments", "handle Stripe webhooks", "gate features by plan", or "track API usage for billing" — even if they don't mention specific Stripe APIs.
---

# Stripe Setup (Next.js App Router + Prisma + TypeScript)

This skill is split into focused modules. Read and complete each file in order.

## Quick Reference

| What you need | File |
|---|---|
| Full setup from scratch | Read all three files below in order |
| Payments, subscriptions, webhooks | [payments.md](payments.md) |
| Local testing + production Dashboard config | [testing.md](testing.md) |
| Route protection, feature gating, usage tracking | [access-control.md](access-control.md) |

---

## Before You Start

- **Stripe account?** Sign up at [stripe.com](https://stripe.com) if you don't have one.
- **Stripe CLI installed?** Run `stripe --version`. If missing: `brew install stripe/stripe-cli/stripe` (macOS) or see [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).
- **Test mode?** Confirm the Stripe Dashboard has **Test Mode** toggled on — keys and products in test mode won't charge real cards.
- **`env-validation-setup` done?** Run it first — Step 2 of `payments.md` assumes it is in place.
- **`prisma-setup` done?** Run it first — `payments.md` adds tables to an existing Prisma schema.
- **`better-auth-setup` done?** Run it first — this skill assumes `auth()` is available to get the current user.
- **Products created in Stripe?** Create products and prices in the Stripe Dashboard before writing code. Copy the Price IDs — you will need them in `payments.md`.

---

## Order of Execution

1. Read and complete [payments.md](payments.md)
2. Read and complete [testing.md](testing.md)
3. Read and complete [access-control.md](access-control.md)