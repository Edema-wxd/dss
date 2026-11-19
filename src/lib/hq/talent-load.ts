import "server-only";
import type { DeskUser } from "../desk/auth";
import { seesMoney } from "./access";
import { loadWork } from "./load";
import { listContactsFull } from "./sales";
import { listDeals, listTalents } from "./talent";

/** Everything the Talent pages share. */
export async function loadTalent(user: DeskUser) {
  const [w, talents, deals, contacts] = await Promise.all([loadWork(user), listTalents(), listDeals(), listContactsFull("talent")]);
  return { w, talents, deals, contacts, money: seesMoney(user.roles) };
}
