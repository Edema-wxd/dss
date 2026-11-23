import { currentUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { getMessage } from "@/lib/hq/chat";
import { fileUrl, filesOn } from "@/lib/hq/storage";

// Opens a file shared in a message: checks the person can read Messages, then sends them to a
// link that works for five minutes. /savvy-hq/chat/file?c=<channel>&m=<message>&i=<index>

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !canUse(user.roles, "chat")) return new Response("Not allowed", { status: 403 });
  const q = new URL(req.url).searchParams;
  const m = await getMessage(q.get("c") ?? "", q.get("m") ?? "");
  const f = m && !m.deleted ? m.files[Number(q.get("i")) || 0] : undefined;
  if (!f) return new Response("That file is gone.", { status: 404 });
  if (!f.key?.startsWith("chat/") || !filesOn()) return new Response("This file came from the old HQ and wasn't carried over.", { status: 410 });
  return Response.redirect(await fileUrl(f.key, f.name), 302);
}
