import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ChatView } from "@/components/hq/chat";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse, isOwner } from "@/lib/hq/access";
import * as chat from "@/lib/hq/chat";
import { chatAdmin, postsAnnouncements } from "@/lib/hq/chat-model";
import { ownerId } from "@/lib/hq/notify";
import { pushConfigured, vapidPublicKey } from "@/lib/hq/push";
import { filesOn } from "@/lib/hq/storage";
import { lagosToday } from "@/lib/hq/work";

export default function ChatPage({ searchParams }: PageProps<"/savvy-hq/chat">) {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-4 pb-24 lg:px-8 lg:pb-6">
      <Suspense fallback={<p className="p-10 text-center text-slate">Opening Messages…</p>}>
        <Chat searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Chat({ searchParams }: Pick<PageProps<"/savvy-hq/chat">, "searchParams">) {
  let props;
  try {
    await connection();
    const user = await requireModule("chat");
    // HQ's five channels, the first time anyone opens Messages
    await chat.seedChannels((await ownerId()) ?? user.id);
    const sp = await searchParams;
    const [channels, members] = await Promise.all([chat.listChannels(user.id), chat.listMembers()]);
    const live = channels.filter((c) => !c.archived);
    const pick = live.find((c) => c.id === sp.c) ?? live.find((c) => c.id === "general") ?? live[0];
    const messages = pick ? await chat.listMessages(pick.id) : [];
    props = {
      me: { id: user.id, name: user.name, admin: chatAdmin(user.roles), poster: postsAnnouncements(user.roles), owner: isOwner(user.roles), tasks: canUse(user.roles, "tasks") },
      today: lagosToday(),
      members,
      look: members.find((m) => m.id === user.id)?.look ?? {},
      filesOn: filesOn(),
      // the public half of the push key; empty when push isn't set up on this server
      pushKey: pushConfigured() ? vapidPublicKey() : "",
      channels,
      initial: pick ? { channel: pick.id, messages, readAt: pick.readAt, channels } : null,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <h1 className="sr-only">Messages</h1>
      <ChatView {...props} />
    </>
  );
}
