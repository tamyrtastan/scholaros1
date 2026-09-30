# SECURITY

## Implemented (and how it was tested)
- **Authentication: Supabase Auth.** Email/password, mandatory email verification (also checked in-app via `email_confirmed_at`), password reset by emailed one-time link, single-use tokens, generic responses for unknown/duplicate emails. *E2E against a real GoTrue server and a real SMTP sink.*
- **Sessions:** httpOnly, SameSite=Lax (Secure in production) cookies set server-side; every request validates with the auth server (`getUser`), so revoked sessions stop working. Password reset signs out other devices. *E2E asserts cookie flags.*
- **Email links** open a confirm page and need a button press, so link-scanning mail gateways cannot consume the one-time token.
- **Authorization:** all project operations go through `getOwnedProject` (non-owner gets "not found"); SQL **RLS** policies back it up. *Unit tests, E2E (other user gets 404 on every page and download), and integration tests that run SQL as the `authenticated`/`anon` roles: no cross-tenant read/update/delete/insert, no self-granted plans, no writing usage.*
- **Files:** private bucket, `<user>/<project>/…` keys, traversal checks, magic-byte + size validation, sanitised names, deletion removes stored files first (fails closed if storage is down). *Unit + E2E.*
- **AI:** manuscripts are sent only as per-comment excerpts; output is schema-validated; fabricated quotes are dropped, invented numbers/DOIs/citations are replaced by placeholders; refusals and outages produce safe messages; bounded retries; per-plan token budgets. *Unit + E2E (hallucination injected through the real SDK path).*
- **Secrets:** env only; no service-role key is used by the app at all; `.env*` ignored; `npm audit --omit=dev` = 0 vulnerabilities at time of writing.
- **Errors/logging:** users see safe messages only; no manuscript text in logs; `/api/health` returns status words only. *E2E asserts no internal details leak during outages.*
- **Headers:** nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS. No CSP yet.
- Dev billing refuses to run in production unless `ALLOW_DEV_BILLING=true`.

## Known risks / gaps
1. **The app's DB role bypasses RLS** (Supabase `postgres` / service-level connection). A bug that skips `getOwnedProject` would expose data. Mitigation: single choke point + tests; consider a dedicated least-privilege role.
2. **Rate limiting is in-memory** (per instance). Supabase Auth applies its own limits, but app-level limits are weak on multi-instance deployments. Use a shared store.
3. **No CSP**, no CAPTCHA configured by default (enable it in Supabase), no MFA, no account deletion flow, no audit log.
4. **Confidentiality:** manuscript excerpts go to Anthropic when AI is enabled; data-retention/ZDR terms need a business decision and a DPA.
5. **Unverified against live services:** Supabase cloud (auth email delivery, S3 endpoint compatibility, pooled DB connection), Anthropic (real model behaviour, the `fallbacks` beta parameter), Paddle (checkout + webhooks). See README "Production setup" and `npm run ai:smoke`.
6. The guardrails catch fabricated quotes, figures, DOIs and citations, but cannot prove that a fluent sentence such as "participants were randomly assigned" is unsupported when the model cites no (or valid but irrelevant) evidence. Human review remains essential; the UI says so.
7. Test infrastructure swaps one upstream fork (godotenv) for upstream when building GoTrue; it is never deployed.
