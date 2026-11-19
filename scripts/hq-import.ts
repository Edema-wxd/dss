// Imports the claude.ai DSS HQ export into the database DATABASE_URL points at.
//
//   npm run hq:import -- <path to hq-database-export.json> [--dry-run] [--yes] [--allow-unmapped]
//
// The export holds client revenue under NDA, finances and staff details. Keep it outside this
// repository (for example in Downloads) and pass its path; never copy it in.
//
// --dry-run         plan only: counts, warnings and skipped documents, nothing written
// --yes             needed to write to a database that isn't on this machine (Neon)
// --allow-unmapped  write even though some documents have no table yet (they are listed and left out)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect, describeUrl, disconnect, isLocalUrl } from "../src/lib/driver.ts";
import { type ExportFile, runImport } from "../src/lib/hq/import.ts";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const file = args.find((a) => !a.startsWith("--"));

async function main() {
  if (!file) {
    console.error("Pass the path to hq-database-export.json, for example:\n  npm run hq:import -- ~/Downloads/dss-hq-handover-2026-11-18/hq-database-export.json --dry-run");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL isn't set. Put the Neon dev branch's connection string in .env.local.");
    process.exit(2);
  }
  const resolved = path.resolve(file);
  if (resolved.startsWith(path.resolve(process.cwd()) + path.sep)) {
    console.error("The export is inside this repository. Move it somewhere outside (it must never be committed), then run again.");
    process.exit(2);
  }

  const dryRun = flag("--dry-run");
  const target = describeUrl(url);
  if (!dryRun && !isLocalUrl(url) && !flag("--yes")) {
    console.error(`This would write to ${target}. Run with --dry-run first, then add --yes when it looks right.`);
    process.exit(2);
  }

  const data = JSON.parse(await readFile(resolved, "utf8")) as ExportFile;
  console.log(`${dryRun ? "Planning" : "Importing"} ${Object.keys(data.docs ?? {}).length} documents exported ${data.exportedAt ?? "(no date)"} into ${target}`);

  const report = await runImport(connect(url), data, {
    dryRun,
    allowUnmapped: flag("--allow-unmapped"),
    actor: "Import script",
    log: (m) => console.log(`  ${m}`),
  });

  console.log(`\nPeople: ${report.people.created} new, ${report.people.updated} matched to existing accounts by email`);
  for (const [table, n] of Object.entries(report.tables)) console.log(`  ${table.padEnd(20)} ${n}`);
  console.log(`  activity lines       ${report.activity}`);
  console.log(`Left out on purpose (private keys, DMs): ${report.excluded}`);
  if (report.unmapped.length) {
    console.log(`\nNo table yet for ${report.unmapped.length} documents:`);
    for (const p of report.unmapped.slice(0, 40)) console.log(`  ${p}`);
    if (report.unmapped.length > 40) console.log(`  …and ${report.unmapped.length - 40} more`);
  }
  if (report.errors.length) {
    console.log(`\nSkipped ${report.errors.length}:`);
    for (const e of report.errors) console.log(`  ${e}`);
  }
  if (report.warnings.length) {
    console.log(`\nWarnings (${report.warnings.length}):`);
    for (const w of report.warnings) console.log(`  ${w}`);
  }
  console.log(report.wrote ? "\nDone. People brought over have no password yet: set one for each on the Team page." : "\nNothing was written.");
  await disconnect();
  if (!report.wrote && !dryRun) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await disconnect();
  process.exit(1);
});
