import { Suspense } from "react";
import { ToastProvider } from "@/components/desk/ui";
import { ClockSlot } from "@/components/hq/clock-slot";
import { ShellNav } from "@/components/hq/shell";
import { CaptureBar } from "@/components/hq/tasks";
import { currentUser } from "@/lib/desk/auth";
import { marketingTabsFor, navFor } from "@/lib/hq/access";

// The HQ frame: the dark sidebar on wide screens, a floating pill nav on phones.
// Signing in happens at /admin/login, outside this frame.

export default function HqLayout({ children }: LayoutProps<"/admin">) {
  return (
    <ToastProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <Suspense fallback={<div aria-hidden className="sticky top-0 hidden h-dvh bg-hq-side lg:block" />}>
          <Nav />
        </Suspense>
        <div className="min-w-0 pb-28 lg:col-start-2 lg:pb-0">
          <header className="sticky top-0 z-30 bg-cream/90 px-4 pt-3 pb-2 backdrop-blur lg:px-8">
            <div className="mx-auto flex max-w-[1280px] items-center gap-2">
              <CaptureBar />
              <ClockSlot />
            </div>
          </header>
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}

async function Nav() {
  const user = await currentUser().catch(() => null);
  if (!user) return null;
  // someone whose Marketing is only Publicity (a Talent Manager) sees it named that way
  const pubOnly = marketingTabsFor(user.roles)?.length === 1;
  const items = navFor(user.roles).map(({ key, label }) => ({ key, label: key === "marketing" && pubOnly ? "Publicity" : label }));
  return <ShellNav items={items} me={{ name: user.name, email: user.email, role: (user.ownRoles ?? user.roles).join(", ") }} />;
}
