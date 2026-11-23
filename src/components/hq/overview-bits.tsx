"use client";

import { clearBlocker } from "@/app/savvy-hq/(hq)/today/actions";
import { Button } from "@/components/desk/ui";
import { useRun } from "./kit";

/** Lets the owner mark someone's blocker as handled, so it leaves the list. */
export function ClearBlocker({ userId }: { userId: number }) {
  const { run, pending } = useRun();
  return (
    <Button size="sm" disabled={pending} onClick={() => run(() => clearBlocker(userId))}>
      Handled
    </Button>
  );
}
