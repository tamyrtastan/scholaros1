import { config } from "../config";
import { anthropicProvider } from "./anthropic";
import type { AiProvider } from "./provider";

/** Each product module supplies its own offline `mock` so core never depends on modules. */
export function getAi(mock: AiProvider): AiProvider {
  if (config.providers.ai === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required for AI_PROVIDER=anthropic");
    return anthropicProvider(key);
  }
  return mock;
}
export type { AiProvider };
