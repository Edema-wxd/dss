// The two signed-in areas, which share one account and one session:
//   /savvy-hq      DSS HQ
//   /session-desk  the Visibility Sessions desk

export const HQ = "/savvy-hq";
export const DESK = "/session-desk";

/** Where an old /admin path lives now: Visibility Sessions moved to the Session Desk, the rest to HQ. */
export function movedFrom(path: string) {
  if (path === "/admin/sessions" || path.startsWith("/admin/sessions/")) return DESK + path.slice("/admin/sessions".length);
  return HQ + path.slice("/admin".length);
}

/** The area a path belongs to, and so which sign-in page it uses. */
export const isDeskPath = (path: string) => path === DESK || path.startsWith(`${DESK}/`);
export const loginFor = (path: string) => (isDeskPath(path) ? `${DESK}/login` : `${HQ}/login`);

/** Where to go after signing in: one of the two areas only, never another site. */
export function safeNext(next: unknown) {
  const s = String(next ?? "");
  if (!/^\/(savvy-hq|session-desk)(\/[\w\-/?=&%.]*)?$/.test(s) || s.includes("//")) return HQ;
  return s.endsWith("/login") ? s.slice(0, -"/login".length) : s;
}
