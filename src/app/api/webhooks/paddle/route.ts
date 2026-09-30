import { getDb } from "@/core/db";
import { applyPaddleEvent, verifyPaddleSignature } from "@/core/billing/provider";

export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyPaddleSignature(raw, req.headers.get("paddle-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    await applyPaddleEvent(getDb(), JSON.parse(raw));
  } catch {
    return new Response("Bad event", { status: 400 });
  }
  return new Response("ok");
}
