import "server-only";
import { sendHqMail } from "../mail";
import { db } from "../desk/db";
import { cleanRoles } from "./access";
import {
  type QueueItem,
  type Recipient,
  type Snapshot,
  type SumContact,
  type SumDeal,
  type SumPerson,
  type SumTalent,
  type SumTask,
  type SumTime,
  addressOf,
  getsSummary,
  getsUpdates,
  isStale,
  lastWorkingDay,
  morningEmail,
  updatesEmail,
} from "./digest-model";
import { listLeave } from "./leave";
import { patternOf } from "./leave-model";
import { weekNo } from "./plan-model";
import { siteUrl } from "./notify";
import { OPEN_STAGES } from "./talent-model";
import { addDays } from "./work";

// The notifications job (HQ scheduled task 01): sends the hq_notify queue, one email per person,
// and the morning summary once a day. The wording lives in digest-model.ts.

export type Send = (m: { kind: string; to: string; subject: string; text: string; html?: string }) => Promise<boolean>;

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;

type Row = Recipient & { roles: string[]; pattern: unknown };

async function people(): Promise<SumPerson[]> {
  const rows = (await (await db()).query(
    `select id::int, name, email, notify_email as "notifyEmail", notify_mode as "notifyMode", active, roles, pattern from desk_users order by name`,
  )) as Row[];
  return rows.map((r) => ({ ...r, roles: cleanRoles(r.roles), pattern: patternOf(r.pattern) }));
}

/* ── The queue ───────────────────────────────────────────────────────── */

export type QueueReport = { sent: number; recipients: number; items: number; skipped: number; failed: number };

/**
 * Sends everything waiting, one email per person. Items for people who can't get email now (off,
 * morning summary only, inactive, no address) and items older than STALE_HOURS are marked
 * skipped. Each batch is claimed before sending, so two runs at once never send it twice, and
 * handed back if the send fails so the next run tries again.
 */
export async function sendQueue(send: Send = sendHqMail, now = Date.now()): Promise<QueueReport> {
  const q = await db();
  const items = (await q.query(`select id, to_id::int as "to", title, body, link, ${iso("at")} as at from hq_notify where not sent order by at, id limit 2000`)) as (QueueItem & {
    to: number | null;
  })[];
  const report: QueueReport = { sent: 0, recipients: 0, items: 0, skipped: 0, failed: 0 };
  if (!items.length) return report;
  const who = new Map((await people()).map((p) => [p.id, p]));

  const skip: string[] = [];
  const byTo = new Map<number, QueueItem[]>();
  for (const i of items) {
    const p = i.to === null ? undefined : who.get(i.to);
    if (!p || !getsUpdates(p) || isStale(i.at, now)) skip.push(i.id);
    else byTo.set(p.id, [...(byTo.get(p.id) ?? []), i]);
  }
  if (skip.length) await q.query(`update hq_notify set sent = true, skipped = true, sent_at = now() where id = any($1::text[]) and not sent`, [skip]);
  report.skipped = skip.length;

  const site = siteUrl();
  for (const [to, list] of byTo) {
    const claimed = ((await q.query(`update hq_notify set sent = true, sent_at = now() where id = any($1::text[]) and not sent returning id`, [list.map((i) => i.id)])) as { id: string }[]).map(
      (r) => r.id,
    );
    const mine = list.filter((i) => claimed.includes(i.id)).slice(0, 40);
    if (!mine.length) continue;
    const p = who.get(to)!;
    if (await send({ kind: "hq.updates", to: addressOf(p), ...updatesEmail({ name: p.name, items: mine, site }) })) {
      report.sent++;
      report.recipients++;
      report.items += mine.length;
      // anything past the 40 shown is folded into this email's "Open DSS HQ" rather than sent later
      const rest = claimed.filter((id) => !mine.some((i) => i.id === id));
      if (rest.length) await q.query(`update hq_notify set skipped = true where id = any($1::text[])`, [rest]);
    } else {
      report.failed++;
      await q.query(`update hq_notify set sent = false, sent_at = null where id = any($1::text[])`, [claimed]);
    }
  }
  return report;
}

/* ── The morning summary ─────────────────────────────────────────────── */

/** Claims today's morning summary, so it goes out once however often the job runs. */
export async function claimMorning(today: string) {
  const rows = await (await db()).query(
    `insert into hq_settings (key, value) values ('jobs', jsonb_build_object('morning', $1::text))
     on conflict (key) do update set value = hq_settings.value || jsonb_build_object('morning', $1::text), updated_at = now()
     where hq_settings.value->>'morning' is distinct from $1
     returning key`,
    [today],
  );
  return rows.length > 0;
}

/** Everything the summaries need, read once. */
export async function snapshot(today: string): Promise<Snapshot> {
  const q = await db();
  const ppl = await people();
  const owner = ppl.find((p) => p.active && p.roles.includes("Owner"));
  const att = lastWorkingDay(today);
  const [tasks, contacts, deals, talents, leave, patternReqs, kpiProposals, onboarding, rows, cycles] = await Promise.all([
    q.query(`select title, ${day("due")} as due, assignee_id::int as "assigneeId" from hq_tasks where status <> 'done' and due <= $1::date order by due, title`, [today]),
    q.query(
      `select name, company, next_action as "nextAction", ${day("next_date")} as "nextDate", owner_id::int as "ownerId" from hq_contacts
       where next_date <= $1::date and stage not in ('won', 'lost', 'nofit') order by next_date, name`,
      [today],
    ),
    q.query(
      `select coalesce(t.name, 'A talent') as talent, coalesce(nullif(d.brand, ''), nullif(d.title, ''), 'a brand') as brand, d.next_step as "nextStep",
         ${day("d.next_date")} as "nextDate", d.owner_id::int as "ownerId", d.deliverables
       from hq_deals d left join hq_talents t on t.id = d.talent_id where d.stage = any($1::text[]) order by d.next_date nulls last`,
      [OPEN_STAGES],
    ),
    q.query(`select name, ${day("trial_ends")} as "trialEnds", manager_id::int as "managerId" from hq_talents where trial_ends between $1::date and $2::date`, [
      today,
      addDays(today, 14),
    ]),
    listLeave(),
    q.query(`select name from desk_users where active and pattern_req->>'status' = 'pending' order by name`),
    q.query(`select u.name, k.title from hq_kpi_proposals k join desk_users u on u.id = k.user_id where k.status = 'pending' order by k.created_at`),
    q.query(`select name from hq_clients where onb->>'status' = 'submitted' order by name`),
    q.query(`select user_id::int as "userId", status, late, worked_min as "workedMin", eod from hq_time where day = $1::date`, [att]),
    q.query(`select id, ${day("start")} as start from hq_plan where status = 'active' order by start desc limit 1`),
  ]);
  const cycle = cycles[0] as { id: string; start: string } | undefined;
  const week = cycle ? weekNo(cycle.start, today) : 0;
  const tactics =
    cycle && week >= 1 && week <= 12
      ? ((await q.query(`select user_id::int as "userId", title from hq_tactics where cycle_id = $1 and not archived and $2 = any(weeks) order by created_at, id`, [
          cycle.id,
          week,
        ])) as { userId: number; title: string }[])
      : [];
  return {
    today,
    ownerId: owner?.id ?? null,
    people: ppl,
    tasks: tasks as SumTask[],
    contacts: contacts as SumContact[],
    deals: (deals as SumDeal[]).map((d) => ({ ...d, deliverables: Array.isArray(d.deliverables) ? d.deliverables : [] })),
    talents: talents as SumTalent[],
    leave,
    patternReqs: patternReqs as { name: string }[],
    kpiProposals: kpiProposals as { name: string; title: string }[],
    onboarding: onboarding as { name: string }[],
    attendance: { day: att, rows: rows as SumTime[] },
    plan: cycle ? { week, tactics } : null,
  };
}

export type MorningReport = { sent: number; people: number; failed: number };

/** Sends each person their summary. Call claimMorning first. */
export async function sendMorning(today: string, send: Send = sendHqMail): Promise<MorningReport> {
  const s = await snapshot(today);
  const site = siteUrl();
  const report: MorningReport = { sent: 0, people: 0, failed: 0 };
  for (const p of s.people.filter(getsSummary)) {
    const mail = morningEmail(p, s, site);
    if (!mail) continue;
    report.people++;
    if (await send({ kind: "hq.morning", to: addressOf(p), ...mail })) report.sent++;
    else report.failed++;
  }
  return report;
}
