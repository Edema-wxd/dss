import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { type Invoice, type InvoiceSettings, INV_DEFAULTS, bankFor, invCalc, invStatus, paystackFor } from "./invoice-model";

// The invoice PDF, made on the server. Same layout as the on-screen page (invoice-paper.tsx).
// Amounts print with the currency code (NGN 714,875): the PDF font has no reliable naira sign.

const FONTS = path.join(process.cwd(), "src/assets/fonts");
let registered = false;
function fonts() {
  if (registered) return;
  Font.register({ family: "Poppins", fonts: [{ src: path.join(FONTS, "poppins-latin-400-normal.woff") }, { src: path.join(FONTS, "poppins-latin-700-normal.woff"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const INK = "#0d0d10";
const SLATE = "#5b5b66";
const PAPER = "#f6f1ea";
const LIME = "#d7f55a";
const GREEN = "#1e7a4c";

const st = StyleSheet.create({
  page: { fontFamily: "Poppins", fontSize: 9.5, color: INK, paddingBottom: 40 },
  head: { backgroundColor: INK, color: "white", paddingHorizontal: 40, paddingVertical: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 30, height: 30, backgroundColor: "white", borderRadius: 4, padding: 2 },
  body: { paddingHorizontal: 40, paddingTop: 20, gap: 16 },
  label: { fontSize: 7.5, fontWeight: 700, color: SLATE, letterSpacing: 0.8, marginBottom: 3 },
  row: { flexDirection: "row", gap: 14 },
  box: { flex: 1, backgroundColor: PAPER, borderRadius: 8, padding: 12, gap: 1.5 },
  th: { fontSize: 7.5, fontWeight: 700, color: SLATE, letterSpacing: 0.6, paddingVertical: 6 },
  td: { paddingVertical: 6 },
  num: { textAlign: "right" },
  pay: { flex: 1, borderWidth: 1.5, borderColor: INK, borderRadius: 8, padding: 12, gap: 4 },
  totals: { flex: 1, gap: 3 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  big: { flexDirection: "row", justifyContent: "space-between", backgroundColor: INK, color: "white", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 3 },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: SLATE, borderTopWidth: 0.5, borderTopColor: "#ccc", paddingTop: 8 },
});

const longDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

function T({ l, v }: { l: string; v: string }) {
  return (
    <View style={st.tline}>
      <Text style={{ color: SLATE }}>{l}</Text>
      <Text>{v}</Text>
    </View>
  );
}

function InvoiceDoc({ i, s, today }: { i: Invoice; s: InvoiceSettings; today: string }) {
  const c = invCalc(i);
  const m = (n: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: i.currency || "NGN", currencyDisplay: "code", maximumFractionDigits: i.currency === "NGN" ? 0 : 2 }).format(n).replace(/\u00a0/g, " ");
  const co = s.company ?? {};
  const bank = i.payBank ? bankFor(i, s) : null;
  const link = paystackFor(i, s);
  const anyOff = i.items.some((it) => Number(it.off) > 0);
  const paid = invStatus(i, today) === "paid";
  const cols = anyOff ? [4, 1.6, 0.7, 1.2, 1.8] : [4.6, 1.8, 0.8, 2];
  return (
    <Document title={`${i.no} ${i.billTo.name ?? ""}`.trim()} author={co.name || INV_DEFAULTS.company}>
      <Page size="A4" style={st.page}>
        <View style={st.head}>
          <View style={st.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={path.join(process.cwd(), "public/images/iconmark-pink.png")} style={st.logo} />
            <View>
              <Text style={{ fontSize: 12, fontWeight: 700 }}>Digital Savvy Studios</Text>
              <Text style={{ fontSize: 7.5, color: "#c9c9cf" }}>Excellence, made visible</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 22, fontWeight: 700 }}>Invoice.</Text>
            <Text style={{ fontSize: 7.5, color: "#c9c9cf", letterSpacing: 0.8 }}>NO. {i.no}</Text>
          </View>
        </View>
        <View style={st.body}>
          <View style={[st.row, { alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>INVOICE DATE</Text>
              <Text>{longDate(i.issueDate)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>DUE DATE</Text>
              <Text>{i.dueDate ? longDate(i.dueDate) : "On receipt"}</Text>
            </View>
            {paid && <Text style={{ borderWidth: 2, borderColor: GREEN, color: GREEN, fontWeight: 700, fontSize: 14, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, transform: "rotate(-6deg)" }}>PAID</Text>}
          </View>

          <View style={st.row}>
            <View style={st.box}>
              <Text style={st.label}>Invoice to:</Text>
              <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{i.billTo.name}</Text>
              {i.billTo.contact ? <Text>Attn: {i.billTo.contact}</Text> : null}
              {i.billTo.email ? <Text>{i.billTo.email}</Text> : null}
              {i.billTo.phone ? <Text>{i.billTo.phone}</Text> : null}
              {i.billTo.address ? <Text>{i.billTo.address}</Text> : null}
            </View>
            <View style={st.box}>
              <Text style={st.label}>From:</Text>
              <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{co.name || INV_DEFAULTS.company}</Text>
              {co.rc ? <Text>RC {co.rc}</Text> : null}
              <Text>{co.email || INV_DEFAULTS.email}</Text>
              <Text style={{ marginTop: 6, alignSelf: "flex-start", backgroundColor: INK, color: LIME, fontWeight: 700, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                Total {m(c.total)}
              </Text>
            </View>
          </View>

          {i.kind === "talent" && i.talentLine ? <Text style={{ color: SLATE }}>{i.talentLine}</Text> : null}

          <View>
            <View style={[st.row, { gap: 0, borderBottomWidth: 1.5, borderBottomColor: INK }]}>
              {["Description", "Price", "Qty", ...(anyOff ? ["Discount"] : []), "Subtotal"].map((h, n) => (
                <Text key={h} style={[st.th, { flex: cols[n] }, n > 0 ? st.num : {}]}>
                  {h.toUpperCase()}
                </Text>
              ))}
            </View>
            {i.items.map((it, n) => {
              const g = (Number(it.q) || 0) * (Number(it.p) || 0);
              const off = Number(it.off) || 0;
              const cells = [it.d, m(Number(it.p) || 0), String(it.q), ...(anyOff ? [off ? `${off}% off` : ""] : [])];
              return (
                <View key={n} style={[st.row, { gap: 0, borderBottomWidth: 0.5, borderBottomColor: "#ddd" }]} wrap={false}>
                  {cells.map((v, k) => (
                    <Text key={k} style={[st.td, { flex: cols[k] }, k > 0 ? st.num : { paddingRight: 6 }]}>
                      {v}
                    </Text>
                  ))}
                  <View style={[st.td, { flex: cols[cols.length - 1], alignItems: "flex-end" }]}>
                    {off > 0 && (
                      <Text style={{ color: SLATE, textDecoration: "line-through", fontSize: 8 }}>
                        {m(g)}
                      </Text>
                    )}
                    <Text>
                      {m(g * (1 - off / 100))}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={st.row} wrap={false}>
            <View style={st.pay}>
              <Text style={{ fontWeight: 700, fontSize: 11 }}>How to pay</Text>
              {bank && (
                <View style={{ gap: 1.5 }}>
                  <Text style={st.label}>BANK TRANSFER</Text>
                  <Text>Bank: {bank.bank}</Text>
                  <Text>Account name: {bank.name}</Text>
                  <Text>
                    Account number: <Text style={{ fontWeight: 700 }}>{bank.number}</Text>
                  </Text>
                  {bank.extra ? (
                    <Text>
                      {bank.extraLabel || "Sort code / SWIFT"}: {bank.extra}
                    </Text>
                  ) : null}
                </View>
              )}
              {link ? (
                <View style={{ gap: 1.5 }}>
                  <Text style={st.label}>PAYSTACK</Text>
                  <Text>Card, transfer or USSD: {link}</Text>
                </View>
              ) : null}
              {!bank && !link ? (
                <View>
                  <Text style={st.label}>BANK TRANSFER</Text>
                  <Text>Account details to follow</Text>
                </View>
              ) : null}
              <Text style={{ marginTop: 4 }}>
                Use <Text style={{ fontWeight: 700 }}>{i.no}</Text> as your payment reference.
              </Text>
            </View>
            <View style={st.totals}>
              {c.lineDisc > 0 ? <T l="Before discounts" v={m(c.gross)} /> : null}
              {c.lineDisc > 0 ? <T l="Line discounts" v={`-${m(c.lineDisc)}`} /> : null}
              <T l="Subtotal" v={m(c.sub)} />
              {c.disc > 0 ? <T l={`${i.discLabel || "Discount"}${i.discType === "pct" ? ` (${i.discValue}%)` : ""}`} v={`-${m(c.disc)}`} /> : null}
              {c.disc > 0 && i.vat ? <T l="After discount" v={m(c.net)} /> : null}
              {i.vat ? <T l={`VAT (${Number(i.vatRate) || 7.5}%)`} v={m(c.vat)} /> : null}
              {c.paid > 0 ? <T l="Paid" v={`-${m(c.paid)}`} /> : null}
              <View style={st.big}>
                <Text style={{ fontWeight: 700 }}>{c.paid > 0 ? "Balance" : "Total"}</Text>
                <Text style={{ fontWeight: 700, fontSize: 12 }}>
                  {m(c.paid > 0 ? c.balance : c.total)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 3 }} wrap={false}>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>Terms and notes</Text>
            <Text>{i.notes || INV_DEFAULTS.terms}</Text>
            {i.wht ? <Text style={{ color: SLATE }}>{s.whtText || INV_DEFAULTS.wht}</Text> : null}
          </View>
        </View>
        <View style={st.foot} fixed>
          <View>
            <Text>{[co.email || INV_DEFAULTS.email, co.phone].filter(Boolean).join(" · ")}</Text>
            {co.address ? <Text>{co.address}</Text> : null}
            <Text>{co.website || INV_DEFAULTS.website}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontWeight: 700, color: INK, fontSize: 9 }}>{co.signName || INV_DEFAULTS.signName}</Text>
            <Text>{co.signTitle || INV_DEFAULTS.signTitle}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function invoicePdf(i: Invoice, s: InvoiceSettings, today: string) {
  fonts();
  return renderToBuffer(<InvoiceDoc i={i} s={s} today={today} />);
}

/** "DSS-INV-2026-001-Acme-Ltd.pdf" */
export const invoiceFileName = (i: Invoice) => `${i.no}-${(i.billTo.name ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`.replace(/-\.pdf$/, ".pdf");
