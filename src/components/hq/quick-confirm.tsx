"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmQuickAction, type QuickResult } from "@/app/savvy-hq/act/[token]/actions";
import { btn } from "@/components/desk/ui";
import { cn } from "@/lib/utils";

export function QuickConfirm({ token, label }: { token: string; label: string }) {
  const [result, setResult] = useState<QuickResult | null>(null);
  const [pending, start] = useTransition();
  if (result)
    return (
      <div className="grid gap-3">
        <p role="status" className={cn("font-semibold", result.ok ? "text-ink" : "text-pink")}>
          {result.message}
        </p>
        <p className="text-sm text-slate">You can close this page, or open HQ.</p>
        <Link href="/savvy-hq/today/end" className={cn(btn.base, btn.plain, "justify-self-start")}>
          Open End of day in HQ
        </Link>
      </div>
    );
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => setResult(await confirmQuickAction(token)))} className={cn(btn.base, btn.primary, "min-h-11 justify-self-start")}>
      {pending ? "Saving…" : label}
    </button>
  );
}
