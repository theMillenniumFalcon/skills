---
name: email-setup
description: Use this skill when the user wants to send emails from a Next.js App Router project. Triggers when the user asks to set up transactional email, add welcome emails, send password reset emails, integrate Resend, build email templates with React Email, handle email webhooks, or wire email into Better Auth. Also use this when the user says things like "send emails from my app", "set up Resend", "build email templates", "trigger email on signup", or "handle email bounces".
---

# Email Setup (Resend + React Email + Next.js App Router)

This skill is split into focused modules. Read and complete each file in order.

## Quick Reference

| What you need | File |
|---|---|
| Full setup from scratch | Read all three files in order |
| Resend setup, email helper, React Email templates, preview server | [templates.md](templates.md) |
| Better Auth integration — welcome + password reset emails | [auth-emails.md](auth-emails.md) |
| Webhook handling — bounces, complaints, delivery events | [webhooks.md](webhooks.md) |

---

## Before You Start

- **Resend account?** Sign up at [resend.com](https://resend.com) and create an API key under **API Keys**.
- **Domain verified?** For production, verify your sending domain in the Resend Dashboard under **Domains**. Without this, emails only send to your own address in test mode.
- **`env-validation-setup` done?** Run it first — Step 1 of `templates.md` assumes it is in place.
- **`better-auth-setup` done?** Only required if you want auth-triggered emails in [auth-emails.md](auth-emails.md).

---

## Order of Execution

1. Read and complete [templates.md](templates.md)
2. Read and complete [auth-emails.md](auth-emails.md) — only if using Better Auth
3. Read and complete [webhooks.md](webhooks.md)