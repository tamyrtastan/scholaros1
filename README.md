# ScholarOS — PaperFix AI

ScholarOS is an AI operating system for researchers. **PaperFix AI** (module 1) turns peer-review comments into an
actionable revision plan and a structured Response to Reviewers. GrantPilot AI (module 2) is planned, not built.

PaperFix maps every reviewer comment to the manuscript, flags missing information as **AUTHOR INPUT REQUIRED**,
proposes revisions you accept/edit/reject, and exports a DOCX report and response letter. It never invents research data.

## Quick start (no paid credentials needed)

```bash
npm install
cp .env.example .env.local     # optional; defaults work
npm run dev                    # http://localhost:3000
```

1. Sign up, then click **Open demo project** on the dashboard.
2. Open the Revision workspace: the sampling comment shows AUTHOR INPUT REQUIRED (the sample manuscript omits the allocation procedure).
3. Enter the missing detail, accept/edit/reject revisions, then go to Response to Reviewers and Export.

Defaults: local JSON database (`data/`), local file storage, offline mock AI, dev billing, console email/analytics.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | dev server |
| `npm run check` | lint + typecheck + tests |
| `npm test` | vitest (no network/credentials needed) |
| `npm run build && npm start` | production build (set `ALLOW_DEV_BILLING=true` to use dev billing locally) |

## Configuration
See `.env.example`. Providers are selected by `DB_PROVIDER`, `STORAGE_PROVIDER`, `AI_PROVIDER`, `BILLING_PROVIDER`.
Real AI: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`. Supabase schema: `supabase/migrations/0001_init.sql`.

## Docs
[SPEC](SPEC.md) · [ARCHITECTURE](ARCHITECTURE.md) · [SECURITY](SECURITY.md) · [AI_USAGE](AI_USAGE.md) · [ROADMAP](ROADMAP.md) · [CLAUDE.md](CLAUDE.md)

## Deploying (Vercel + Supabase)
1. Create a Supabase project; run `supabase/migrations/0001_init.sql`; create a **private** storage bucket `manuscripts`.
2. Implement the Supabase Auth adapter (see ROADMAP "Next task": the local cookie auth is for dev and must be replaced) and verify `SupabaseDb`/storage against the live project.
3. Set env vars in Vercel: `SESSION_SECRET`, `SUPABASE_*`, `DB_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`, `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `BILLING_PROVIDER=paddle` + Paddle vars. Never set `ALLOW_DEV_BILLING`.
4. Point a Paddle webhook at `/api/webhooks/paddle`.
5. Replace `src/core/ratelimit.ts` internals with a shared store (Upstash) for multi-instance deployments.
