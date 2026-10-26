// Sends website submissions to the Session Desk. Never blocks the visitor: if the request
// fails, they still see their confirmation, and the failure is logged for the team.

/** Where the visitor came from: ?event=, ?source= or ?utm_source=, else "website". */
export function visitSource() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("event") || p.get("source") || p.get("utm_source") || "website";
  } catch {
    return "website";
  }
}

export function sendToDesk(payload: Record<string, unknown>) {
  return fetch("/api/visibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: visitSource(), ...payload }),
    keepalive: true,
  })
    .then((r) => r.ok)
    .catch((e) => {
      console.error("Couldn't reach the Session Desk", e);
      return false;
    });
}
