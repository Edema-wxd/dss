import "server-only";
import { db } from "../desk/db";
import { getGeneral, listKpis, listPeople, listTasks } from "./data";
import { loadBooks } from "./finance";
import { addMonth, finance } from "./finance-model";
import { listAccounts, listAds, listMonthStats, listPosts, listWeb } from "./marketing";
import { PLATFORMS } from "./marketing-model";
import { REP_TYPES, type RepType, type Report, type ReportData, buildReport } from "./report-model";
import { label } from "./sales-model";
import { listClientsFull, listContactsFull } from "./sales";
import { listTalents } from "./talent";
import { lagosToday } from "./work";

// The report archive (hq_reports). One report per type and month, kept as it was when filed.
// Callers check access first (repCan).

const day = (col: string) => `coalesce(to_char(${col} at time zone 'Africa/Lagos', 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;

/** Everything a report reads. `withMoney` adds Finance; without it money lines are left out. */
export async function loadReportData(withMoney: boolean, today = lagosToday()): Promise<ReportData> {
  const q = await db();
  const [general, books, people, tasks, contacts, clients, talents, kpis, kpiLogs, touches, deals, accounts, stats, posts, ads, web] = await Promise.all([
    getGeneral(),
    loadBooks({ ledger: withMoney }, today),
    listPeople(),
    listTasks({ doneSince: addMonth(today.slice(0, 7), -14) + "-01" }),
    listContactsFull(),
    listClientsFull(),
    listTalents(),
    listKpis(),
    q.query(`select kpi_id as "kpiId", period_key as "periodKey", value from hq_kpi_logs`),
    q.query(`select actor_id::int as "userId", ref_id as "refId", substr(action, 10) as type, ${day("at")} as day from desk_audit where ref_type = 'contact' and action like 'activity.%'`),
    q.query(`select talent_id as "talentId", brand, stage, fee, currency, commission_pct as "commissionPct", ${day("updated_at")} as "updatedAt" from hq_deals`),
    listAccounts(),
    listMonthStats(),
    listPosts(),
    listAds(),
    listWeb(),
  ]);
  const f = withMoney ? finance(books) : null;
  const fx = general.fx ?? {};
  const toNGN = (a: number, cur?: string | null) => {
    if (!cur || cur === "NGN") return Number(a) || 0;
    const r = Number(fx[cur as keyof typeof fx]);
    return r ? (Number(a) || 0) * r : null;
  };
  return {
    today,
    monthlyGoal: Number(general.monthlyGoal) || 20000000,
    f,
    toNGN,
    people: people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
    tasks: tasks.map((t) => ({ assigneeId: t.assigneeId, status: t.status, doneDay: t.doneDay, due: t.due, clientId: t.clientId })),
    contacts: contacts.map((c) => ({ id: c.id, kind: c.kind, name: c.name, company: c.company, stage: c.stage, createdAt: c.createdAt, wonAt: c.wonAt, source: c.source, value: c.value, currency: c.currency, nextDate: c.nextDate, ownerId: c.ownerId })),
    touches: touches.map((t) => ({ userId: t.userId, refId: t.refId, type: t.type, day: t.day })),
    clients: clients.map((c) => ({ id: c.id, name: c.name, service: c.service, status: c.status, health: c.health, endDate: c.endDate, fee: c.fee, currency: c.currency, billing: c.billing })),
    deals: deals.map((x) => ({ ...x, fee: x.fee === null ? null : Number(x.fee), commissionPct: x.commissionPct === null ? null : Number(x.commissionPct) })) as ReportData["deals"],
    talents: talents.map((t) => ({ id: t.id, name: t.name })),
    kpis,
    kpiLogs: kpiLogs.map((l) => ({ kpiId: l.kpiId, periodKey: l.periodKey, value: Number(l.value) })),
    mkt: {
      accounts,
      stats,
      posts,
      ads,
      web,
      platformName: (k: string) => label(PLATFORMS, k, k),
    },
  };
}

export type ReportRow = { id: string; type: RepType; month: string; title: string; slideCount: number; auto: boolean; byName: string; createdAt: string };

export async function listReports(types: readonly string[]): Promise<ReportRow[]> {
  if (!types.length) return [];
  const rows = await (await db()).query(
    `select r.id, r.area as type, r.month, r.title, jsonb_array_length(r.slides)::int as "slideCount", r.auto, coalesce(u.name, '') as "byName", ${iso("r.created_at")} as "createdAt"
     from hq_reports r left join desk_users u on u.id = r.by_id where r.area = any($1::text[]) order by r.month desc, r.area`,
    [types],
  );
  return rows as ReportRow[];
}

export async function getReport(id: string): Promise<(Report & { id: string }) | null> {
  const rows = await (await db()).query(`select id, area as type, month, title, slides from hq_reports where id = $1`, [id]);
  return (rows[0] as (Report & { id: string }) | undefined) ?? null;
}

/** Builds and files a report, replacing any earlier one for the same type and month. */
export async function saveReport(type: RepType, m: string, data: ReportData, by: number | null, auto = false) {
  const rep = buildReport(type, m, data);
  const id = `${type}_${m}`;
  await (await db()).query(
    `insert into hq_reports (id, area, month, title, slides, auto, by_id, created_at) values ($1, $2, $3, $4, $5::jsonb, $6, $7, now())
     on conflict (id) do update set title = excluded.title, slides = excluded.slides, auto = excluded.auto, by_id = excluded.by_id, created_at = now()`,
    [id, type, m, rep.title, JSON.stringify(rep.slides), auto, by],
  );
  return { ...rep, id };
}

/**
 * Files last month's reports that aren't in the archive yet (HQ's autoArchive). Runs from the
 * monthly job, and when someone who can file opens Reports. Returns the types considered.
 */
export async function fileLastMonth(types: readonly RepType[] = REP_TYPES.map(([k]) => k), withMoney = true, today = lagosToday()) {
  const m = addMonth(today.slice(0, 7), -1);
  const have = new Set((await (await db()).query(`select area from hq_reports where month = $1`, [m])).map((r) => String(r.area)));
  const todo = types.filter((t) => !have.has(t));
  if (!todo.length) return [];
  // money only when whoever triggers it has Finance (the monthly job does)
  const data = await loadReportData(withMoney && (todo.includes("finance") || todo.includes("overview")), today);
  for (const t of todo) if (t !== "finance" || data.f) await saveReport(t, m, data, null, true);
  return todo;
}
