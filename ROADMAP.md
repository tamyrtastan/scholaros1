# ROADMAP

## Next task (before real launch)
1. Follow README "Production setup" on a real Supabase project; run `npm run test:integration` against it (`INTEGRATION_*` env) and a smoke pass of the E2E auth flows with a real mailbox.
2. `npm run ai:smoke` with a real key; measure cost per comment and output-validation rate; tune `AI_EFFORT`/`AI_MODEL`.
3. Verify the `fallbacks` refusal-fallback beta parameter against the live API (disable with `AI_REFUSAL_FALLBACK=false` if rejected).
4. Paddle sandbox: checkout + webhook round trip. Shared rate limiter (Upstash), CSP, CAPTCHA, account deletion, CI workflow (lint/typecheck/unit/build), real analytics sink, OCR for scanned PDFs, legal pages.

## PaperFix next
Page/line locations from DOCX, tracked-changes export, per-section re-analysis UI, reviewer-comment file import UX, response-letter templates per journal, i18n.

## GrantPilot AI (module 2, not started)
Reuses core. Additions: `researcher_profiles` (extend `profiles`: interests, career stage, discipline, keywords), `opportunities` (source, deadline, eligibility, amount, URL), `opportunity_matches` (score, reasons), `saved_opportunities`, `applications` (status, documents), `deadlines`, `notifications` (email via core/email). Matching uses the AI provider + embeddings with the same caching/usage-budget pattern; same integrity rule (no invented eligibility or facts). New plan limits in `core/billing/plans.ts`.
