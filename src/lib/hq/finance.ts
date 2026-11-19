import "server-only";
import { db } from "../desk/db";
import { getGeneral, newId } from "./data";
import { type Asset, type Booked, type BookedLine, type Books, type Budget, catGroup, type Expense, type FinClient, type FinSettings, type Income, addMonth, finance, monthKey } from "./finance-model";
import { type Invoice, type InvoiceSettings, type InvPayment, blankInvoice, invCalc, invMoney, nextInvNo, payoutFor } from "./invoice-model";
import { type FieldMap, logActivity, patchRow } from "./sales";
import { addDays, lagosToday } from "./work";

// Finance and Invoices data. Callers check access first: the ledger (expenses, income, budgets,
// assets, booked months) is for the finance module; invoices, payouts and talent bank details
// for the invoices module.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
type Actor = { id: number; name: string; email: string };

/* ── Settings (fin/settings) ─────────────────────────────────────────── */

export type FinanceSettings = FinSettings & InvoiceSettings & { updatedAt?: string };

export async function getFinSettings(): Promise<FinanceSettings> {
  const rows = await (await db()).query(`select value from hq_settings where key = 'finance'`);
  return (rows[0]?.value as FinanceSettings) ?? {};
}

const NESTED = ["company", "paystack", "targets", "tax", "statements"] as const;

/** Merges into the finance settings, one level deep for the grouped ones. */
export async function patchFinSettings(patch: FinanceSettings, by: number) {
  const cur = await getFinSettings();
  const next: Record<string, unknown> = { ...cur, ...patch };
  for (const k of NESTED) if (patch[k]) next[k] = { ...(cur[k] as object), ...(patch[k] as object) };
  await (await db()).query(
    `insert into hq_settings (key, value, updated_by) values ('finance', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [JSON.stringify(next), by],
  );
  return next as FinanceSettings;
}

/* ── Reading everything the engine needs ─────────────────────────────── */

const EXP_COLS = `id, ${day("date")} as date, amount, currency, cat, acct, description, vendor, method, client_id as "clientId",
  asset_id as "assetId", recurring, receipt, source`;
const INC_COLS = `id, ${day("date")} as date, amount, currency, type, acct, description, from_name as "from", client_id as "clientId", period, source`;
const INV_COLS = `id, no, kind, status, currency, ${day("issue_date")} as "issueDate", ${day("due_date")} as "dueDate", items, vat, vat_rate as "vatRate",
  wht, disc_type as "discType", disc_value as "discValue", disc_label as "discLabel", notes, bill_to as "billTo", client_id as "clientId", period,
  talent_id as "talentId", deal_id as "dealId", commission_pct as "commissionPct", talent_line as "talentLine", pay_bank as "payBank",
  pay_paystack as "payPaystack", bank_id as "bankId", pay_link as "payLink", payments, ${iso("sent_at")} as "sentAt", ${iso("created_at")} as "createdAt"`;

const toExpense = (r: Record<string, unknown>) => ({ ...r, amount: Number(r.amount) }) as Expense;
const toIncome = (r: Record<string, unknown>) => ({ ...r, amount: Number(r.amount) }) as Income;
const toInvoice = (r: Record<string, unknown>) =>
  ({
    ...r,
    vatRate: num(r.vatRate),
    discValue: num(r.discValue),
    commissionPct: num(r.commissionPct),
    items: (r.items as Invoice["items"]).map((it) => ({ ...it, q: Number(it.q) || 0, p: Number(it.p) || 0 })),
    payments: (r.payments as InvPayment[]).map((p) => ({ ...p, amt: Number(p.amt) || 0, wht: Number(p.wht) || 0 })),
  }) as Invoice;

export async function listInvoices(): Promise<Invoice[]> {
  return (await (await db()).query(`select ${INV_COLS} from hq_fin_invoices order by issue_date desc nulls last, no desc`)).map(toInvoice);
}

export async function getInvoice(id: string) {
  const rows = await (await db()).query(`select ${INV_COLS} from hq_fin_invoices where id = $1`, [id]);
  return rows[0] ? toInvoice(rows[0]) : null;
}

export async function listExpenses(): Promise<Expense[]> {
  return (await (await db()).query(`select ${EXP_COLS} from hq_fin_expenses order by date desc, created_at desc`)).map(toExpense);
}

export async function listIncome(): Promise<Income[]> {
  return (await (await db()).query(`select ${INC_COLS} from hq_fin_income order by date desc, created_at desc`)).map(toIncome);
}

export async function listAssets(): Promise<Asset[]> {
  const rows = await (await db()).query(`select id, name, cost, ${day("date")} as date, first_month as "firstMonth", life_months as life, notes from hq_fin_assets order by date`);
  return rows.map((r) => ({ ...r, cost: Number(r.cost), life: num(r.life) }) as Asset);
}

async function listBooked(): Promise<Booked[]> {
  const rows = await (await db()).query(`select month, locked, source, lines, seen from hq_fin_booked order by month`);
  return rows as Booked[];
}

async function listBudgets(): Promise<Budget[]> {
  const rows = await (await db()).query(`select month, revenue, cats from hq_fin_budgets order by month`);
  return rows.map((r) => ({ month: r.month, revenue: num(r.revenue), cats: r.cats ?? {} }) as Budget);
}

async function listFinClients(): Promise<FinClient[]> {
  const rows = await (await db()).query(
    `select id, name, status, health, billing, fee, currency, ${day("start_date")} as "startDate", ${day("end_date")} as "endDate",
       coalesce(extra->'offb'->>'lastDay', '') as "leavingOn", pay_mode as "payMode", pay_day as "payDay" from hq_clients order by name`,
  );
  return rows.map((r) => ({ ...r, fee: num(r.fee), status: r.status || "active", billing: r.billing || "monthly" }) as FinClient);
}

/**
 * Everything the Finance engine reads. Without the ledger (someone with invoices access but not
 * finance) only invoices count, as in HQ.
 */
export async function loadBooks(opts: { ledger: boolean }, today = lagosToday()): Promise<Books & { invoices: Invoice[] }> {
  const [general, settings, invoices, clients] = await Promise.all([getGeneral(), getFinSettings(), listInvoices(), listFinClients()]);
  const [expenses, income, booked, assets, budgets] = opts.ledger
    ? await Promise.all([listExpenses(), listIncome(), listBooked(), listAssets(), listBudgets()])
    : [[], [], [], [], []];
  return { today, fx: general.fx ?? {}, settings, expenses, income, invoices, booked, assets, budgets, clients };
}

/* ── Booked months ───────────────────────────────────────────────────── */

const lineSig = (lines: readonly BookedLine[], seen: readonly string[]) => JSON.stringify([lines.map((l) => [l.clientId, l.fee, l.currency, !!l.skip]), seen]);

/**
 * Keeps the current month's retainers on file so they stay counted once the month is over, and
 * adds clients that started in earlier months to those months (unless closed from the books).
 * HQ did this on every load; here it runs when Finance opens and nightly. Returns the months changed.
 */
export async function syncBooked(today = lagosToday()) {
  const q = await db();
  const books = await loadBooks({ ledger: true }, today);
  const f = finance(books);
  const m = monthKey(today);
  const byMonth = new Map(books.booked.map((b) => [b.month, b]));
  const changed: string[] = [];
  const write = async (month: string, lines: BookedLine[], seen: string[]) => {
    await q.query(
      `insert into hq_fin_booked (month, lines, seen, updated_at) values ($1, $2::jsonb, $3, now())
       on conflict (month) do update set lines = excluded.lines, seen = excluded.seen, updated_at = now() where not hq_fin_booked.locked`,
      [month, JSON.stringify(lines), seen],
    );
    changed.push(month);
  };

  const cur = byMonth.get(m);
  if (!cur?.locked) {
    const lines = f.bookedFor(m);
    const seen = books.clients.map((c) => c.id).sort();
    if (lineSig(lines, seen) !== lineSig(cur?.lines ?? [], cur?.seen ?? [])) await write(m, lines, seen);
  }

  const adds = new Map<string, BookedLine[]>();
  for (const c of books.clients) {
    if (!(Number(c.fee) > 0) || !c.startDate) continue;
    const startM = c.startDate.slice(0, 7);
    const floor = addMonth(m, -24);
    for (let mm = startM > floor ? startM : floor; mm < m; mm = addMonth(mm, 1)) {
      const d = byMonth.get(mm);
      if (d?.locked) continue;
      if (d?.lines.some((l) => l.clientId === c.id) || d?.seen.includes(c.id)) continue;
      if (!f.retainerQualifies(c, mm)) continue;
      const list = adds.get(mm) ?? [];
      list.push({ clientId: c.id, name: c.name, fee: Number(c.fee), currency: c.currency || "NGN", backfilled: true });
      adds.set(mm, list);
    }
  }
  for (const [mm, list] of adds) {
    const d = byMonth.get(mm);
    const seen = [...new Set([...(d?.seen ?? []), ...list.map((l) => l.clientId)])].sort();
    await write(mm, [...(d?.lines ?? []), ...list], seen);
  }
  return changed;
}

/** Counts a client's retainer for a month, or stops counting it. Closed months can't change. */
export async function setRetainerSkip(month: string, clientId: string, skip: boolean) {
  const q = await db();
  const rows = await q.query(`select locked, lines, seen from hq_fin_booked where month = $1`, [month]);
  if (rows[0]?.locked) throw new Error("That month is closed from your books, so its retainers can't change.");
  const books = await loadBooks({ ledger: true });
  const lines: BookedLine[] = rows[0] ? (rows[0].lines as BookedLine[]) : finance(books).bookedFor(month);
  let found = false;
  const next = lines.map((l) => {
    if (l.clientId !== clientId) return l;
    found = true;
    const rest = { ...l };
    delete rest.skip;
    return skip ? { ...rest, skip: true } : rest;
  });
  if (!found) {
    const c = books.clients.find((x) => x.id === clientId);
    if (!c) throw new Error("That client isn't here any more.");
    next.push({ clientId, name: c.name, fee: Number(c.fee) || 0, currency: c.currency || "NGN", ...(skip ? { skip: true } : {}) });
  }
  const seen = [...new Set([...((rows[0]?.seen as string[]) ?? []), clientId])].sort();
  await q.query(
    `insert into hq_fin_booked (month, lines, seen, updated_at) values ($1, $2::jsonb, $3, now())
     on conflict (month) do update set lines = excluded.lines, seen = excluded.seen, updated_at = now()`,
    [month, JSON.stringify(next), seen],
  );
}

/* ── Expenses and income ─────────────────────────────────────────────── */

const EXP_FIELDS: FieldMap = {
  date: ["date", "date"],
  amount: ["amount", "numeric"],
  currency: ["currency", "text"],
  cat: ["cat", "text"],
  acct: ["acct", "text"],
  description: ["description", "text"],
  vendor: ["vendor", "text"],
  method: ["method", "text"],
  clientId: ["client_id", "text"],
  receipt: ["receipt", "text"],
  recurring: ["recurring", "boolean"],
};

/**
 * Saves an expense. A capital purchase also goes on the asset register (or updates its entry),
 * since capital only reaches profit through depreciation. Returns whether an asset was added.
 */
export async function saveExpense(id: string | null, e: Partial<Expense> & { life?: number | null }, by: number) {
  const q = await db();
  const eid = id ?? newId();
  if (!id) {
    await q.query(`insert into hq_fin_expenses (id, date, amount, cat, created_by) values ($1, $2::date, $3, $4, $5)`, [eid, e.date, e.amount, e.cat ?? "ops", by]);
  }
  await patchRow("hq_fin_expenses", eid, e, EXP_FIELDS);
  let addedAsset = false;
  const saved = (await q.query(`select ${EXP_COLS} from hq_fin_expenses where id = $1`, [eid])).map(toExpense)[0];
  if (saved && catGroup(saved.cat) === "capex") {
    const general = await getGeneral();
    const rate = saved.currency === "NGN" ? 1 : Number(general.fx?.[saved.currency as "USD"]) || 0;
    const cost = rate ? saved.amount * rate : saved.amount;
    const existing = saved.assetId ? await q.query(`select id, life_months from hq_fin_assets where id = $1`, [saved.assetId]) : [];
    const life = Number(e.life) || Number(existing[0]?.life_months) || 36;
    if (existing[0]) {
      await q.query(`update hq_fin_assets set name = $2, date = $3::date, cost = $4, life_months = $5, first_month = $6 where id = $1`, [
        existing[0].id,
        saved.description,
        saved.date,
        cost,
        life,
        saved.date.slice(0, 7),
      ]);
    } else {
      const aid = newId();
      await q.query(
        `insert into hq_fin_assets (id, name, cost, date, first_month, life_months, exp_ids) values ($1, $2, $3, $4::date, $5, $6, $7)`,
        [aid, saved.description, cost, saved.date, saved.date.slice(0, 7), life, [eid]],
      );
      await q.query(`update hq_fin_expenses set asset_id = $2 where id = $1`, [eid, aid]);
      addedAsset = true;
    }
  }
  return { id: eid, addedAsset };
}

export async function deleteExpense(id: string) {
  await (await db()).query(`delete from hq_fin_expenses where id = $1`, [id]);
}

/** Copies each regular monthly cost from earlier months into `month`, on the same day (28th at most). */
export async function copyRecurring(month: string, by: number) {
  const q = await db();
  const all = (await q.query(`select ${EXP_COLS} from hq_fin_expenses where recurring and date < $1::date order by date`, [`${month}-01`])).map(toExpense);
  const here = (await q.query(`select ${EXP_COLS} from hq_fin_expenses where to_char(date, 'YYYY-MM') = $1`, [month])).map(toExpense);
  const latest = new Map<string, Expense>();
  for (const e of all) latest.set(`${e.description.trim().toLowerCase()}|${e.cat}`, e);
  let n = 0;
  for (const [k, e] of latest) {
    if (here.some((h) => `${h.description.trim().toLowerCase()}|${h.cat}` === k)) continue;
    const d = `${month}-${String(Math.min(28, Number(e.date.slice(8)))).padStart(2, "0")}`;
    await q.query(
      `insert into hq_fin_expenses (id, date, amount, currency, cat, acct, description, vendor, method, client_id, recurring, created_by)
       values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)`,
      [newId(), d, e.amount, e.currency, e.cat, e.acct, e.description, e.vendor, e.method, e.clientId, by],
    );
    n++;
  }
  return n;
}

const INC_FIELDS: FieldMap = {
  date: ["date", "date"],
  amount: ["amount", "numeric"],
  currency: ["currency", "text"],
  type: ["type", "text"],
  acct: ["acct", "text"],
  description: ["description", "text"],
  from: ["from_name", "text"],
  clientId: ["client_id", "text"],
  period: ["period", "text"],
};

export async function saveIncome(id: string | null, x: Partial<Income>, by: number) {
  const iid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_fin_income (id, date, amount, type, created_by) values ($1, $2::date, $3, $4, $5)`, [iid, x.date, x.amount, x.type ?? "services", by]);
  await patchRow("hq_fin_income", iid, x, INC_FIELDS);
  return iid;
}

export async function deleteIncome(id: string) {
  await (await db()).query(`delete from hq_fin_income where id = $1`, [id]);
}

/* ── Budgets and assets ──────────────────────────────────────────────── */

/** Replaces a month's budget, as HQ did. Empty categories are left out. */
export async function saveBudget(month: string, cats: Record<string, number>, revenue: number | null, by: number) {
  await (await db()).query(
    `insert into hq_fin_budgets (month, revenue, cats, by_id, updated_at) values ($1, $2, $3::jsonb, $4, now())
     on conflict (month) do update set revenue = excluded.revenue, cats = excluded.cats, by_id = excluded.by_id, updated_at = now()`,
    [month, revenue, JSON.stringify(cats), by],
  );
}

export async function saveAsset(id: string | null, a: Partial<Asset>) {
  const q = await db();
  const aid = id ?? newId();
  const first = a.firstMonth || (a.date ? a.date.slice(0, 7) : "");
  if (!id) await q.query(`insert into hq_fin_assets (id, name, cost) values ($1, $2, $3)`, [aid, a.name ?? "", a.cost ?? 0]);
  await q.query(
    `update hq_fin_assets set name = coalesce($2, name), cost = coalesce($3, cost), date = coalesce($4::date, date),
       first_month = coalesce(nullif($5, ''), first_month), life_months = coalesce($6, life_months), notes = coalesce($7, notes) where id = $1`,
    [aid, a.name ?? null, a.cost ?? null, a.date || null, first, a.life ?? null, a.notes ?? null],
  );
  return aid;
}

export async function deleteAsset(id: string) {
  const q = await db();
  await q.query(`update hq_fin_expenses set asset_id = null where asset_id = $1`, [id]);
  await q.query(`delete from hq_fin_assets where id = $1`, [id]);
}

/* ── Invoices ────────────────────────────────────────────────────────── */

export async function usedInvoiceNumbers() {
  return (await (await db()).query(`select no from hq_fin_invoices`)).map((r) => String(r.no));
}

export async function suggestInvoiceNo(kind: string, today = lagosToday()) {
  return nextInvNo(kind, today.slice(0, 4), await usedInvoiceNumbers());
}

const INV_FIELDS: FieldMap = {
  no: ["no", "text"],
  kind: ["kind", "text"],
  status: ["status", "text"],
  currency: ["currency", "text"],
  issueDate: ["issue_date", "date"],
  dueDate: ["due_date", "date"],
  items: ["items", "jsonb"],
  vat: ["vat", "boolean"],
  vatRate: ["vat_rate", "numeric"],
  wht: ["wht", "boolean"],
  discType: ["disc_type", "text"],
  discValue: ["disc_value", "numeric"],
  discLabel: ["disc_label", "text"],
  notes: ["notes", "text"],
  billTo: ["bill_to", "jsonb"],
  clientId: ["client_id", "text"],
  period: ["period", "text"],
  talentId: ["talent_id", "text"],
  dealId: ["deal_id", "text"],
  commissionPct: ["commission_pct", "numeric"],
  talentLine: ["talent_line", "text"],
  payBank: ["pay_bank", "boolean"],
  payPaystack: ["pay_paystack", "boolean"],
  bankId: ["bank_id", "text"],
  payLink: ["pay_link", "text"],
  payments: ["payments", "jsonb"],
};

export type InvoiceDraft = Omit<Invoice, "id" | "createdAt" | "sentAt">;

/** Tidies an invoice from the editor: drops empty lines and makes numbers numbers. */
export function cleanInvoice(i: InvoiceDraft): InvoiceDraft {
  const items = i.items
    .filter((it) => (it.d ?? "").trim() || Number(it.p))
    .map((it) => {
      const off = Math.min(100, Math.max(0, Number(it.off) || 0));
      return { d: (it.d ?? "").trim(), q: Number(it.q) || 0, p: Number(it.p) || 0, ...(off > 0 ? { off } : {}) };
    });
  return { ...i, no: i.no.trim(), items, billTo: Object.fromEntries(Object.entries(i.billTo ?? {}).map(([k, v]) => [k, String(v ?? "").trim()])) };
}

/** Why an invoice can't be saved, or null. */
export async function invoiceProblem(id: string | null, i: InvoiceDraft) {
  if (!i.billTo.name?.trim()) return "Add who the invoice is for.";
  if (!i.items.some((it) => Number(it.p) > 0)) return "Add at least one line with a price.";
  if (!i.no.trim()) return "Give the invoice a number.";
  const dup = await (await db()).query(`select 1 from hq_fin_invoices where no = $1 and id <> $2`, [i.no.trim(), id ?? ""]);
  if (dup.length) return "That invoice number is already used.";
  return null;
}

export async function saveInvoice(id: string | null, draft: InvoiceDraft, actor: Actor, opts: { send?: boolean } = {}) {
  const i = cleanInvoice(draft);
  const problem = await invoiceProblem(id, i);
  if (problem) throw new Error(problem);
  const q = await db();
  const iid = id ?? newId();
  if (!id) await q.query(`insert into hq_fin_invoices (id, no, created_by) values ($1, $2, $3)`, [iid, i.no, actor.id]);
  const status = opts.send && i.status === "draft" ? "sent" : i.status;
  await patchRow("hq_fin_invoices", iid, { ...i, status }, INV_FIELDS);
  if (opts.send && i.status === "draft") await q.query(`update hq_fin_invoices set sent_at = now() where id = $1`, [iid]);
  if (!id && i.clientId) await logActivity(actor, "client", i.clientId, "invoice", `Invoice ${i.no} created for ${invMoney(invCalc(i).total, i.currency)}`);
  return iid;
}

export async function setInvoiceStatus(id: string, status: "draft" | "sent" | "void") {
  await (await db()).query(`update hq_fin_invoices set status = $2, sent_at = case when $2 = 'sent' and sent_at is null then now() else sent_at end, updated_at = now() where id = $1`, [id, status]);
}

export async function deleteInvoice(id: string) {
  await (await db()).query(`delete from hq_fin_invoices where id = $1`, [id]);
}

/**
 * Records money received against an invoice. A talent invoice paid in full makes the talent's
 * payout; a deal's invoice marks the deal paid. Returns what to tell the person.
 */
export async function recordPayment(id: string, p: InvPayment, actor: Actor) {
  const q = await db();
  const inv = await getInvoice(id);
  if (!inv) throw new Error("That invoice isn't here any more.");
  if (!(Number(p.amt) > 0) && !(Number(p.wht) > 0)) throw new Error("Enter the amount received.");
  const payments = [...inv.payments, { amt: Number(p.amt) || 0, wht: Number(p.wht) || 0, date: p.date, method: p.method || "Bank transfer", note: p.note ?? "" }];
  const status = inv.status === "draft" ? "sent" : inv.status;
  await q.query(`update hq_fin_invoices set payments = $2::jsonb, status = $3, updated_at = now() where id = $1`, [id, JSON.stringify(payments), status]);
  const next = { ...inv, payments, status };
  const c = invCalc(next);
  let message = c.balance <= 0.005 ? `${inv.no} is paid in full.` : `Payment recorded. ${invMoney(c.balance, inv.currency)} left.`;

  if (inv.kind === "talent" && c.balance <= 0.005) {
    const exists = await q.query(`select 1 from hq_fin_payouts where invoice_id = $1`, [id]);
    if (!exists.length) {
      const po = payoutFor(next);
      await q.query(
        `insert into hq_fin_payouts (id, invoice_id, invoice_no, talent_id, deal_id, currency, gross, commission_pct, commission, net, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'due', $11)`,
        [newId(), id, inv.no, inv.talentId, inv.dealId, inv.currency, po.gross, po.commissionPct, po.commission, po.net, actor.id],
      );
      const t = inv.talentId ? await q.query(`select name from hq_talents where id = $1`, [inv.talentId]) : [];
      message = `Paid in full. ${t[0]?.name ?? "The talent"}'s payout is ready in Talent payouts.`;
    }
  }
  if (inv.clientId) await logActivity(actor, "client", inv.clientId, "payment", `Payment of ${invMoney(Number(p.amt) + Number(p.wht || 0), inv.currency)} received for ${inv.no}`);
  if (inv.dealId) {
    await q.query(`update hq_deals set extra = jsonb_set(extra, '{paid}', to_jsonb($2::boolean)), updated_at = now() where id = $1`, [inv.dealId, c.balance <= 0.005]);
  }
  return message;
}

export async function removePayment(id: string, index: number) {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("That invoice isn't here any more.");
  const payments = inv.payments.filter((_, n) => n !== index);
  await (await db()).query(`update hq_fin_invoices set payments = $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(payments)]);
}

/** Draft invoices for every monthly client not yet invoiced this month (auto payers excluded). */
export async function retainerCandidates(today = lagosToday()) {
  const m = monthKey(today);
  const q = await db();
  const clients = await q.query(
    `select id, name, service, fee, currency, contact_name as "contactName", email, phone from hq_clients
     where coalesce(nullif(status, ''), 'active') in ('active', 'onboarding', 'offboarding') and coalesce(nullif(billing, ''), 'monthly') = 'monthly'
       and fee > 0 and coalesce(pay_mode, 'invoice') <> 'auto'
       and not exists (select 1 from hq_fin_invoices i where i.client_id = hq_clients.id and i.status <> 'void'
         and (i.period = $1 or to_char(i.issue_date, 'YYYY-MM') = $1))
     order by name`,
    [m],
  );
  return clients.map((c) => ({ ...c, fee: Number(c.fee) })) as { id: string; name: string; service: string; fee: number; currency: string; contactName: string; email: string; phone: string }[];
}

export async function createRetainerDrafts(settings: InvoiceSettings, actor: Actor, monthLabel: string, today = lagosToday()) {
  const list = await retainerCandidates(today);
  const used = await usedInvoiceNumbers();
  const ids: string[] = [];
  for (const c of list) {
    const no = nextInvNo("client", today.slice(0, 4), used);
    used.push(no);
    const base = blankInvoice("client", today, settings, addDays);
    const draft: InvoiceDraft = {
      ...base,
      no,
      currency: c.currency || "NGN",
      clientId: c.id,
      period: monthKey(today),
      billTo: { name: c.name, contact: c.contactName, email: c.email, phone: c.phone },
      items: [{ d: `${c.service || "Retainer"}: ${monthLabel}`, q: 1, p: c.fee }],
    };
    ids.push(await saveInvoice(null, draft, actor));
  }
  return ids.length;
}

/* ── Payouts and talent bank details ─────────────────────────────────── */

export type Payout = {
  id: string;
  invoiceId: string | null;
  invoiceNo: string;
  talentId: string | null;
  dealId: string | null;
  currency: string;
  gross: number;
  commissionPct: number | null;
  commission: number;
  net: number;
  status: string;
  paidAt: string;
  ref: string;
  createdAt: string;
};

export async function listPayouts(): Promise<Payout[]> {
  const rows = await (await db()).query(
    `select id, invoice_id as "invoiceId", invoice_no as "invoiceNo", talent_id as "talentId", deal_id as "dealId", currency, gross,
       commission_pct as "commissionPct", commission, net, status, ${day("paid_at")} as "paidAt", ref, ${iso("created_at")} as "createdAt"
     from hq_fin_payouts order by (status = 'paid'), created_at desc`,
  );
  return rows.map((r) => ({ ...r, gross: Number(r.gross), commission: Number(r.commission), net: Number(r.net), commissionPct: num(r.commissionPct) }) as Payout);
}

/** Marks a payout sent. Nothing goes into Finance: commission already counts only DSS's share. */
export async function markPayoutPaid(id: string, paidAt: string, ref: string) {
  await (await db()).query(`update hq_fin_payouts set status = 'paid', paid_at = $2::date, ref = $3, updated_at = now() where id = $1`, [id, paidAt, ref]);
}

export type TalentBank = { bank: string; name: string; number: string };

export async function getTalentBank(talentId: string): Promise<TalentBank | null> {
  const rows = await (await db()).query(`select bank, name, number from hq_fin_talentbank where talent_id = $1`, [talentId]);
  return (rows[0] as TalentBank) ?? null;
}

export async function listTalentBanks(): Promise<Record<string, TalentBank>> {
  const rows = await (await db()).query(`select talent_id, bank, name, number from hq_fin_talentbank`);
  return Object.fromEntries(rows.map((r) => [r.talent_id, { bank: r.bank, name: r.name, number: r.number }]));
}

export async function saveTalentBank(talentId: string, b: Partial<TalentBank>) {
  await (await db()).query(
    `insert into hq_fin_talentbank (talent_id, bank, name, number, updated_at) values ($1, coalesce($2, ''), coalesce($3, ''), coalesce($4, ''), now())
     on conflict (talent_id) do update set bank = coalesce($2, hq_fin_talentbank.bank), name = coalesce($3, hq_fin_talentbank.name),
       number = coalesce($4, hq_fin_talentbank.number), updated_at = now()`,
    [talentId, b.bank ?? null, b.name ?? null, b.number ?? null],
  );
}
