import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Report, Slide } from "./report-model";

// A filed report as a 16:9 slide deck (HQ's reportPdf), made on the server. Amounts print with
// "NGN" instead of the naira sign, which the PDF font doesn't draw reliably.

const FONTS = path.join(process.cwd(), "src/assets/fonts");
let registered = false;
function fonts() {
  if (registered) return;
  Font.register({ family: "Poppins", fonts: [{ src: path.join(FONTS, "poppins-latin-400-normal.woff") }, { src: path.join(FONTS, "poppins-latin-700-normal.woff"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const INK = "#0d0d10";
const PAPER = "#f6f1ea";
const PINK = "#EC1763";
const SLATE = "#5b5b66";
const LIME = "#d7f55a";
const W = 960;
const H = 540;
const LOGO = () => path.join(process.cwd(), "public/images/iconmark-pink.png");
const t = (s: string) => s.replace(/₦/g, "NGN ");
const STAT_TINTS = ["#ffffff", "#eceef8", "#fde2ec", "#eef6d5"];

const st = StyleSheet.create({
  page: { width: W, height: H, fontFamily: "Poppins", color: INK, backgroundColor: PAPER, padding: 40, paddingBottom: 56 },
  eyebrow: { fontSize: 10, fontWeight: 700, color: PINK, letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: 700, marginTop: 4, marginBottom: 18 },
  foot: { position: "absolute", left: 40, right: 40, bottom: 18, flexDirection: "row", alignItems: "center", gap: 8, fontSize: 8, color: SLATE },
  logo: { width: 14, height: 14 },
});

function Foot({ i, n, title }: { i: number; n: number; title: string }) {
  return (
    <View style={st.foot} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
      <Image src={LOGO()} style={st.logo} />
      <Text style={{ flex: 1 }}>Digital Savvy Studios · {t(title)}</Text>
      <Text>
        {i + 1} / {n}
      </Text>
    </View>
  );
}

function Body({ s }: { s: Slide }) {
  if (s.kind === "stats") {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {s.items.map((x, j) => (
          <View key={x.k} style={{ width: s.items.length > 2 ? 425 : 425, height: s.items.length > 2 ? 160 : 260, backgroundColor: STAT_TINTS[j % 4], borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 18, justifyContent: "space-between" }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: SLATE, letterSpacing: 0.8 }}>{x.k.toUpperCase()}</Text>
            <Text style={{ fontSize: 34, fontWeight: 700 }}>{t(x.v)}</Text>
            <Text style={{ fontSize: 11, color: SLATE }}>{t(x.s ?? "")}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (s.kind === "bars") {
    const rows = s.rows.slice(0, 9);
    const mx = s.max ?? Math.max(1, ...rows.map((r) => Number(r.value) || 0));
    return (
      <View style={{ gap: 9 }}>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ width: 250, fontSize: 11 }}>{t(r.label)}</Text>
            <View style={{ flex: 1, height: 18, backgroundColor: "#e7e1d8", borderRadius: 9 }}>
              <View style={{ width: `${Math.max(0.5, Math.min(100, ((Number(r.value) || 0) / mx) * 100))}%`, height: 18, backgroundColor: r.color, borderRadius: 9 }} />
            </View>
            <Text style={{ width: 170, fontSize: 11, fontWeight: 700, textAlign: "right" }}>{t(r.display)}</Text>
          </View>
        ))}
        {s.note ? <Text style={{ fontSize: 9, color: SLATE, marginTop: 6 }}>{s.note}</Text> : null}
      </View>
    );
  }
  if (s.kind === "cols") {
    const mx = Math.max(1, ...s.series.flatMap((x) => x.values));
    const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
    return (
      <View>
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          {s.series.map((x) => (
            <View key={x.name} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 10, height: 10, backgroundColor: x.color, borderRadius: 2 }} />
              <Text style={{ fontSize: 10 }}>{x.name}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", height: 300, alignItems: "flex-end", gap: 18 }}>
          {s.labels.map((l, j) => (
            <View key={l} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 280 }}>
                {s.series.map((x) => {
                  const v = Number(x.values[j]) || 0;
                  return (
                    <View key={x.name} style={{ alignItems: "center", justifyContent: "flex-end", height: 280 }}>
                      <Text style={{ fontSize: 7, color: SLATE, marginBottom: 2 }}>{s.money ? short(v) : String(v)}</Text>
                      <View style={{ width: 26, height: Math.max(1, (Math.max(0, v) / mx) * 250), backgroundColor: x.color, borderRadius: 3 }} />
                    </View>
                  );
                })}
              </View>
              <Text style={{ fontSize: 10, marginTop: 4 }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (s.kind === "table") {
    const cols = s.head.length;
    return (
      <View>
        <View style={{ flexDirection: "row", borderBottomWidth: 2, borderBottomColor: INK }}>
          {s.head.map((h, k) => (
            <Text key={k} style={{ flex: k === 0 ? 2 : 1, fontSize: 9, fontWeight: 700, color: SLATE, paddingVertical: 5, textAlign: k && cols <= 3 ? "right" : "left" }}>
              {h.toUpperCase()}
            </Text>
          ))}
        </View>
        {s.rows.slice(0, 12).map((r, j) => (
          <View key={j} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d6cfc4" }}>
            {r.map((c, k) => (
              <Text key={k} style={{ flex: k === 0 ? 2 : 1, fontSize: 10.5, paddingVertical: 4.5, fontWeight: s.bold?.includes(j) ? 700 : 400, textAlign: k && cols <= 3 ? "right" : "left" }}>
                {t(c)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (s.kind === "notes") {
    const tints = ["#eef6d5", "#fde2ec", "#eceef8"];
    return (
      <View style={{ flexDirection: "row", gap: 14 }}>
        {s.blocks.map((b, j) => (
          <View key={b.h} style={{ flex: 1, minHeight: 300, backgroundColor: tints[j], borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: 700 }}>{b.h}</Text>
            {b.items.slice(0, 4).map((x) => (
              <Text key={x} style={{ fontSize: 11, lineHeight: 1.4 }}>
                · {t(x)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }
  return null;
}

function Deck({ r }: { r: Report }) {
  const n = r.slides.length;
  return (
    <Document title={t(r.title)} author="Digital Savvy Studios">
      {r.slides.map((s, i) => {
        if (s.kind === "cover" || s.kind === "close") {
          const cover = s.kind === "cover";
          return (
            <Page key={i} size={[W, H]} style={[st.page, { backgroundColor: cover ? INK : PINK, color: "white", justifyContent: "center" }]}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={LOGO()} style={{ position: "absolute", top: 36, left: 40, width: 40, height: 40, backgroundColor: "white", borderRadius: 8, padding: 4 }} />
              {cover && <Text style={[st.eyebrow, { color: LIME }]}>MONTHLY REPORT</Text>}
              <Text style={{ fontSize: cover ? 54 : 44, fontWeight: 700, marginTop: 8 }}>{s.title}</Text>
              <Text style={{ fontSize: 18, marginTop: 8, color: cover ? "#c9c9cf" : "white" }}>{s.sub}</Text>
              {cover && (
                <Text style={{ position: "absolute", bottom: 26, left: 0, right: 0, textAlign: "center", fontSize: 10, color: PINK, letterSpacing: 1.5 }}>
                  DIGITAL SAVVY STUDIOS · EXCELLENCE, MADE VISIBLE · DIGITAL SAVVY STUDIOS · EXCELLENCE, MADE VISIBLE
                </Text>
              )}
            </Page>
          );
        }
        return (
          <Page key={i} size={[W, H]} style={st.page}>
            <Text style={st.eyebrow}>DIGITAL SAVVY STUDIOS</Text>
            <Text style={st.title}>{t(s.title)}</Text>
            <Body s={s} />
            <Foot i={i} n={n} title={r.title} />
          </Page>
        );
      })}
    </Document>
  );
}

export async function reportPdf(r: Report) {
  fonts();
  return renderToBuffer(<Deck r={r} />);
}

export const reportFileName = (r: Pick<Report, "type" | "month">) => `DSS-${r.type}-report-${r.month}.pdf`;
