import type { Metadata } from "next";
import { ToastProvider } from "@/components/desk/ui";

// The Session Desk: Visibility Session applications, checklist leads, sent emails and the
// settings the website reads. Its own app beside DSS HQ, with the same accounts and roles: anyone
// whose roles include Visibility Sessions can open it.

export const metadata: Metadata = {
  title: "Session Desk · Digital Savvy Studios",
  robots: { index: false, follow: false },
};

export default function SessionDeskLayout({ children }: LayoutProps<"/session-desk">) {
  return (
    <div className="min-h-dvh bg-cream">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
