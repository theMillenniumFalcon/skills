---
name: better-auth-setup
description: Use this skill when the user wants to set up authentication using Better Auth in a Next.js project. Triggers when the user asks to add auth, configure sign-in/sign-up, set up Google OAuth, add an admin plugin, or integrate Better Auth with Prisma. Also use this when the user says things like "add auth to my app", "set up better auth", "configure Google login", or "how do I protect routes" — even if they don't mention Better Auth by name.
---

# Better Auth Setup (Next.js + Prisma + Google OAuth + Admin)

A skill for setting up Better Auth in a Next.js App Router project with Prisma adapter, Email & Password, Google OAuth, and the Admin plugin.

---

## Before You Start

Check these before proceeding:

- **Is Prisma already set up?** Better Auth's Prisma adapter requires a working Prisma client at `@/lib/prisma`. If it doesn't exist, run the `prisma-setup` skill first.
- **Which Next.js version?** Better Auth currently supports Next.js 14 and 15. If the user is on Next.js 16, flag it — due to middleware changes in Next.js 16, Better Auth is not yet compatible with it. They'll need to stay on Next.js 15 for now.
- **Is this inside a Turborepo monorepo?** If yes, confirm which app you're setting up auth in (e.g. `apps/web`) — all file paths in this skill are relative to that app's root.
- **Do you have Google OAuth credentials?** The user needs a `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from [console.cloud.google.com](https://console.cloud.google.com). If they don't have them yet, they can skip `socialProviders` for now and add it later.

---

## Step 1: Install Dependencies

```bash
bun add better-auth
```

**Verify:** Run `bunx better-auth --version` — if it prints a version, the install succeeded.

---

## Step 2: Add Environment Variables

Add to `.env`:

```env
BETTER_AUTH_SECRET="your-secret-here"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

Generate a secure secret with:

```bash
openssl rand -base64 32
```

Also add all keys to `.env.example` with empty values. Never commit real secrets.

> `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` should match your actual deployment URL in production (e.g. `https://yourdomain.com`).

---

## Step 3: Generate Auth Schema

Run the Better Auth CLI to append the required tables to your Prisma schema:

```bash
bunx @better-auth/cli generate
```

Then apply the migration:

```bash
bun run db:migrate
```

**Verify:** Open `prisma/schema.prisma` — you should see new models like `User`, `Session`, `Account`, and `Verification` added by Better Auth. If they're missing, the CLI didn't run correctly — try again with `bunx @better-auth/cli@latest generate`.

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
    provider: "postgresql", // change to "mysql" or "sqlite" if needed
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
    nextCookies(), // must always be last
  ],
});
```

> `nextCookies()` must always be the **last** plugin in the array — placing it anywhere else will break cookie handling.

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

export const { signIn, signOut, signUp, useSession } = authClient;
```

> **Important:** Always import `authClient` from this file on the **client side** and `auth` from `@/lib/auth` on the **server side**. Mixing them will cause runtime errors.

---

## Step 6: Create the API Route Handler

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

**Verify:** Start the dev server and visit `http://localhost:3000/api/auth/get-session` in the browser. It should return `null` (not a 404). If you get a 404, the route file is in the wrong place — confirm the folder is named `[...all]` not `[...nextauth]` or anything else.

---

## Step 7: Protect Routes with Middleware

Create `middleware.ts` at the **project root** (same level as `src/`):

```ts
import { NextRequest, NextResponse } from "next/server";
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

> Adjust `/auth/sign-in` and `/dashboard` to match your actual routes. The `matcher` pattern excludes API routes and static assets from middleware — don't remove those exclusions or auth requests will loop.

---

## Step 8: Get Session on the Server

Use this pattern in Server Components and Server Actions:

```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  // handle unauthenticated
}
```

---

## Step 9: Set Up Google OAuth Redirect URI

In [Google Cloud Console](https://console.cloud.google.com):

1. Go to **APIs & Services → Credentials**
2. Open your OAuth 2.0 Client
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)

Without this, Google will reject the OAuth callback with a `redirect_uri_mismatch` error.

---

## Final Verification Checklist

- [ ] `http://localhost:3000/api/auth/get-session` returns `null` (not 404)
- [ ] Sign up with email/password creates a user — check via `bunx prisma studio`
- [ ] Sign in with email/password returns a session
- [ ] Google OAuth redirects to Google and returns to the app
- [ ] Visiting a protected route while signed out redirects to `/auth/sign-in`
- [ ] Visiting `/auth/sign-in` while signed in redirects to `/dashboard`
- [ ] `authClient.admin.listUsers()` works from a client component (confirms Admin plugin is wired)

---

## Common Errors

**`404 on /api/auth/*`**
The route file is misnamed or in the wrong location. It must be at `src/app/api/auth/[...all]/route.ts` — the folder name `[...all]` is required by Better Auth, not `[...nextauth]`.

**`BETTER_AUTH_SECRET is not set`**
The env var is missing or `.env` isn't being loaded. Make sure `.env` is at the root of the app (not inside `src/`) and that `BETTER_AUTH_SECRET` is set.

**`redirect_uri_mismatch` from Google**
The redirect URI in Google Cloud Console doesn't match. Add `http://localhost:3000/api/auth/callback/google` exactly as shown in Step 9.

**`nextCookies is not working` / session lost after redirect**
`nextCookies()` is not the last plugin in the array. Move it to the end.

**`PrismaClientInitializationError` in auth.ts**
The Prisma client singleton isn't set up correctly or the database isn't running. Revisit `src/lib/prisma.ts` and confirm the DB is reachable.

**`Cannot find module 'better-auth/adapters/prisma'`**
Better Auth version is outdated. Run `bun add better-auth@latest` to update.

**Better Auth not working on Next.js 16**
Better Auth does not support Next.js 16 yet. Downgrade to Next.js 15 or wait for official support. 