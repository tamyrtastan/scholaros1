import http from "node:http";
import type { AddressInfo } from "node:net";
import { mockAnalyze } from "@/modules/paperfix/mock-ai";

export type FakeMode =
  | "ok"
  | "500"          // upstream outage
  | "429"          // rate limited
  | "401"          // bad key
  | "bad-json"     // model returns prose, not JSON
  | "bad-json-once"
  | "refusal"      // stop_reason: refusal
  | "hallucinate"; // model claims a quote that is not in the manuscript and invents an answer

const tag = (s: string, name: string) => s.match(new RegExp(`<${name}>\\n?([\\s\\S]*?)\\n?</${name}>`))?.[1]?.trim() ?? "";

/** Minimal stand-in for POST /v1/messages that drives the REAL Anthropic SDK code path. */
export function startFakeAnthropic(port = 0) {
  const state = { mode: "ok" as FakeMode, requests: [] as Record<string, unknown>[], paths: [] as string[], headers: [] as http.IncomingHttpHeaders[], badOnce: true };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = req.url ?? "";
      if (req.method === "POST" && url.startsWith("/__mode/")) {
        state.mode = url.split("/").pop() as FakeMode;
        state.badOnce = true;
        res.end("ok");
        return;
      }
      if (req.method === "GET" && url === "/__count") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ count: state.requests.length }));
        return;
      }
      if (req.method === "POST" && url.startsWith("/__reset")) {
        state.requests.length = 0; state.paths.length = 0; state.headers.length = 0; state.mode = "ok";
        res.end("ok");
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      state.requests.push(body);
      state.paths.push(url);
      state.headers.push(req.headers);
      const send = (status: number, json: unknown) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(json));
      };
      const message = (text: string, stop_reason = "end_turn") => send(200, {
        id: "msg_fake", type: "message", role: "assistant", model: body.model, stop_reason, stop_sequence: null,
        content: [{ type: "text", text }], usage: { input_tokens: 1200, output_tokens: 300 },
      });
      const prompt: string = body.messages?.[0]?.content ?? "";
      const analysis = mockAnalyze({ commentId: tag(prompt, "comment_id"), comment: tag(prompt, "reviewer_comment"), excerpt: tag(prompt, "manuscript_excerpt"), authorInput: tag(prompt, "author_input") });
      switch (state.mode) {
        case "500": return send(500, { type: "error", error: { type: "api_error", message: "upstream failure" } });
        case "429": return send(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } });
        case "401": return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key sk-secret" } });
        case "bad-json": return message("I am sorry, I cannot produce JSON today.");
        case "bad-json-once":
          if (state.badOnce) { state.badOnce = false; return message("not json"); }
          return message(JSON.stringify(analysis));
        case "refusal": return message("", "refusal");
        case "hallucinate":
          return message(JSON.stringify({
            ...analysis,
            evidence_from_manuscript: ["Participants were randomly assigned using a computer-generated sequence (ethics approval no. 4471)."],
            missing_information: [],
            author_input_required: false,
            suggested_revision: "We randomly assigned participants with a computer-generated sequence (approval 4471).",
            suggested_response_to_reviewer: "We added the randomisation procedure.",
            confidence: 0.99,
          }));
        default: return message(JSON.stringify(analysis));
      }
    });
  });
  return new Promise<{ url: string; state: typeof state; close: () => Promise<void> }>((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, state, close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); }) }),
    ),
  );
}
