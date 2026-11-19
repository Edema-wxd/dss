import "server-only";
import { db, getApplication } from "../desk/db";
import { newId } from "./data";

// Visibility Session applications feed the CRM. Each application creates a sales contact at
// "New lead", linked back to it, or links to the contact that already has that email. After
// that the CRM owns the stage, except that a won session marks the contact won and a
// "Not a fit" marks it lost. Never throws: a CRM hiccup mustn't lose a website application.

const STAGE_FOR_STATUS: Record<string, string> = { Won: "won", "Not a fit": "lost" };

export async function syncApplicationToCrm(appId: string) {
  try {
    const a = await getApplication(appId);
    if (!a) return;
    const q = await db();
    const linked = await q.query(`select id, stage from hq_contacts where application_id = $1`, [a.id]);
    let contactId = linked[0]?.id as string | undefined;
    if (!contactId && a.email) {
      const byEmail = await q.query(`select id from hq_contacts where application_id is null and lower(email) = lower($1) order by created_at limit 1`, [a.email]);
      contactId = byEmail[0]?.id;
      if (contactId) await q.query(`update hq_contacts set application_id = $2, updated_at = now() where id = $1`, [contactId, a.id]);
    }
    if (!contactId) {
      // the desk records the owner as a first name; match it to a person if we can
      const owner = a.owner
        ? ((await q.query(`select id::int from desk_users where active and lower(split_part(name, ' ', 1)) = lower($1) limit 1`, [a.owner.split(" ")[0]]))[0]?.id ?? null)
        : null;
      contactId = newId();
      const notes = [a.moment && `Moment: ${a.moment}`, a.worth && `Why it's worth it: ${a.worth}`, a.when && `Timing: ${a.when}`].filter(Boolean).join("\n");
      await q.query(
        `insert into hq_contacts (id, name, company, kind, stage, owner_id, role, website, email, whatsapp, source, service, notes, application_id)
         values ($1, $2, $3, 'sales', 'new', $4, $5, $6, $7, $8, 'Visibility Session', 'Visibility Session', $9, $10)`,
        [contactId, a.name, a.company, owner, a.role, a.site, a.email, a.whatsapp, notes, a.id],
      );
    }
    const stage = STAGE_FOR_STATUS[a.status];
    if (stage) {
      await q.query(
        `update hq_contacts set stage = $2, won_at = case when $2 = 'won' then coalesce(won_at, now()) else won_at end, updated_at = now()
         where id = $1 and stage <> $2`,
        [contactId, stage],
      );
    }
  } catch (e) {
    console.error("Couldn't copy the application to the CRM", appId, e);
  }
}

/**
 * Brings every existing application into the CRM once, the first time the CRM opens after
 * this update. Later applications sync as they arrive.
 */
export async function backfillApplications() {
  const q = await db();
  const done = await q.query(`select value from app_meta where key = 'crm_applications_backfill'`);
  if (done.length) return;
  const apps = await q.query(`select id from vs_applications where id not in (select application_id from hq_contacts where application_id is not null) order by submitted`);
  for (const a of apps) await syncApplicationToCrm(String(a.id));
  await q.query(`insert into app_meta (key, value) values ('crm_applications_backfill', $1) on conflict (key) do nothing`, [new Date().toISOString()]);
}
