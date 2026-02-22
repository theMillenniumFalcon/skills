---
name: better-auth-setup
description: Use this skill when the user wants to set up authentication using Better Auth in a Next.js project. Triggers when the user asks to add auth, configure sign-in/sign-up, set up Google OAuth, add an admin plugin, or integrate Better Auth with Prisma. Also use this when the user says things like "add auth to my app", "set up better auth", "configure Google login", or "how do I protect routes" — even if they don't mention Better Auth by name.
---

# Better Auth Setup (Next.js + Prisma + Google OAuth + Admin)

A skill for setting up Better Auth in a Next.js App Router project with Prisma adapter, Email & Password, Google OAuth, and the Admin plugin.

> Assumes Prisma is already set up. If not, run the `prisma-setup` skill first.

---

## Step 1: Install Dependencies

```bash
bun add better-auth
```

---

## Step 2: Add Environment Variables

Add to `.env`:

```env
BETTER_AUTH_SECRET="your-secret-here"
BETTER_AUTH_URL="http://localhost:3000"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

Generate a secure secret with:

```bash
openssl rand -base64 32
```

Also add these to `.env.example` with empty values.

---

## Step 3: Generate Auth Schema

Run the Better Auth CLI to add the required tables to your Prisma schema:

```bash
bunx @better-auth/cli generate
```

Then apply the migration:

```bash
bun run db:migrate
```

---

## Step 4: Create the Auth Instance

Create `src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, nextCookies } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin(),
    nextCookies(), // must be last
  ],
});
```

> `nextCookies()` must always be the last plugin in the array.

---

## Step 5: Create the Auth Client

Create `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [adminClient()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = authClient;
```

---

## Step 6: Create the API Route Handler

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

---

## Step 7: Add NEXT_PUBLIC_APP_URL to .env

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Step 8: Protect Routes with Middleware

Create `middleware.ts` at the root:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");

  if (!session && !isAuthRoute) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

---

## Step 9: Get Session on the Server

Use this pattern in Server Components and Server Actions:

```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({
  headers: await headers(),
});
```

---

## Usage Notes

- Always import `authClient` from `@/lib/auth-client` on the client side and `auth` from `@/lib/auth` on the server side — never mix them
- The Admin plugin lets you manage users, ban/unban, impersonate, and list sessions — use `authClient.admin.*` on the client
- After adding any new Better Auth plugin, re-run `bunx @better-auth/cli generate` and `bun run db:migrate` to update the schema
- For Google OAuth, set up credentials at [console.cloud.google.com](https://console.cloud.google.com) and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI