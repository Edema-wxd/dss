import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DSS HQ · Digital Savvy Studios",
  robots: { index: false, follow: false },
  // so HQ can go on a phone's home screen, which iPhones need before Messages can notify
  manifest: "/hq.webmanifest",
  appleWebApp: { capable: true, title: "DSS HQ", statusBarStyle: "black-translucent" },
};

export default function AdminLayout({ children }: LayoutProps<"/savvy-hq">) {
  return <div className="min-h-dvh bg-cream">{children}</div>;
}
