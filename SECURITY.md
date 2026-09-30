# SECURITY

## Implemented
- Authentication required for all project pages/actions/downloads; signed, expiring, httpOnly, sameSite session cookie; scrypt password hashing; identical error for unknown email vs wrong password.
- Per-user authorization via `getOwnedProject` on every project operation; other users get "not found". Covered by tests. SQL RLS policies as defence in depth.
- File validation: extension + magic bytes + 10 MB cap; sanitised filenames; storage paths `<user>/<project>/…` with traversal checks; private bucket.
- Secrets only via env; `.env*` git-ignored; `SESSION_SECRET` required in production; Paddle webhooks verified by HMAC with replay tolerance.
- No manuscript content in logs; errors mapped to safe user messages; analytics carry no content.
- Rate limiting on auth, creation, analysis, export (in-memory).
- Prompt-injection hygiene: manuscript/comments are delimited as data and the system prompt states so; outputs are schema-validated and quotes verified.
- "Delete project and its files" removes rows and stored files (usage counters are kept, detached).
- Dev billing refuses to run in production unless `ALLOW_DEV_BILLING=true` (local testing only).

## Known gaps
- No CSRF tokens beyond Next.js server-action protections; no CSP headers yet; no email verification or password reset; in-memory rate limiter is per-instance; local auth is not for production; Supabase/Paddle/Anthropic paths unverified live; manuscripts are sent to Anthropic when AI is enabled (disclosed in Privacy).
