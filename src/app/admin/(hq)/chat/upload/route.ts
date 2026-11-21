import { randomBytes } from "node:crypto";
import { currentUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { MAX_FILE, filesOn, okType, putFile } from "@/lib/hq/storage";

// One file for a message, uploaded before it's sent. Returns the key the message stores.

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !canUse(user.roles, "chat")) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (!filesOn()) return Response.json({ error: "File sharing isn't set up yet." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file came through." }, { status: 400 });
  if (file.size > MAX_FILE) return Response.json({ error: `${file.name} is over 4 MB.` }, { status: 413 });
  const type = file.type || "application/octet-stream";
  if (!okType(type)) return Response.json({ error: `${file.name}: that file type can't be shared here.` }, { status: 415 });
  const ext = (file.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "").toLowerCase();
  const key = `chat/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("base64url")}${ext}`;
  await putFile(key, new Uint8Array(await file.arrayBuffer()), type);
  return Response.json({ key, name: file.name.slice(0, 200), type, size: file.size });
}
