"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { pushState, savePush, stopPush } from "@/app/savvy-hq/(hq)/chat/actions";
import { useToast } from "@/components/desk/ui";
import { PUSH_MODES, type PushMode } from "@/lib/hq/push-model";
import { cn } from "@/lib/utils";
import { Dialog } from "./kit";

// Push notifications for Messages, switched on per device: this phone or this computer. The bell
// sits beside "Colours and wallpaper". It only shows when the server has push keys.

const SW = "/savvy-hq-sw.js";

/** The server's public key, as the browser wants it. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "checking" | "yes" | "no" | "ios-install";

function supportOf(): Support {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !installed) return "ios-install";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}

export function PushButton({ pushKey }: { pushKey: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState<Support>("checking");
  const [mode, setMode] = useState<PushMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // find out whether this browser is already signed up, and for what
  useEffect(() => {
    let live = true;
    (async () => {
      const s = supportOf();
      if (s !== "yes") return live && setSupport(s);
      try {
        const reg = await navigator.serviceWorker.register(SW, { scope: "/savvy-hq/", updateViaCache: "none" });
        const sub = await reg.pushManager.getSubscription();
        const saved = sub ? await pushState(sub.endpoint) : null;
        if (!live) return;
        setBlocked(Notification.permission === "denied");
        setMode(saved);
        setSupport("yes");
      } catch {
        if (live) setSupport("no");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const choose = async (next: PushMode | null) => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (next === null) {
        if (sub) {
          const r = await stopPush(sub.endpoint);
          await sub.unsubscribe();
          toast(r.ok ? (r.message ?? "Off") : r.error);
        }
        setMode(null);
        return;
      }
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") {
          setBlocked(p === "denied");
          toast(p === "denied" ? "Notifications are blocked for this site. Allow them in your browser's site settings." : "Notifications weren't allowed.");
          return;
        }
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) });
      const r = await savePush(sub.toJSON(), next);
      toast(r.ok ? (r.message ?? "Saved") : r.error);
      if (r.ok) setMode(next);
    } catch {
      toast("Couldn't change notifications on this device. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const Icon = mode ? BellRing : support === "yes" && !blocked ? Bell : BellOff;
  const seg = "rounded-full border-2 px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
  const current = mode ?? "off";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={mode ? "Notifications: on" : "Notifications: off"}
        title="Notifications"
        className={cn("grid size-9 place-items-center rounded-full hover:bg-hq-side-2", mode && "text-lime")}
      >
        <Icon className="size-4" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Notifications">
        {support === "ios-install" ? (
          <div className="grid gap-2 text-sm">
            <p>On iPhone and iPad, HQ can notify you once it&apos;s on your Home Screen:</p>
            <ol className="list-decimal pl-5 text-slate">
              <li>Tap the Share button in Safari.</li>
              <li>Choose Add to Home Screen, then Add.</li>
              <li>Open DSS HQ from your Home Screen, go to Messages and tap the bell again.</li>
            </ol>
          </div>
        ) : support === "no" ? (
          <p className="text-sm text-slate">This browser can&apos;t show notifications from HQ. Chrome, Edge, Firefox and Safari can.</p>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-slate">A notification on this device when someone posts in Messages, even with HQ closed. It&apos;s set for this device only, so your phone and laptop can differ.</p>
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold">On this device</legend>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["off", "Off"],
                    ...PUSH_MODES,
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy || support === "checking"}
                    aria-pressed={current === k}
                    onClick={() => current !== k && choose(k === "off" ? null : k)}
                    className={cn(seg, current === k ? "border-ink bg-ink text-white" : "border-ink/15")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-slate">Muted channels stay quiet unless someone mentions you.</p>
            {blocked && <p className="text-sm font-medium text-pink">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then try again.</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}
