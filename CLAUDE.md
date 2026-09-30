# CLAUDE.md — persistent rules for ScholarOS

- **ScholarOS is the parent product.** PaperFix is module 1 (`src/modules/paperfix`). GrantPilot will be module 2 (`src/modules/grantpilot`). Do not build GrantPilot unless asked.
- **Shared infrastructure lives in `src/core`** (auth, db, storage, ai, documents, billing, email, analytics, ratelimit). Modules depend on core; core never imports from modules (modules pass their own mock AI into `getAi`). Preserve this; do not duplicate core services inside a module.
- **Never fabricate research data.** No invented results, numbers, stats, ethics approvals, methods, citations, DOIs. Missing info => `AUTHOR INPUT REQUIRED`. Enforcement is deterministic in `modules/paperfix/guardrails.ts`, not just prompts. Do not weaken it; add tests with any change.
- **Authorization:** every project-scoped operation must go through `getOwnedProject`. Never expose another user's data; non-owners get "not found".
- **Prioritise low operating cost:** keep context selection, hash-based analysis caching, token budgets, bounded retries. Bump `PROMPT_VERSION` when prompts/schema change.
- **No secrets in the repo.** Env via `.env.example` only. Never log manuscript content.
- **Keep it simple:** one Next.js app, no microservices, small diffs, no speculative abstractions.
- **Test before completing a task:** `npm run check` and `npm run build` must pass. Tests must run without Anthropic/Paddle/Supabase credentials.
- **Backward compatibility:** DB changes via new numbered migrations in `supabase/migrations`, and keep `src/core/db/types.ts` in sync. Keep `Db`/provider interfaces stable.
- Next.js 16: `params`/`searchParams`/`cookies()` are async. Mutations go through server actions in `src/app/(app)/actions.ts`, which end with `go()` (revalidate + redirect).
- English-first UI; keep user-visible strings easy to extract later (i18n is planned, not built).
