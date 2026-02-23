# Resend Setup, Email Templates & Preview Server

Covers: installing dependencies, env vars, Resend singleton, email sending helper, React Email component patterns (welcome, password reset, invoice), and local preview server.

**After completing this file, read [auth-emails.md](auth-emails.md).**

---

## Step 1: Install Dependencies

```bash
bun add resend react-email @react-email/components
```

---

## Step 2: Environment Variables

Add to `.env`:

```env
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="hello@yourdomain.com"    # must be from a verified domain
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Add to `.env.example`:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_APP_URL=
```

Add to `src/env.ts`:

```ts
server: {
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
},
client: {
  NEXT_PUBLIC_APP_URL: z.string().url(),
},
runtimeEnv: {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
},
```

> `NEXT_PUBLIC_APP_URL` may already exist from another skill — skip if so.

---

## Step 3: Resend Singleton

Create `src/lib/resend.ts`:

```ts
import { Resend } from "resend";
import { env } from "@/env";

export const resend = new Resend(env.RESEND_API_KEY);
```

---

## Step 4: Email Sending Helper

Create `src/lib/email.ts` — typed wrapper around Resend with consistent error handling:

```ts
import { resend } from "@/lib/resend";
import { env } from "@/env";
import type { ReactElement } from "react";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  tags,
}: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      react,
      replyTo,
      tags,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("sendEmail failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}
```

Usage:

```ts
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";

const result = await sendEmail({
  to: "user@example.com",
  subject: "Welcome to MyApp",
  react: <WelcomeEmail name="Alice" />,
});

if (!result.success) {
  console.error("Email failed:", result.error);
}
```

---

## Step 5: React Email Templates

Create an `emails/` folder at the project root (or inside `src/`). Each template is a standard React component.

### Layout Component

Create `emails/components/email-layout.tsx` — shared wrapper used by all templates:

```tsx
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
} from "@react-email/components";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto max-w-[580px] py-12">
            <Section className="rounded-lg bg-white px-8 py-10 shadow-sm">
              {children}
            </Section>
            <Section className="mt-6 px-8 text-center text-xs text-gray-400">
              © {new Date().getFullYear()} MyApp · All rights reserved
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
```

---

### Welcome Email

Create `emails/welcome.tsx`:

```tsx
import {
  Button,
  Heading,
  Hr,
  Link,
  Text,
} from "@react-email/components";
import { EmailLayout } from "./components/email-layout";

interface WelcomeEmailProps {
  name: string;
  appUrl: string;
}

export function WelcomeEmail({ name, appUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout preview={`Welcome to MyApp, ${name}!`}>
      <Heading className="mb-6 text-2xl font-bold text-gray-900">
        Welcome, {name} 👋
      </Heading>
      <Text className="mb-4 text-base text-gray-700">
        We're glad you're here. Your account is ready — click below to get
        started.
      </Text>
      <Button
        href={appUrl}
        className="rounded bg-black px-5 py-3 text-sm font-semibold text-white"
      >
        Go to Dashboard
      </Button>
      <Hr className="my-8 border-gray-200" />
      <Text className="text-xs text-gray-400">
        If you didn't create an account, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

// Default props for preview server
WelcomeEmail.PreviewProps = {
  name: "Alice",
  appUrl: "http://localhost:3000/dashboard",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
```

---

### Password Reset Email

Create `emails/password-reset.tsx`:

```tsx
import {
  Button,
  Heading,
  Hr,
  Text,
} from "@react-email/components";
import { EmailLayout } from "./components/email-layout";

interface PasswordResetEmailProps {
  resetUrl: string;
  expiresInHours?: number;
}

export function PasswordResetEmail({
  resetUrl,
  expiresInHours = 1,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your MyApp password">
      <Heading className="mb-6 text-2xl font-bold text-gray-900">
        Reset your password
      </Heading>
      <Text className="mb-4 text-base text-gray-700">
        We received a request to reset your password. Click the button below —
        this link expires in {expiresInHours} hour{expiresInHours !== 1 ? "s" : ""}.
      </Text>
      <Button
        href={resetUrl}
        className="rounded bg-black px-5 py-3 text-sm font-semibold text-white"
      >
        Reset Password
      </Button>
      <Hr className="my-8 border-gray-200" />
      <Text className="text-xs text-gray-400">
        If you didn't request a password reset, you can safely ignore this
        email. Your password will not be changed.
      </Text>
    </EmailLayout>
  );
}

PasswordResetEmail.PreviewProps = {
  resetUrl: "http://localhost:3000/reset-password?token=abc123",
  expiresInHours: 1,
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
```

---

### Invoice Email

Create `emails/invoice.tsx`:

```tsx
import {
  Column,
  Heading,
  Hr,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { EmailLayout } from "./components/email-layout";

interface InvoiceItem {
  description: string;
  amount: number; // in cents
}

interface InvoiceEmailProps {
  customerName: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  totalCents: number;
  invoiceUrl: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InvoiceEmail({
  customerName,
  invoiceNumber,
  items,
  totalCents,
  invoiceUrl,
}: InvoiceEmailProps) {
  return (
    <EmailLayout preview={`Invoice ${invoiceNumber} — ${formatCents(totalCents)}`}>
      <Heading className="mb-2 text-2xl font-bold text-gray-900">
        Invoice {invoiceNumber}
      </Heading>
      <Text className="mb-6 text-gray-500">Hi {customerName},</Text>

      <Section className="mb-6 rounded border border-gray-200 p-4">
        {items.map((item, i) => (
          <Row key={i} className="mb-2">
            <Column className="text-sm text-gray-700">{item.description}</Column>
            <Column className="text-right text-sm font-medium text-gray-900">
              {formatCents(item.amount)}
            </Column>
          </Row>
        ))}
        <Hr className="my-3 border-gray-200" />
        <Row>
          <Column className="text-sm font-bold text-gray-900">Total</Column>
          <Column className="text-right text-sm font-bold text-gray-900">
            {formatCents(totalCents)}
          </Column>
        </Row>
      </Section>

      <Text className="text-sm text-gray-500">
        View the full invoice at{" "}
        <a href={invoiceUrl} className="text-black underline">
          {invoiceUrl}
        </a>
      </Text>
    </EmailLayout>
  );
}

InvoiceEmail.PreviewProps = {
  customerName: "Alice",
  invoiceNumber: "INV-0042",
  items: [
    { description: "Pro Plan — January 2025", amount: 1900 },
    { description: "Extra seats (2)", amount: 1000 },
  ],
  totalCents: 2900,
  invoiceUrl: "http://localhost:3000/billing/invoices/inv-0042",
} satisfies InvoiceEmailProps;

export default InvoiceEmail;
```

---

## Step 6: Preview Server

React Email has a built-in preview server for developing templates in the browser without sending real emails.

Add to `package.json` scripts:

```json
"email:dev": "email dev --dir emails --port 3001"
```

Run it:

```bash
bun run email:dev
```

Open `http://localhost:3001` — you'll see all templates in `emails/` rendered live with their `PreviewProps`. Changes hot-reload instantly.

> The preview server reads `PreviewProps` from each template's default export. Always define `PreviewProps` on your templates so they render in the preview server without needing real data.

---

## Verification

- [ ] `bun run email:dev` starts without errors and shows all 3 templates at `http://localhost:3001`
- [ ] `sendEmail()` returns `{ success: true, id: "..." }` when called with a valid recipient
- [ ] Emails arrive with correct content in Resend Dashboard → **Emails** log

---

## Common Errors

**`Missing API key`**
`RESEND_API_KEY` is not set or not wired into `runtimeEnv` in `src/env.ts`. Check all three places.

**`You can only send testing emails to your own email address`**
Your sending domain is not verified in Resend. Either verify the domain or send only to the email address on your Resend account during development.

**`Email templates not showing in preview server`**
The preview server only picks up files with a default export. Make sure each template file has `export default`.

**`Tailwind classes not applying in email`**
The `<Tailwind>` wrapper from `@react-email/components` must wrap the entire `<Body>`. Check `email-layout.tsx`.