import { type NextRequest, NextResponse } from "next/server";
import { BANDS } from "@/lib/desk/model";
import { routeFor, statusForRoute } from "@/lib/desk/logic";
import { scheduleMirror } from "@/lib/desk/sheets";
import { NotConfiguredError, insertApplication, insertLead, loadDesk, markLeadApplied, newApplicationId, publicSettings } from "@/lib/desk/db";

// The Visibility Session page talks to the desk here.
// GET returns the public settings (seats left, waitlist, booking link). POST stores an
// application or a checklist sign-up.

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const text = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

/** The form's budget labels, mapped to the desk's bands. Band keys are accepted as they are. */
const BUDGET_LABELS: Record<string, string> = {
  "Under ₦800,000": "under-800k",
  "₦800,000 to ₦1.5m": "800k-1.5m",
  "₦1.5m to ₦3m": "1.5m-3m",
  "₦3m to ₦5m": "3m-5m",
  "Over ₦5m": "5m-plus",
  "We budget in USD or another currency": "foreign",
};
const toBand = (v: string) => (BANDS.some(([b]) => b === v) ? v : (BUDGET_LABELS[v] ?? ""));

function failure(e: unknown) {
  if (e instanceof NotConfiguredError) return NextResponse.json({ ok: false, error: "not-configured" }, { status: 503 });
  console.error("visibility endpoint", e);
  return NextResponse.json({ ok: false, error: "server-error" }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, settings: await publicSettings() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ ok: false, error: "too-large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  // bots fill every field, people never see this one
  if (text(body.website_url)) return NextResponse.json({ ok: true });

  try {
    const email = text(body.email, 200);
    if (!emailOk(email)) return NextResponse.json({ ok: false, error: "email" }, { status: 422 });

    if (body.type === "checklist-lead") {
      await insertLead({ name: text(body.name, 120), email, moment: text(body.moment, 200), source: text(body.source, 120) || "website" });
      scheduleMirror();
      return NextResponse.json({ ok: true });
    }

    const name = text(body.name, 120);
    if (!name) return NextResponse.json({ ok: false, error: "name" }, { status: 422 });
    const budget = toBand(text(body.budget, 80));
    const when = text(body.when, 80);
    const { settings } = await loadDesk();
    const route = routeFor(budget, when, settings);
    const score = Number(body.lookupScore);
    const id = newApplicationId();
    await insertApplication({
      id,
      name,
      role: text(body.role, 120),
      company: text(body.company, 160),
      site: text(body.site, 200),
      email,
      whatsapp: text(body.whatsapp, 40),
      moment: text(body.moment, 200),
      when,
      budget,
      decider: text(body.decider, 120),
      worth: text(body.worth, 1000),
      route,
      source: text(body.source, 120) || "website",
      score: Number.isInteger(score) && score >= 0 && score <= 5 ? score : null,
      consent: body.consent === true,
      status: statusForRoute(route),
    });
    await markLeadApplied(email);
    scheduleMirror();
    return NextResponse.json({ ok: true, id, route });
  } catch (e) {
    return failure(e);
  }
}
