import { requireUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { buildReport, isRepType, repCan } from "@/lib/hq/report-model";
import { reportFileName, reportPdf } from "@/lib/hq/report-pdf";
import { getReport, loadReportData } from "@/lib/hq/reports";

// A report's slides as a PDF. The filed snapshot when there is one; otherwise built from today's
// data (for people who can see an area but have no archive). Id is "<type>_<YYYY-MM>".

export async function GET(_req: Request, ctx: RouteContext<"/admin/reports/[id]/pdf">) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const [type, m] = id.split("_");
  if (!isRepType(type) || !/^\d{4}-\d{2}$/.test(m ?? "") || !repCan(user.roles, type)) return new Response("You don't have access to that report.", { status: 403 });
  const filed = await getReport(id);
  const rep = filed ?? buildReport(type, m, await loadReportData(canUse(user.roles, "finance")));
  return new Response(new Uint8Array(await reportPdf(rep)), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${reportFileName(rep)}"`, "cache-control": "private, no-store" },
  });
}
