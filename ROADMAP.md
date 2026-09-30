# ROADMAP

## Next task (required before real launch)
1. Supabase Auth adapter replacing local cookie auth; verify `SupabaseDb` + Supabase Storage against a live project (code exists, unexercised); run RLS tests.
2. Verify the Anthropic path with a real key (prompt quality, cost per comment, output validation rate).
3. Verify Paddle checkout + webhooks in sandbox; add Paddle.js overlay if preferred over hosted checkout.
4. Shared rate limiter (Upstash), email provider (Resend), real analytics sink, OCR for scanned PDFs, legal pages.

## PaperFix next
Page/line locations from DOCX, tracked-changes export, per-section re-analysis UI, reviewer-comment file import UX, response-letter templates per journal, i18n.

## GrantPilot AI (module 2, not started)
Reuses core. Additions: `researcher_profiles` (extend `profiles`: interests, career stage, discipline, keywords), `opportunities` (source, deadline, eligibility, amount, URL), `opportunity_matches` (score, reasons), `saved_opportunities`, `applications` (status, documents), `deadlines`, `notifications` (email via core/email). Matching uses the AI provider + embeddings with the same caching/usage-budget pattern; same integrity rule (no invented eligibility or facts). New plan limits in `core/billing/plans.ts`.
