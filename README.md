# ScholarOS — PaperFix AI

ScholarOS is an AI operating system for researchers. **PaperFix AI** (module 1) turns peer-review comments into an
actionable revision plan and a structured Response to Reviewers. GrantPilot AI (module 2) is planned, not built.

PaperFix maps every reviewer comment to the manuscript, flags missing information as **AUTHOR INPUT REQUIRED**,
proposes revisions you accept/edit/reject, and exports a DOCX report and response letter. It never invents research data.

## Stack
Next.js 16 · TypeScript · Tailwind 4 · **Supabase Auth** (email/password, verification, reset) · **Postgres** (Supabase) with RLS ·
private **S3-protocol storage** (Supabase Storage) · **Anthropic** API (mock provider for demo/tests) · Paddle-compatible billing.

## Local development

You need a Supabase stack. Easiest: the Supabase CLI (Docker).

```bash
npm install
npx supabase start                # uses supabase/config.toml + templates; prints URL, anon key, S3 keys
cp .env.example .env.local        # fill SUPABASE_ANON_KEY (from `supabase status`); DATABASE_URL default matches the CLI
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql -f supabase/migrations/0002_supabase_auth_and_usage.sql
npm run dev                       # http://localhost:3000  (verification emails appear in the CLI's Mailpit, port 54324)
```
`supabase/config.toml` was written from the CLI docs and has **not** been run in this repo's CI (see "What is verified").
Files go to `data/files` in dev (`STORAGE_PROVIDER=local`); AI defaults to the offline mock. Sign up, verify the email, click
**Open demo project**.

## Commands
| Command | Purpose |
|---|---|
| `npm run check` | lint + typecheck + unit tests (no services needed) |
| `npm run build` | production build |
| `npm run test:integration` | real Postgres + GoTrue + RLS tests (needs the stack below or `INTEGRATION_*` env) |
| `npm run e2e` | full Playwright suite; boots its own stack (run `npm run build` first) |
| `npm run e2e:stack` / `e2e:stop` | start/stop that stack manually |
| `npm run ai:smoke` | ONE real Anthropic call through the production path to verify your key/model |

## The test stack (`e2e/stack`)
Where Docker Hub is unavailable (e.g. this repo's CI sandbox) the suite runs a local Supabase-compatible stack:
real Postgres 16, **real Supabase Auth (GoTrue) built from upstream source**, an SMTP sink for verification/reset emails,
an S3 emulator, and a fake Anthropic HTTP server that drives the **real `@anthropic-ai/sdk`**. It needs `PG_BIN`, `GOTRUE_BIN`
and `GOTRUE_DIR` (see the header of `e2e/stack/start.ts`). It is test infrastructure, not a deployment target.

## Production setup (manual steps)
1. **Supabase project**: create one. SQL editor: run `supabase/migrations/0001_init.sql`, then `0002_supabase_auth_and_usage.sql`.
2. **Auth → Providers → Email**: enable, turn **Confirm email ON**, minimum password length 8.
   **Auth → URL configuration**: Site URL = your `APP_URL`; add `APP_URL/**` to Redirect URLs.
   **Auth → Email templates**: paste `supabase/templates/confirmation.html` (Confirm signup) and `recovery.html` (Reset password)
   — the links must use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`.
   **Auth → SMTP**: configure your own SMTP provider (the built-in sender is heavily rate-limited). Enable CAPTCHA and leaked-password protection.
3. **Storage**: create a **private** bucket `manuscripts`; Storage → S3 Connection → create an access key. Endpoint/region as shown there.
4. **Database**: Project Settings → Database → connection string (pooled, port 6543, is fine on Vercel).
5. **Anthropic**: create an API key; run `ANTHROPIC_API_KEY=… npm run ai:smoke` locally first.
6. **Vercel env vars** (see `.env.example`): `APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `STORAGE_PROVIDER=s3`, `S3_*`,
   `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `BILLING_PROVIDER` (+ Paddle vars later). **Never** set `ALLOW_DEV_BILLING`.
7. Deploy. Check `GET /api/health` returns `{"status":"ok",…}`.
8. Replace the in-memory rate limiter (`src/core/ratelimit.ts`) with a shared store before scaling past one instance.

## What is verified
See the final report in the PR/commit message and `SECURITY.md`. In short: unit tests, real-Postgres/GoTrue integration tests,
and a Playwright suite (auth, PaperFix workflow, isolation, AI/storage/auth/DB outages) pass against the local stack; the live
Supabase cloud, live Anthropic API and live Paddle have **not** been exercised.

## Docs
[SPEC](SPEC.md) · [ARCHITECTURE](ARCHITECTURE.md) · [SECURITY](SECURITY.md) · [AI_USAGE](AI_USAGE.md) · [ROADMAP](ROADMAP.md) · [CLAUDE.md](CLAUDE.md)
