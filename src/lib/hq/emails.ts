import { longDate, relDay, sortTasks, addDays } from "./work";

// The words of HQ's emails. Plain, warm and short, with no em or en dashes, and never money or
// private messages. Pure functions, so the tests can read exactly what goes out.

type T = { id: string; title: string; due: string; priority: string; status: string; doneDay: string };
type Link = (task: string, action: "done" | "carry" | "drop") => string | null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Jane's 7pm check-in: what's done today, then every open task (overdue and today first, then the
 * rest of the week), each with Done, Tomorrow and Drop links, and a link to End of day in HQ.
 */
export function checkinEmail(o: { firstName: string; today: string; next: string; tasks: readonly T[]; site: string; link: Link }) {
  const { today, next } = o;
  const week = addDays(today, 7);
  const done = o.tasks.filter((t) => t.status === "done" && t.doneDay === today);
  const open = o.tasks.filter((t) => t.status !== "done");
  const late = sortTasks(open.filter((t) => t.due && t.due <= today));
  const later = sortTasks(open.filter((t) => t.due && t.due > today && t.due <= week));
  const list = [...late, ...later];
  const nextLabel = relDay(next, today).toLowerCase();
  const end = `${o.site}/admin/today/end`;
  const dueText = (t: T) => (t.due < today ? `overdue since ${relDay(t.due, today).toLowerCase()}` : `due ${relDay(t.due, today).toLowerCase()}`);
  const subject = `Your end of day check-in, ${longDate(today)}`;

  const lines = [
    `Hi ${o.firstName},`,
    "",
    done.length ? `Closed today (${done.length}):` : "Nothing marked done today yet.",
    ...done.map((t) => `  ${t.title}`),
    "",
    list.length ? `Still open (${list.length}):` : "Nothing else open this week. Good day.",
  ];
  list.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.title}, ${dueText(t)}`);
    const d = o.link(t.id, "done");
    const c = o.link(t.id, "carry");
    const x = o.link(t.id, "drop");
    if (d && c && x) lines.push(`   Done: ${d}`, `   Move to ${nextLabel}: ${c}`, `   Drop: ${x}`);
  });
  lines.push(
    "",
    "What else did you finish? Which open tasks move to tomorrow, and is there anything to drop?",
    `Tap the links above, or do it all in one go on End of day in HQ: ${end}`,
    "",
    "DSS HQ",
  );

  const btn = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 0 0;padding:6px 12px;border-radius:999px;border:2px solid #201c2b;color:${primary ? "#fff" : "#201c2b"};background:${primary ? "#ec1763" : "#fff"};font-weight:600;font-size:13px;text-decoration:none">${esc(label)}</a>`;
  const html = `<div style="font-family:Poppins,Segoe UI,Arial,sans-serif;color:#201c2b;max-width:560px;line-height:1.5">
<p>Hi ${esc(o.firstName)},</p>
${done.length ? `<p><b>Closed today (${done.length})</b></p><ul>${done.map((t) => `<li>${esc(t.title)}</li>`).join("")}</ul>` : "<p>Nothing marked done today yet.</p>"}
${
  list.length
    ? `<p><b>Still open (${list.length})</b></p><ol style="padding-left:20px">${list
        .map((t) => {
          const d = o.link(t.id, "done");
          const c = o.link(t.id, "carry");
          const x = o.link(t.id, "drop");
          return `<li style="margin-bottom:12px"><b>${esc(t.title)}</b><br><span style="color:${t.due < today ? "#c42b3c" : "#5f5f63"};font-size:13px">${esc(dueText(t))}</span>${
            d && c && x ? `<br>${btn(d, "Done", true)}${btn(c, `Move to ${nextLabel}`)}${btn(x, "Drop")}` : ""
          }</li>`;
        })
        .join("")}</ol>`
    : "<p>Nothing else open this week. Good day.</p>"
}
<p>What else did you finish? Which open tasks move to tomorrow, and is there anything to drop?</p>
<p>${btn(end, "Open End of day in HQ", true)}</p>
<p style="color:#5f5f63;font-size:13px">DSS HQ</p></div>`;

  return { subject, text: lines.join("\n"), html };
}

/** The 1st of the month: a nudge to download the backup, when the last one is over 30 days old. */
export function backupReminderEmail(o: { firstName: string; site: string; daysSince: number | null }) {
  const when = o.daysSince === null ? "There's no backup yet." : `The last backup was ${o.daysSince} days ago.`;
  const url = `${o.site}/admin/settings`;
  const text = [
    `Hi ${o.firstName},`,
    "",
    "Time for this month's HQ backup: Settings, Download a backup, then save it to Google Drive.",
    when,
    "",
    url,
    "",
    "DSS HQ",
  ].join("\n");
  const html = `<div style="font-family:Poppins,Segoe UI,Arial,sans-serif;color:#201c2b;max-width:560px;line-height:1.5"><p>Hi ${esc(o.firstName)},</p><p>Time for this month's HQ backup: Settings, Download a backup, then save it to Google Drive.</p><p>${esc(when)}</p><p><a href="${esc(url)}" style="color:#ec1763;font-weight:600">Open Settings in HQ</a></p><p style="color:#5f5f63;font-size:13px">DSS HQ</p></div>`;
  return { subject: "Time for this month's HQ backup", text, html };
}

/** True when a backup reminder is due: none yet, or the last one is more than 30 days old. */
export const backupDue = (lastBackup: string | undefined, now = Date.now()) => {
  const t = lastBackup ? Date.parse(lastBackup) : NaN;
  return Number.isNaN(t) ? { due: true, days: null } : { due: now - t > 30 * 864e5, days: Math.floor((now - t) / 864e5) };
};
