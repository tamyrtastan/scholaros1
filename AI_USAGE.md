# AI_USAGE — cost drivers and controls

## Cost drivers
1. Input tokens: manuscript text repeated per comment (largest driver).
2. Output tokens: structured analysis per comment (~500–900 tokens).
3. Retries on invalid output.
4. Re-analysing unchanged content.

## Controls (all implemented)
| Driver | Control |
|---|---|
| Whole manuscript per comment | `selectContext` sends only relevant sections, paragraph-trimmed to `AI_MAX_INPUT_CHARS` (default 24k chars) |
| Repeats | Analysis cache keyed by sha256(prompt version, model, comment, excerpt, guidelines, author input); unchanged ⇒ zero calls (`ai_cache_hit` event) |
| Author edits | Submitting input re-analyses only that comment |
| Runaway output | `AI_MAX_OUTPUT_TOKENS` (default 2500); strict JSON schema |
| Retries | `AI_MAX_RETRIES` (default 2), bounded, error fed back once per retry |
| Abuse/overuse | Per-plan monthly token budget (`usage_events`), per-plan comment/manuscript caps, rate limits |
| Model choice | `AI_MODEL` env; change without code edits |
| Demo | Always uses the offline mock: zero cost, recorded as `demo_analysis` with 0 tokens, never counted against the allowance |
| Thinking tokens (claude-sonnet-5-5) | Thinking is turned off (`between_tools`) and effort set (`AI_EFFORT`, default medium) so output tokens are spent on the JSON answer, not reasoning |
| Provider outages | Nothing is recorded or charged when a call fails; SDK retries are bounded by `AI_MAX_RETRIES` |
| Guidelines | truncated to 3,000 chars |

Usage is logged per call (`input_tokens`, `output_tokens`, provider, model, attempts) and summarised on the Account page.
Not yet done: provider-side prompt caching of the system prompt, batching several comments per call, cheaper model for triage.
Bump `PROMPT_VERSION` (prompt.ts) whenever prompts or output schema change so stale cache entries are not reused.

## Usage tracking
Every billable call writes a `usage_events` row with user, project, **plan at the time**, kind (`ai_analysis` / `ai_cache_hit`), tokens in/out, provider, model and attempts.
Users see the month's totals on the Account page; operators can query the `usage_by_plan_month` view. Budgets are enforced before each real call.

## Verify your key
`ANTHROPIC_API_KEY=… npm run ai:smoke` makes one real call, checks the structured output and that the demo manuscript's missing allocation procedure is flagged, not invented.
