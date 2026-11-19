import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Invoice } from "./invoice-model";
import { invoiceFileName, invoicePdf } from "./invoice-pdf";

// Made-up invoice. Set PDF_OUT to a file path to keep the PDF and look at it.
const inv: Invoice = {
  id: "i1", no: "DSS-INV-2026-007", kind: "client", status: "sent", currency: "NGN", issueDate: "2026-11-19", dueDate: "2026-12-03",
  items: [{ d: "Brand Strategy Consulting", q: 1, p: 500000, off: 10 }, { d: "Visibility Sprint (90 days)", q: 1, p: 250000 }],
  vat: true, vatRate: 7.5, wht: true, discType: "pct", discValue: 5, discLabel: "Loyalty discount", notes: "", billTo: { name: "Acme Test Ltd", contact: "Kemi Test", email: "kemi@example.test" },
  clientId: null, period: "", talentId: null, dealId: null, commissionPct: null, talentLine: "", payBank: true, payPaystack: true, bankId: "", payLink: "",
  payments: [{ amt: 100000, wht: 0, date: "2026-11-20", method: "Bank transfer", note: "" }], sentAt: "", createdAt: "",
};

describe("invoice PDF", () => {
  it("renders an A4 PDF with the naira font", async () => {
    const buf = await invoicePdf(inv, { company: { name: "Digital Savvy Studios", rc: "RC-TEST" }, banks: [{ id: "b1", label: "Main", currency: "NGN", bank: "Test Bank", name: "Digital Savvy Studios", number: "0123456789", extraLabel: "", extra: "", isDefault: true }], paystack: { link: "https://paystack.test/dss" } }, "2026-11-19");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
  }, 30000);
  it("names the file after the number and who it's for", () => {
    expect(invoiceFileName(inv)).toBe("DSS-INV-2026-007-Acme-Test-Ltd.pdf");
  });
});
