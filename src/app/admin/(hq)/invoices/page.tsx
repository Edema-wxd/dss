import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { InvoicesView } from "@/components/hq/invoices";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { getFinSettings, listPayouts, listTalentBanks, loadBooks } from "@/lib/hq/finance";
import { finance } from "@/lib/hq/finance-model";
import { listClientsFull, listContactsFull } from "@/lib/hq/sales";
import { listTalents } from "@/lib/hq/talent";

export default function InvoicesPage(props: PageProps<"/admin/invoices">) {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Invoices" lead="Client invoices, talent deals and commission. Paid by bank transfer or Paystack." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading invoices…</p>}>
        <Invoices searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Invoices({ searchParams }: { searchParams: PageProps<"/admin/invoices">["searchParams"] }) {
  let props;
  try {
    const user = await requireModule("invoices");
    await connection();
    const open = (await searchParams).open;
    // Someone with invoices but not Finance (an Admin) sees invoice money only, as in HQ.
    const [books, payouts, settings, banks, clients, brands, talents] = await Promise.all([
      loadBooks({ ledger: canUse(user.roles, "finance") }),
      listPayouts(),
      getFinSettings(),
      listTalentBanks(),
      listClientsFull(),
      listContactsFull("talent"),
      listTalents(),
    ]);
    const s = finance(books).finStats();
    props = {
      invoices: books.invoices,
      payouts,
      settings,
      banks,
      today: books.today,
      openId: typeof open === "string" ? open : undefined,
      stats: {
        collected: s.cashNGN,
        outstanding: s.outNGN,
        open: s.open,
        overdue: s.overdue,
        payoutsDue: payouts.filter((p) => p.status !== "paid").length,
        missing: s.missing,
      },
      sources: {
        clients: clients.map((c) => ({ id: c.id, name: c.name, contactName: c.contactName, email: c.email, phone: c.phone, currency: c.currency, fee: c.fee, service: c.service, billing: c.billing })),
        brands: brands.map((c) => ({ id: c.id, name: c.name, company: c.company, email: c.email, phone: c.phone })),
        talents: talents.map((t) => ({ id: t.id, name: t.name, email: t.email, phone: t.phone })),
      },
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <InvoicesView {...props} />;
}
