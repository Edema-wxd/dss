import "server-only";
import { db } from "../desk/db";
import { readSheetRanges, sheetWriter } from "../desk/sheets";
import { listPeople, listTasks } from "./data";
import { type LedgerRow, buildRecords, lagosStamp, newLedgerRows } from "./records-model";
import { listClientsFull, listContactsFull } from "./sales";
import { listDeals, listMedia, listPitches, listTalents } from "./talent";

const FULL_TABS = ["Tasks", "Clients", "CRM", "Talent", "Brand tracker", "Rate cards", "Media list", "Pitches"];
const q = (tab: string) => `'${tab}'`;

/** Rewrites the area tabs, appends new Income and Expenses rows, and stamps the Read me tab. */
export async function refreshRecordsSheet(spreadsheetId: string) {
  const [people, tasks, clients, contacts, talents, deals, media, pitches] = await Promise.all([
    listPeople(), listTasks(), listClientsFull(), listContactsFull(), listTalents(), listDeals(), listMedia(), listPitches(),
  ]);
  const tabs = buildRecords({ people, tasks, clients, contacts, talents, deals, media, pitches });
  const sheet = sheetWriter(spreadsheetId);
  await sheet.clear(FULL_TABS.map((t) => `${q(t)}!A2:Z`));
  for (const t of FULL_TABS) await sheet.write(`${q(t)}!A2`, tabs[t]);

  const sql = await db();
  const income = (await sql.query(
    `select id, to_char(date, 'YYYY-MM-DD') as date, description, coalesce(nullif(from_name, ''), deal) as party, type as kind, acct, amount::float as amount, currency from hq_fin_income`,
  )) as LedgerRow[];
  const expenses = (await sql.query(
    `select id, to_char(date, 'YYYY-MM-DD') as date, description, vendor as party, cat as kind, acct, amount::float as amount, currency, method from hq_fin_expenses`,
  )) as LedgerRow[];
  const have = await readSheetRanges(spreadsheetId, ["Income!A:A", "Expenses!A:A"]);
  const ids = (k: string) => new Set((have[k] ?? []).map((r) => String(r[0] ?? "")));
  const newIncome = newLedgerRows(income, ids("Income"), false);
  const newExpenses = newLedgerRows(expenses, ids("Expenses"), true);
  await sheet.append("Income!A:H", newIncome);
  await sheet.append("Expenses!A:I", newExpenses);
  await sheet.write(`${q("Read me")}!B4`, [[lagosStamp()]]);
  return { ok: true, rows: Object.fromEntries(FULL_TABS.map((t) => [t, tabs[t].length])), newIncome: newIncome.length, newExpenses: newExpenses.length };
}
