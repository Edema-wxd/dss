import "server-only";
import { connection } from "next/server";
import type { DeskUser } from "../desk/auth";
import { ownTasksOnly } from "./access";
import { listClients, listPeople } from "./data";
import { lagosToday } from "./work";

/** What every work page needs to render tasks: the team, live clients, today in Lagos, and who's looking. */
export async function loadWork(user: DeskUser) {
  // today's date depends on the clock, so the page renders per request
  await connection();
  const [people, clients] = await Promise.all([listPeople(), listClients()]);
  return {
    people: people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
    clients: clients.filter((c) => c.status !== "ended").map((c) => ({ id: c.id, name: c.name })),
    me: { id: user.id, name: user.name },
    today: lagosToday(),
    ownOnly: ownTasksOnly(user.roles),
  };
}
