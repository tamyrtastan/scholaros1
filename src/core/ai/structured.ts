import type { z } from "zod";
import type { AiProvider, AiRequest } from "./provider";

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface StructuredResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

/**
 * Calls the model and validates the output against a zod schema.
 * On invalid output, retries (bounded) with the validation error appended. Never loops unbounded.
 */
export async function completeStructured<S extends z.ZodType>(
  provider: AiProvider,
  schema: S,
  req: AiRequest,
  maxRetries: number,
): Promise<StructuredResult<z.output<S>>> {
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const user = lastError
      ? `${req.user}\n\nYour previous reply was invalid (${lastError}). Reply again with ONLY a valid JSON object.`
      : req.user;
    const res = await provider.complete({ ...req, user });
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    try {
      const parsed = schema.safeParse(extractJson(res.text));
      if (parsed.success) return { data: parsed.data, inputTokens, outputTokens, attempts: attempt };
      lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : "invalid JSON";
    }
  }
  throw new Error("AI output failed validation after retries");
}
