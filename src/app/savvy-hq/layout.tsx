import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DSS HQ · Digital Savvy Studios",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/savvy-hq">) {
  return <div className="min-h-dvh bg-cream">{children}</div>;
}
