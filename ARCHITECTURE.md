# ARCHITECTURE

One Next.js app (Vercel-compatible), modular monolith.

```
src/
  app/                 routes: (public) pages, auth/confirm + auth/callback, (app) authenticated pages + server actions, api/health, api/webhooks/paddle
  proxy.ts             refreshes the Supabase session cookie on navigation (never blocks)
  components/          shared UI (ui.tsx design primitives, site chrome, pricing, project nav)
  core/                SHARED — reused by every module
    config.ts          typed env access
    db/                Db interface, PostgresDb (pg; Supabase-compatible), row types. Tests use an in-memory Db (tests/support)
    auth/              Supabase Auth via @supabase/ssr: session.ts (getCurrentUser/requireUser), messages.ts (safe errors), supabase.ts
    storage/           Storage interface: S3 protocol (private bucket, Supabase S3 endpoint) or local dir (dev only), filename sanitising
    ai/                AiProvider interface, Anthropic provider, completeStructured (zod + bounded retries)
    documents/         file validation, text extraction, section detection, reviewer-comment parser
    billing/           plans, entitlements/usage, dev + Paddle providers, webhook verification
    email/ analytics/ ratelimit.ts errors.ts
  modules/
    paperfix/          MODULE 1: schemas, prompt, context, guardrails, mock-ai, service, export, demo
    (grantpilot/)      MODULE 2 placeholder, not built
supabase/migrations/   Postgres schema + RLS
tests/                 vitest, credential-free
```

## Key flows
- **Analysis:** per comment → `selectContext` (relevant sections only, capped) → hash(prompt version, model, comment, excerpt, guidelines, author input) → cache hit reuses row, else `completeStructured` → `enforceIntegrity` → upsert analysis, revision item, status → usage event.
- **Auth:** sign up → Supabase emails a `token_hash` link → `/auth/confirm` page (button press consumes the token, so mail scanners cannot) → session cookie. A DB trigger on `auth.users` creates the profile + free subscription.
- **Failure handling:** `ServiceUnavailableError` (db/auth/storage/ai) → friendly message in actions, `app/error.tsx` for pages, `/api/health` for ops. Public pages survive an auth outage.
- **Authorization:** services call `getOwnedProject` (non-owner ⇒ not found). DB adapter uses service role; RLS in SQL is defence in depth.
- **Providers:** selected by env; each has a no-credential default. Adding a provider means implementing one small interface.
- **Mutations:** server actions; errors become safe flash messages; `go()` revalidates then redirects.

## Reuse by GrantPilot
Already shared: auth, users/profiles (with `research_interests`, `locale`), subscriptions/entitlements, usage events, AI provider + structured output, document extraction, storage, email, analytics, design system. GrantPilot adds its own tables/module and plan limits.

## i18n
UI is English-first; `profiles.locale` exists. Strings are inline; extract to a dictionary when localisation starts.
