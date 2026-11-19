import "server-only";
import type { DeskUser } from "../desk/auth";
import { canUse, seesMoney } from "./access";
import { loadWork } from "./load";
import { listContactsFull } from "./sales";
import { listDeals, listTalents } from "./talent";

/** Everything the Talent pages share. */
export async function loadTalent(user: DeskUser) {
  const [w, talents, deals, contacts] = await Promise.all([loadWork(user), listTalents(), listDeals(), listContactsFull("talent")]);
  // invoices access: raise invoices from deals and see talent payout accounts (HQ's finOK)
  return { w, talents, deals, contacts, money: seesMoney(user.roles), fin: canUse(user.roles, "invoices") };
}
