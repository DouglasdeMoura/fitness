# PRD: Landing Page, Blog, and Authentication

## Overview

Three new features to make FitTrack a complete product:

1. **Landing Page** — Public-facing marketing page to introduce the app
2. **Blog** — Content area for science articles and nutrition guides
3. **Authentication** — User accounts via Better Auth so data is per-user

---

## Part 1: Landing Page

### Problem

Visitors land on `/` and immediately see the app dashboard (empty data, no context). There's no explanation of what FitTrack is, why it's different, or how the science works.

### Solution

A polished marketing landing page at `/` (authenticated users redirect to `/dashboard`). Apple-style: clean, bold, confident.

### Sections

1. **Hero**
   - Headline: "Train smarter. Eat better. Backed by science."
   - Subheadline: "The only fitness tracker where every number has a citation."
   - CTA: "Get Started Free" → `/sign-up`
   - Secondary: "See the science" → `/blog`
   - Background: gradient or subtle pattern using Astryx tokens

2. **Feature Highlights** (3-4 ClickableCards)
   - 🥗 "Nutrition tracking with evidence-based macro targets"
   - 🏋️ "Workout logging with progressive overload analysis"
   - 📊 "Progress charts with real trend data, not vanity metrics"
   - 🔬 "Every formula cited — Mifflin-St Jeor, Morton, Schoenfeld"

3. **Science Section**
   - Brief explainer of the formulas used
   - Links to blog articles for deep dives
   - Blockquote with a real research finding

4. **Social Proof / CTA**
   - "Start your evidence-based fitness journey today"
   - Button: "Create your free account"

### Components
- `AppShell` with simplified TopNav (no Dashboard/Settings links when not authenticated)
- `Heading` display-1/2 for hero text
- `Text` supporting for subheadings
- `ClickableCard` for feature highlights
- `Blockquote` for research citation
- `Button` variant="primary" for CTAs
- `VStack`/`HStack` for layout

### Route
- `/` → Landing page (when not authenticated)
- `/` → Redirect to `/dashboard` (when authenticated)
- Separate route component, not inside the app shell

---

## Part 2: Blog

### Problem

The PRDs reference science (Morton, Schoenfeld, Helms, etc.) but there's no place for users to read about it. The app shows formula names but no explanations.

### Solution

A Markdown-powered blog at `/blog` with articles about the science behind the app's calculations.

### Architecture

- Blog posts stored as Markdown files in `content/blog/`
- Server function reads and parses Markdown at request time
- Frontmatter: title, description, date, tags, reading time
- Use Astryx `Markdown` component for rendering

### Blog Post Structure

```
content/blog/
  protein-for-hypertrophy.mdx     # Morton et al. 2018 deep dive
  mifflin-st-jeor-bmr.mdx         # How BMR is calculated and why
  progressive-overload-guide.mdx  # RPE, RIR, and volume tracking
  macros-101.mdx                  # Understanding protein/carbs/fat
  training-volume.mdx             # Schoenfeld's dose-response research
```

### Frontmatter Format

```yaml
---
title: "How Much Protein Do You Really Need?"
description: "A deep dive into Morton et al. 2018 and the protein hypertrophy dose-response"
date: "2026-07-26"
tags: ["nutrition", "protein", "hypertrophy"]
readingTime: 5
---
```

### Pages

1. **`/blog`** — Blog index page
   - Grid of blog post cards (ClickableCard with title, excerpt, date, tags)
   - Filter by tags (SegmentedControl or chips)
   - Featured post at top

2. **`/blog/$slug`** — Individual blog post
   - Full Markdown rendering with Astryx Markdown component
   - Table of contents (if long article)
   - Author/date/tags metadata
   - "Related articles" at the bottom

### Components
- `Markdown` from `@astryxdesign/core/Markdown` for rendering post content
- `ClickableCard` for blog index cards
- `Badge` for tags
- `Heading` for post titles
- `Text` for excerpts and metadata
- `Thumbnail` for cover images (optional)

---

## Part 3: Authentication (Better Auth)

### Problem

The app has a single hardcoded "default user." All data (food logs, workouts, programs) belongs to this one user. No accounts, no login, no data isolation.

### Solution

Better Auth provides a complete auth framework with:
- Email/password sign-up and sign-in
- Social OAuth (GitHub, Google)
- Session management via secure HTTP-only cookies
- Drizzle adapter (integrates with our Drizzle ORM migration)
- Plugin ecosystem (passkey, magic link, username, etc.)

### Dependencies

```bash
npm install better-auth
```

Better Auth lists `@tanstack/react-start`, `better-sqlite3`, and `drizzle-orm` as peer dependencies — all already in the project.

### Setup

#### 1. Auth Instance (`src/lib/auth.ts`)

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

#### 2. Auth Client (`src/lib/auth-client.ts`)

```typescript
import { createAuthClient } from "better-auth/tanstack-start";

export const authClient = createAuthClient();

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = authClient;
```

#### 3. API Route Handler (`src/routes/api/auth/$.ts`)

Mount the Better Auth handler on a catch-all route:

```typescript
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "~/lib/auth";

export const APIRoute = createAPIFileRoute("/api/auth/$")({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});
```

#### 4. Database Schema

Better Auth needs `user`, `session`, `account`, and `verification` tables. Generate them:

```bash
npx @better-auth/cli generate
```

This adds Drizzle table definitions to `src/db/schema.ts`:

```typescript
export const user = sqliteTable("user", { ... });
export const session = sqliteTable("session", { ... });
export const account = sqliteTable("account", { ... });
export const verification = sqliteTable("verification", { ... });
```

#### 5. Link Existing User Table

The existing `users` table (with fitness data) should be linked to Better Auth's `user` table via a foreign key or by extending Better Auth's user schema with additional fields (heightCm, sex, activityLevel, goalType, birthDate).

Better Auth supports custom user fields:

```typescript
export const auth = betterAuth({
  user: {
    additionalFields: {
      heightCm: { type: "number", required: false },
      sex: { type: "string", required: false, defaultValue: "male" },
      activityLevel: { type: "string", required: false, defaultValue: "moderate" },
      goalType: { type: "string", required: false, defaultValue: "build_muscle" },
      birthDate: { type: "string", required: false },
    },
  },
});
```

This eliminates the need for a separate `users` table — Better Auth's user table IS the profile.

### Auth Pages

#### Sign In (`/sign-in`)
- Email + password form (TanStack Form)
- "Sign in with GitHub" social button
- Link to sign-up page
- Astryx Card centered on page with Field + TextInput + Button

#### Sign Up (`/sign-up`)
- Name, email, password form (TanStack Form)
- "Sign up with GitHub" social button
- Link to sign-in page
- Validation (password strength, email format)

#### Protected Routes
- All app routes (`/dashboard`, `/nutrition`, `/workout`, `/progress`, `/settings`) require authentication
- If not authenticated → redirect to `/sign-in`
- Server functions check session via `auth.api.getSession()`

```typescript
export const getDashboardStats = createServerFn({ method: "GET" }).handler(async (ctx) => {
  const session = await auth.api.getSession({ headers: ctx.request.headers })
  if (!session) throw new Error("Unauthorized")
  const userId = session.user.id
  // Query data for this user only
})
```

### Migration Plan

1. Install Better Auth + generate schema
2. Add custom user fields (heightCm, sex, etc.)
3. Update all server functions to use `session.user.id` instead of hardcoded user ID
4. Add auth pages (sign-in, sign-up)
5. Add route guards (redirect to sign-in if not authenticated)
6. Migrate existing data (the default user's data becomes seed/demo data)

---

## Batches

### Batch 1: Better Auth Setup + Schema
- Install better-auth
- Create `src/lib/auth.ts` with Drizzle adapter
- Run `npx @better-auth/cli generate` for schema
- Add custom user fields (fitness profile data)
- Create API route handler
- Add `.env` variables (BETTER_AUTH_SECRET, BETTER_AUTH_URL)

### Batch 2: Auth Pages (Sign In / Sign Up)
- Create `/sign-in` route with TanStack Form
- Create `/sign-up` route with TanStack Form
- Social login buttons (GitHub OAuth)
- Form validation (email format, password strength)
- Error handling with Astryx Banner for auth failures

### Batch 3: Route Guards + Server Function Migration
- Add `requireAuth()` helper that checks session in server functions
- Update all server functions to use `session.user.id`
- Redirect unauthenticated users from app routes to `/sign-in`
- Landing page (`/`) shows marketing content when not authenticated

### Batch 4: Landing Page
- Hero section with headline, subheadline, CTA
- Feature highlight cards (ClickableCard)
- Science explainer section
- Social proof / final CTA
- Simplified TopNav for unauthenticated users

### Batch 5: Blog Infrastructure
- Set up `content/blog/` directory with Markdown frontmatter parsing
- Server function to list and read blog posts
- `/blog` index page with ClickableCard grid
- `/blog/$slug` individual post page with Astryx Markdown component
- Tag filtering with SegmentedControl or Badge

### Batch 6: Blog Content
- Write 3-5 initial blog posts covering the core science:
  - Protein for hypertrophy (Morton et al. 2018)
  - BMR and TDEE explained (Mifflin-St Jeor)
  - Progressive overload and RPE (Zourdos et al.)
  - Training volume guidelines (Schoenfeld et al.)
  - Macros 101: protein, carbs, and fat

---

## Acceptance Criteria

### Authentication
- [ ] Users can sign up with email/password
- [ ] Users can sign in with GitHub OAuth
- [ ] Sessions persist across page reloads (HTTP-only cookies)
- [ ] Unauthenticated users redirect to `/sign-in`
- [ ] Server functions check session and return user-scoped data
- [ ] Sign out works

### Landing Page
- [ ] Landing page renders at `/` when not authenticated
- [ ] Hero section with headline and CTA
- [ ] Feature cards are clickable
- [ ] Science section references blog articles
- [ ] Authenticated users redirect to `/dashboard`

### Blog
- [ ] Blog index at `/blog` shows all posts
- [ ] Individual posts render Markdown with Astryx Markdown component
- [ ] Frontmatter parsing (title, date, tags, description)
- [ ] Tag filtering works
- [ ] At least 3 initial articles published

### General
- [ ] All Astryx components (no custom CSS)
- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Build succeeds
