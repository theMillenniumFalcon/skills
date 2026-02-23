# Better Auth Email Integration

Covers: wiring Resend into Better Auth to send welcome emails on signup and password reset emails when a user requests a reset.

**Complete [templates.md](templates.md) before this file. After completing this file, read [webhooks.md](webhooks.md).**

---

## How Better Auth sends emails

Better Auth exposes two hooks for email sending:

- `sendEmail` on the `emailAndPassword` plugin — called for password reset
- `afterSignUp` on the `hooks` option — called after a user successfully registers

Both receive the user's data and expect you to send the email yourself. Resend is called directly from these hooks.

---

## Step 1: Wire sendEmail into Better Auth

Update `src/lib/auth.ts` to add email sending to the `emailAndPassword` plugin and a `afterSignUp` hook:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailAndPassword } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { WelcomeEmail } from "@/emails/welcome";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Called when a user requests a password reset
    sendResetPassword: async ({ user, url }) => {
      const result = await sendEmail({
        to: user.email,
        subject: "Reset your password",
        react: (
          <PasswordResetEmail
            resetUrl={url}
            expiresInHours={1}
          />
        ),
      });

      if (!result.success) {
        console.error(`Failed to send password reset email to ${user.email}:`, result.error);
      }
    },
  },

  hooks: {
    after: [
      {
        matcher: (context) => context.path === "/sign-up/email",
        handler: async (context) => {
          const user = context.context.newSession?.user;
          if (!user) return;

          const result = await sendEmail({
            to: user.email,
            subject: "Welcome to MyApp",
            react: (
              <WelcomeEmail
                name={user.name ?? user.email}
                appUrl={`${env.NEXT_PUBLIC_APP_URL}/dashboard`}
              />
            ),
          });

          if (!result.success) {
            // Log but don't throw — failed welcome email should not break signup
            console.error(`Failed to send welcome email to ${user.email}:`, result.error);
          }
        },
      },
    ],
  },

  // ... rest of your auth config (socialProviders, plugins, etc.)
});
```

> The welcome email hook catches errors without rethrowing — a failed email must never block a successful signup. The password reset hook also only logs on failure, since Better Auth will surface its own error to the user if the hook throws.

---

## Step 2: Add `sendVerificationEmail` (if using email verification)

If you have `emailVerification` enabled in Better Auth, wire it the same way:

```ts
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    await sendEmail({
      to: user.email,
      subject: "Verify your email address",
      react: (
        <VerificationEmail
          verifyUrl={url}
          name={user.name ?? user.email}
        />
      ),
    });
  },
},
```

Create `emails/verification.tsx` following the same pattern as the other templates in [templates.md](templates.md).

---

## Verification

- [ ] Sign up with a new account → welcome email arrives in inbox (check Resend Dashboard → Emails if not in inbox)
- [ ] Request a password reset → reset email arrives with a working reset link
- [ ] Check that a failed email send does not break the signup or reset flow
- [ ] Resend Dashboard → **Emails** shows the sent emails with correct `to`, `from`, and `subject`

---

## Common Errors

**`sendResetPassword` not being called**
`emailAndPassword.enabled` must be `true`. If the plugin is not initialised or `enabled` is missing, the hook never fires.

**Welcome email sending but user isn't saved**
The `after` hook runs after the response is sent — the user is already saved by the time it runs. This is correct behaviour. Never use `before` hooks for email sending.

**`user.name` is null**
Better Auth does not require a name at signup. The `user.name ?? user.email` fallback handles this — verify it is in place.

**Reset link expired immediately**
Better Auth's default reset token TTL is 1 hour. Make sure `expiresInHours` in `PasswordResetEmail` matches your Better Auth config. If you've set a custom TTL on the `emailAndPassword` plugin, update the email copy accordingly.