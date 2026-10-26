"use client";

import { type LeadFlag } from "@/lib/desk/model";
import { removeLead, setLeadFlag } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { Toggle, ago } from "./ui";

const FLAGS: [LeadFlag, string][] = [
  ["email1", "Email 1 sent"],
  ["email2", "Email 2 sent"],
  ["applied", "Applied"],
];

export function Leads() {
  const { data, run, pending } = useDesk();
  const { leads } = data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Checklist leads</h1>
        <span className="text-sm text-slate">Founders who took the Launch Visibility Checklist</span>
      </div>
      {leads.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Founder", "Next moment", "Source", ...FLAGS.map((f) => f[1]), "Signed up", ""].map((h, i) => (
                  <th key={i} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-ink/10 align-top last:border-b-0">
                  <td className="px-3 py-3">
                    <b className="block font-semibold">{l.name}</b>
                    <a className="text-xs text-slate underline" href={`mailto:${l.email}`}>
                      {l.email}
                    </a>
                  </td>
                  <td className="px-3 py-3">{l.moment || <small className="text-slate">Not given</small>}</td>
                  <td className="px-3 py-3">
                    <small className="text-slate">{l.source}</small>
                  </td>
                  {FLAGS.map(([k, label]) => (
                    <td key={k} className="px-3 py-3">
                      <Toggle
                        checked={l[k]}
                        disabled={pending}
                        onChange={(v) => run(() => setLeadFlag(l.id, k, v))}
                        label={<span className="sr-only">{`${label}: ${l.name}`}</span>}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 whitespace-nowrap">{ago(l.at)} ago</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs font-semibold text-pink underline"
                      onClick={() => window.confirm(`Delete ${l.name || l.email}?`) && run(() => removeLead(l.id))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-[24px] border-2 border-dashed border-ink/30 bg-white px-6 py-10 text-center">
          <h2 className="text-xl font-bold">No checklist sign-ups yet</h2>
          <p className="max-w-[56ch] text-slate">Sign-ups from the Launch Visibility Checklist pop-up on the Visibility Session page arrive here.</p>
        </div>
      )}
    </>
  );
}
