# SPEC — PaperFix AI MVP

## Goal
Turn reviewer comments into a revision plan and a Response to Reviewers without ever fabricating study facts.

## Implementation plan (executed)
1. Scaffold one Next.js 16 / TypeScript / Tailwind 4 app; providers selected by env.
2. Shared core: config, db abstraction (local JSON + Supabase adapter), local auth (scrypt + signed cookie), storage, errors, rate limit, analytics, email, billing (plans, entitlements, dev + Paddle providers, webhook verification).
3. Document processing: magic-byte validation, DOCX/PDF/TXT extraction, heuristic section detection with confidence, reviewer-comment parser.
4. AI layer: provider interface, Anthropic provider, offline mock provider, zod-validated structured output with bounded retries.
5. PaperFix: context selection, prompt, integrity guardrails, analysis pipeline with cache + usage events, decisions, response assembly, DOCX/JSON export, demo project.
6. UI: public pages, dashboard, new project, overview, analysis, workspace, response, export, account/billing.
7. Tests, e2e browser run, docs.

## Functional scope
Public: landing, pricing, sign in/up, privacy, terms (placeholder). Authenticated: dashboard, new project (upload/paste manuscript, comments, guidelines), overview (comments, detected structure), analysis, revision workspace (accept/edit/reject/resolve, filters, author input), response to reviewers (editable), export (report DOCX, response DOCX, JSON), account/billing, delete project.

## Plans
Free (1 project, 5 comments), Single revision (+1 project, 40 comments), Researcher Pro (10 projects), Lab (60 projects); each with a monthly token budget (`core/billing/plans.ts`).

## Integrity rules
Model output is validated by schema; evidence quotes must be verbatim in the manuscript or are dropped; missing info forces `author_input_required` and `[AUTHOR INPUT REQUIRED: …]` placeholders in revision and response; author-provided input is used as written.

## Non-goals
GrantPilot, mobile apps, admin panel, collaboration, citation tools, plagiarism detection, editing the original manuscript file.
