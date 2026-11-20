import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REP_TYPES, buildReport } from "./report-model";
import { reportFixture } from "./report-fixture";
import { reportFileName, reportPdf } from "./report-pdf";

// Set PDF_DIR to keep the decks and look at them.
describe("report slides PDF", () => {
  it("renders every report type", async () => {
    for (const [t] of REP_TYPES) {
      const r = buildReport(t, "2026-10", reportFixture());
      const buf = await reportPdf(r);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      if (process.env.PDF_DIR) writeFileSync(`${process.env.PDF_DIR}/${reportFileName(r)}`, buf);
    }
  }, 60000);
});
