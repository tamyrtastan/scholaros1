import { getCurrentUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { rateLimit } from "@/core/ratelimit";
import { track } from "@/core/analytics";
import { AppError } from "@/core/errors";
import { buildJsonExport, buildReportDocx, buildResponseDocx } from "@/modules/paperfix/export";
import { getProjectBundle } from "@/modules/paperfix/service";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!rateLimit(`export:${user.id}`, 20, 60_000)) return new Response("Too many requests", { status: 429 });
  const { id, kind } = await ctx.params;
  try {
    const bundle = await getProjectBundle(getDb(), user.id, id); // ownership enforced here
    let body: Buffer | string;
    let type: string;
    let name: string;
    if (kind === "report") [body, type, name] = [await buildReportDocx(bundle), DOCX, "revision-report.docx"];
    else if (kind === "response") [body, type, name] = [await buildResponseDocx(bundle), DOCX, "response-to-reviewers.docx"];
    else if (kind === "json") [body, type, name] = [JSON.stringify(buildJsonExport(bundle), null, 2), "application/json", "paperfix-export.json"];
    else return new Response("Not found", { status: 404 });
    track("response_exported", user.id, { kind });
    return new Response(new Uint8Array(typeof body === "string" ? Buffer.from(body) : body), {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    return new Response("Export failed", { status: 500 });
  }
}
