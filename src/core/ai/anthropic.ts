import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { AiProvider } from "./provider";

export function anthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  const model = config.ai.model;
  return {
    name: "anthropic",
    model,
    async complete(req) {
      const res = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    },
  };
}
