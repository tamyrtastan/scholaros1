# ARCHITECTURE

One Next.js app (Vercel-compatible), modular monolith.

```
src/
  app/                 routes: (public) pages, (app) authenticated pages + server actions, api/webhooks/paddle
  components/          shared UI (ui.tsx design primitives, site chrome, pricing, project nav)
  core/                SHARED — reused by every module
    config.ts          typed env access
    db/                Db interface, LocalDb (JSON file), SupabaseDb, row types
    auth/              scrypt passwords, signed session cookie, sign up/in, requireUser
    storage/           Storage interface (local / Supabase), filename sanitising
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
- **Authorization:** services call `getOwnedProject` (non-owner ⇒ not found). DB adapter uses service role; RLS in SQL is defence in depth.
- **Providers:** selected by env; each has a no-credential default. Adding a provider means implementing one small interface.
- **Mutations:** server actions; errors become safe flash messages; `go()` revalidates then redirects.

## Reuse by GrantPilot
Already shared: auth, users/profiles (with `research_interests`, `locale`), subscriptions/entitlements, usage events, AI provider + structured output, document extraction, storage, email, analytics, design system. GrantPilot adds its own tables/module and plan limits.

## i18n
UI is English-first; `profiles.locale` exists. Strings are inline; extract to a dictionary when localisation starts.
