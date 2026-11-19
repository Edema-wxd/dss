import { requireModule } from "@/lib/desk/auth";
import { getFinSettings, getInvoice } from "@/lib/hq/finance";
import { invoiceFileName, invoicePdf } from "@/lib/hq/invoice-pdf";
import { lagosToday } from "@/lib/hq/work";

// The invoice as a PDF, made on the server. Same access as the Invoices page.

export async function GET(_req: Request, ctx: RouteContext<"/admin/invoices/[id]/pdf">) {
  await requireModule("invoices");
  const { id } = await ctx.params;
  const inv = await getInvoice(id);
  if (!inv) return new Response("That invoice isn't here any more.", { status: 404 });
  const pdf = await invoicePdf(inv, await getFinSettings(), lagosToday());
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoiceFileName(inv)}"`,
      "cache-control": "private, no-store",
    },
  });
}
