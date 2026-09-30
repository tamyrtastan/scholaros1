import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { AppError, ServiceUnavailableError, isConnectivityError } from "../errors";
import type { AiProvider, AiRequest } from "./provider";

/** Raised when the provider's safety systems decline an excerpt (e.g. sensitive biomedical text). */
export class AiRefusalError extends AppError {
  constructor() {
    super("The AI provider declined to process this text. Try rephrasing the comment or contact support; nothing was charged to your allowance.", 422);
  }
}

/**
 * Request shape per model family:
 * - claude-sonnet-5-5: thinking is on by default and its tokens share `max_tokens`, which could truncate our JSON.
 *   Analysis is extraction/rewording, so turn it off with `between_tools` and use a moderate effort.
 * - other models: no extra parameters (keep `AI_MAX_OUTPUT_TOKENS` generous if the model thinks by default).
 */
type Env = Record<string, string | undefined>;
export function modelParams(model: string, env: Env = process.env) {
  if (model.startsWith("claude-sonnet-5-5")) {
    return {
      thinking: { type: "between_tools" as const },
      output_config: { effort: (env.AI_EFFORT as "low" | "medium" | "high" | undefined) ?? ("medium" as "low" | "medium" | "high") },
    };
  }
  return {};
}

/** Server-side refusal fallback (Claude API only). Disable with AI_REFUSAL_FALLBACK=false on other platforms. */
export function fallbackParams(model: string, env: Env = process.env) {
  if (env.AI_REFUSAL_FALLBACK === "false") return null;
  if (!model.startsWith("claude-sonnet-5-5") && !model.startsWith("claude-opus-5-5") && !model.startsWith("claude-fable-5-1")) return null;
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}

/** Maps SDK errors to user-safe ones. Retryable upstream problems become ServiceUnavailableError("ai"). */
export function translateAnthropicError(e: unknown): Error {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
    return new ServiceUnavailableError("ai", "The AI service is busy or unreachable right now. Please try again shortly. Nothing was charged to your allowance.");
  }
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) {
    return new ServiceUnavailableError("ai", "The AI service is busy or unreachable right now. Please try again shortly. Nothing was charged to your allowance.");
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    console.error("[ai] provider credentials rejected"); // operator problem, not the user's
    return new AppError("AI analysis is temporarily unavailable (configuration issue). Our team has been notified.", 503);
  }
  if (isConnectivityError(e)) return new ServiceUnavailableError("ai");
  return e instanceof Error ? e : new Error("ai error");
}

export function anthropicProvider(apiKey: string, baseURL = process.env.ANTHROPIC_BASE_URL): AiProvider {
  const client = new Anthropic({ apiKey, baseURL: baseURL || undefined, maxRetries: config.ai.maxRetries > 0 ? 2 : 0, timeout: 90_000 });
  const model = config.ai.model;
  return {
    name: "anthropic",
    model,
    async complete(req: AiRequest) {
      const body = { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: "user" as const, content: req.user }], ...modelParams(model) };
      const fb = fallbackParams(model);
      try {
        const res = fb
          ? await client.beta.messages.create({ ...body, betas: fb.betas, fallbacks: fb.fallbacks })
          : await client.messages.create(body);
        if (res.stop_reason === "refusal") throw new AiRefusalError();
        const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
        return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
      } catch (e) {
        throw translateAnthropicError(e);
      }
    },
  };
}
