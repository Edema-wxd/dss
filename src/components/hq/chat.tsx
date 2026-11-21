"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, CornerUpLeft, FileText, ListTodo, MoreHorizontal, Paperclip, Pencil, Pin, Plus, Search, Settings2, SmilePlus, Trash2, X } from "lucide-react";
import {
  type ChannelLoad,
  deleteMessage,
  editMessage,
  gotIt,
  markRead,
  messageToTask,
  openChannel,
  poll,
  react,
  saveChannel,
  saveLook,
  sendMessage,
  setMute,
  togglePin,
} from "@/app/admin/(hq)/chat/actions";
import type { ActionResult } from "@/app/admin/actions";
import { Button, Field, fieldClass, useToast } from "@/components/desk/ui";
import {
  CHAT_COLORS,
  CHAT_WALLS,
  CH_EMOJI,
  type Channel,
  type ChatFile,
  EMOJI_SET,
  type Look,
  type Message,
  QUICK_REACT,
  TEXT_SIZES,
  channelColor,
  colorOf,
  emojiOnly,
  fsize,
  plainOf,
  tokenize,
} from "@/lib/hq/chat-model";
import type { Member } from "@/lib/hq/chat";
import { cn } from "@/lib/utils";
import { Avatar, Dialog } from "./kit";

const LAGOS = "Africa/Lagos";
const dayOf = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS }).format(new Date(at));
const hhmm = (at: string) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LAGOS });
const first = (n: string) => n.split(" ")[0] || n;
function dayLabel(d: string, today: string) {
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (d === today) return "Today";
  if (d === y.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" });
}
function ago(at: string) {
  const m = Math.round((Date.now() - Date.parse(at)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
const presence = (m: Member) => {
  const base = m.day === "break" ? "On a break" : m.day === "in" ? "Clocked in" : m.day === "out" ? "Finished for the day" : "Away";
  return m.look?.status ? `${base} · ${m.look.status}` : base;
};
const DOT: Record<string, string> = { in: "bg-[#1e9e5a]", break: "bg-orange", out: "bg-slate", "": "bg-ink/20" };

const WALL: Record<string, React.CSSProperties> = {
  paper: { background: "#fff8f2" },
  dots: { backgroundColor: "#fff8f2", backgroundImage: "radial-gradient(#ec176322 2px, transparent 2.5px)", backgroundSize: "22px 22px" },
  grid: {
    backgroundColor: "#fffdf8",
    backgroundImage: "linear-gradient(#5568af1a 1px, transparent 1px), linear-gradient(90deg, #5568af1a 1px, transparent 1px)",
    backgroundSize: "24px 24px",
  },
  confetti: {
    backgroundColor: "#fff8f2",
    backgroundImage:
      "radial-gradient(#ec176333 3px, transparent 3.5px), radial-gradient(#cdd62955 3px, transparent 3.5px), radial-gradient(#5568af33 2.5px, transparent 3px)",
    backgroundSize: "60px 60px, 44px 44px, 36px 36px",
    backgroundPosition: "0 0, 20px 14px, 8px 30px",
  },
  night: { background: "#201c2b" },
};
/** Unsent text per channel, kept while you switch channels. */
const DRAFTS = new Map<string, string>();
const SIZE: Record<string, string> = { s: "text-[13px]", m: "text-[15px]", l: "text-[17px]" };

/** Runs an action; toasts errors (and the message, when the action gives one). */
function useAct() {
  const toast = useToast();
  return useCallback(
    async <R extends ActionResult>(fn: () => Promise<R>) => {
      try {
        const r = await fn();
        if (!r.ok) toast(r.error);
        else if (r.message) toast(r.message);
        return r;
      } catch {
        toast("Something went wrong. Check your connection and try again.");
        return null;
      }
    },
    [toast],
  );
}

type Me = { id: number; name: string; admin: boolean; poster: boolean; owner: boolean; tasks: boolean };
type Props = { me: Me; today: string; members: Member[]; look: Look; filesOn: boolean; initial: ChannelLoad | null; channels: Channel[] };
type Pending = { name: string; type: string; size: number; state: "up" | "ok" | "err"; key?: string };

export function ChatView({ me, today, members, look: look0, filesOn, initial, channels: channels0 }: Props) {
  const act = useAct();
  const toast = useToast();
  const router = useRouter();
  const [channels, setChannels] = useState(channels0);
  const [conv, setConv] = useState<string | null>(initial?.channel ?? null);
  const [msgs, setMsgs] = useState<Message[]>(initial?.messages ?? []);
  const [readAt0, setReadAt0] = useState(initial?.readAt ?? "");
  const [open, setOpen] = useState(!!initial);
  const [q, setQ] = useState("");
  const [find, setFind] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [look, setLook] = useState<Look>(look0 ?? {});
  const [lookOpen, setLookOpen] = useState(false);
  const [chForm, setChForm] = useState<Partial<Channel> | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const jump = useRef(true);

  const ch = channels.find((c) => c.id === conv) ?? null;
  const lookOf = (id: number | null) => (id === me.id ? look : members.find((m) => m.id === id)?.look);
  const nameOf = (id: number | null) => members.find((m) => m.id === id)?.name ?? (id === me.id ? me.name : "Someone");
  const since = useMemo(() => msgs.reduce((a, m) => (m.updatedAt > a ? m.updatedAt : a), ""), [msgs]);
  const unread = channels.filter((c) => !c.archived && !c.muted && c.unread).length;

  const merge = useCallback((changed: Message[]) => {
    if (!changed.length) return;
    setMsgs((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of changed) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    });
  }, []);

  // poll every few seconds while the page is in view
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await poll(conv, since);
        if (stop) return;
        merge(r.changed);
        setChannels(r.channels);
      } catch {
        /* offline for a moment: try again next tick */
      }
    };
    const t = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [conv, since, merge]);

  // mark the open channel read up to its newest message
  const lastAt = msgs.length ? msgs[msgs.length - 1].at : "";
  useEffect(() => {
    if (!conv || !lastAt || !ch || (ch.readAt && ch.readAt >= lastAt)) return;
    const t = setTimeout(() => {
      if (document.hidden) return;
      const wasUnread = ch.unread && !ch.muted;
      markRead(conv, lastAt).then(() => wasUnread && router.refresh()); // the nav's unread badge
      setChannels((cs) => cs.map((c) => (c.id === conv ? { ...c, readAt: lastAt, unread: false, mentioned: false } : c)));
    }, 700);
    return () => clearTimeout(t);
  }, [conv, lastAt, ch, router]);

  // stay at the bottom when new messages arrive, unless you've scrolled up to read
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (jump.current || el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTop = el.scrollHeight;
      // and again once fonts and pictures have settled the height
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
      setTimeout(() => (el.scrollTop = el.scrollHeight), 250);
    }
    jump.current = false;
  }, [msgs, conv]);

  async function go(id: string) {
    setOpen(true);
    if (id === conv) return;
    setReply(null);
    setEdit(null);
    setSel(null);
    setFind(null);
    const r = await openChannel(id);
    if (!r) return toast("That channel is gone.");
    jump.current = true;
    setConv(id);
    setMsgs(r.messages);
    setReadAt0(r.readAt);
    setChannels(r.channels);
    window.history.replaceState(null, "", `/admin/chat?c=${encodeURIComponent(id)}`);
  }

  const shown = find ? msgs.filter((m) => m.text.toLowerCase().includes(find.toLowerCase())) : msgs;
  const canAct = (m: Message) => m.by === me.id || me.admin;
  const visible = channels.filter((c) => !c.archived && (!q || c.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div
      className={cn(
        "grid h-[calc(100dvh-205px)] min-h-[460px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[22px] border-2 border-ink bg-white lg:h-[calc(100dvh-190px)] lg:grid-cols-[260px_minmax(0,1fr)]",
      )}
    >
      {/* channel list */}
      <aside aria-label="Channels" className={cn("min-h-0 flex-col gap-2 overflow-y-auto bg-hq-side p-3 text-cream", open ? "hidden lg:flex" : "flex")}>
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1">
            <b className="block font-display text-lg">Messages</b>
            <small className="text-xs text-hq-muted">{unread ? `${unread} unread` : "You're all caught up"}</small>
          </div>
          <button type="button" onClick={() => setLookOpen(true)} aria-label="Colours and wallpaper" className="grid size-9 place-items-center rounded-full hover:bg-hq-side-2">
            <Settings2 className="size-4" aria-hidden />
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-hq-side-2 px-3 py-2">
          <Search className="size-4 text-hq-muted" aria-hidden />
          <span className="sr-only">Search channels</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-hq-muted" />
        </label>
        <div className="flex items-center justify-between px-1 pt-1 text-xs font-bold tracking-[0.08em] text-hq-muted uppercase">
          <span>Channels</span>
          <button type="button" onClick={() => setChForm({})} aria-label="New channel" className="grid size-7 place-items-center rounded-full hover:bg-hq-side-2">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <nav className="grid gap-0.5">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.id)}
              aria-current={c.id === conv ? "true" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[15px] hover:bg-hq-side-2",
                c.id === conv && "bg-cream text-ink hover:bg-cream",
                c.unread && !c.muted && c.id !== conv && "font-bold text-white",
              )}
            >
              <span className="grid size-8 flex-none place-items-center rounded-lg text-base" style={{ background: channelColor(c.color) }} aria-hidden>
                {c.emoji || "#"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {c.name}
                {c.announce && <span className="sr-only"> (announcements)</span>}
              </span>
              {c.muted && <span title="Muted">🔕</span>}
              {c.mentioned && !c.muted ? (
                <span className="grid size-5 place-items-center rounded-full bg-pink text-[11px] font-bold text-white" aria-label="You were mentioned">
                  @
                </span>
              ) : c.unread && !c.muted ? (
                <span className="size-2.5 rounded-full bg-pink" aria-label="Unread" />
              ) : null}
            </button>
          ))}
          {!visible.length && <p className="px-2 py-2 text-xs text-hq-muted">No channels match.</p>}
        </nav>
      </aside>

      {/* the conversation */}
      <section className={cn("min-h-0 flex-col", open ? "flex" : "hidden lg:flex")}>
        {!ch ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-slate">
            <span>
              <b className="block text-ink">Pick a channel.</b>Channels are open to the whole team.
            </span>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2.5 border-b-2 border-ink/10 px-3 py-2.5">
              <button type="button" onClick={() => setOpen(false)} aria-label="Back to channels" className="grid size-9 place-items-center rounded-full hover:bg-cream lg:hidden">
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <span className="grid size-10 flex-none place-items-center rounded-xl text-lg" style={{ background: channelColor(ch.color) }} aria-hidden>
                {ch.emoji || "#"}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">{ch.name}</h2>
                <p className="truncate text-xs text-slate">{ch.description || (ch.announce ? "Announcements from the owner and admins" : "Everyone on the team")}</p>
              </div>
              {find !== null && (
                <input
                  autoFocus
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Find in this channel"
                  aria-label="Find in this channel"
                  className={cn(fieldClass, "hidden w-48 py-1 text-sm sm:block")}
                />
              )}
              <button
                type="button"
                onClick={() => setFind(find === null ? "" : null)}
                aria-label={find === null ? "Find in channel" : "Close find"}
                className="grid size-9 place-items-center rounded-full border-2 border-ink/15 hover:border-ink"
              >
                {find === null ? <Search className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
              </button>
              <button type="button" onClick={() => setPanel(true)} aria-label="Details, pinned and files" className="grid size-9 place-items-center rounded-full border-2 border-ink/15 hover:border-ink">
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </header>
            {find !== null && (
              <div className="border-b border-ink/10 px-3 py-2 sm:hidden">
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in this channel" aria-label="Find in this channel" className={cn(fieldClass, "py-1 text-sm")} />
              </div>
            )}
            <PinBar ch={ch} msgs={msgs} nameOf={nameOf} />
            <div ref={logRef} role="log" aria-live="polite" aria-label={`Messages in ${ch.name}`} className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3", SIZE[look.size ?? "m"])} style={WALL[look.wall ?? "paper"]}>
              {!shown.length ? (
                <div className="grid h-full place-items-center text-center">
                  <span className={cn("grid max-w-[40ch] gap-1 text-sm", look.wall === "night" ? "text-cream/80" : "text-slate")}>
                    {find ? (
                      <b>No messages match &ldquo;{find}&rdquo;.</b>
                    ) : (
                      <>
                        <span className="text-4xl">{ch.emoji || "✨"}</span>
                        <b className={look.wall === "night" ? "text-cream" : "text-ink"}>This is the start of {ch.name}.</b>
                        Post an update, share a win, or @mention a teammate.
                      </>
                    )}
                  </span>
                </div>
              ) : (
                shown.map((m, i) => {
                  const prev = shown[i - 1];
                  const d = dayOf(m.at);
                  const newDay = !prev || dayOf(prev.at) !== d;
                  const newLine = !find && readAt0 && m.at > readAt0 && m.by !== me.id && (!prev || prev.at <= readAt0 || prev.by === me.id) && !shown.slice(0, i).some((x) => x.at > readAt0 && x.by !== me.id);
                  const cont = !newDay && !newLine && prev && prev.by === m.by && !m.reply && !prev.sys && Date.parse(m.at) - Date.parse(prev.at) < 5 * 60e3;
                  return (
                    <Fragment key={m.id}>
                      {newDay && <Divider label={dayLabel(d, today)} night={look.wall === "night"} />}
                      {newLine && <Divider label="New messages" accent />}
                      <MessageRow
                        m={m}
                        me={me}
                        cont={!!cont}
                        ch={ch}
                        msgs={msgs}
                        sel={sel === m.id}
                        nameOf={nameOf}
                        lookOf={lookOf}
                        members={members}
                        filesOn={filesOn}
                        night={look.wall === "night"}
                        onSelect={() => setSel(sel === m.id ? null : m.id)}
                        onReact={(e) => (setSel(null), act(() => react(ch.id, m.id, e)).then(() => poll(conv, since).then((p) => merge(p.changed))))}
                        onMore={() => setMore(m.id)}
                        onReply={() => (setReply(m.id), setEdit(null), setSel(null), document.getElementById("ch-input")?.focus())}
                        onTask={me.tasks ? () => (setSel(null), act(() => messageToTask(ch.id, m.id))) : undefined}
                        onPin={canAct(m) ? () => (setSel(null), act(() => togglePin(ch.id, m.id)).then(() => poll(conv, since).then((p) => setChannels(p.channels)))) : undefined}
                        onEdit={m.by === me.id && !m.deleted ? () => (setEdit(m.id), setReply(null), setSel(null)) : undefined}
                        onDelete={canAct(m) && !m.deleted ? () => (setSel(null), setDel(m.id)) : undefined}
                        onAck={() => act(() => gotIt(ch.id, m.id)).then(() => poll(conv, since).then((p) => merge(p.changed)))}
                        onJump={jumpTo}
                      />
                    </Fragment>
                  );
                })
              )}
            </div>
            <Composer
              key={`${ch.id}:${edit ?? ""}`}
              ch={ch}
              me={me}
              members={members}
              look={look}
              filesOn={filesOn}
              msgs={msgs}
              reply={reply}
              edit={edit}
              draft={DRAFTS.get(ch.id) ?? ""}
              onDraft={(t) => DRAFTS.set(ch.id, t)}
              nameOf={nameOf}
              onCancel={() => (setReply(null), setEdit(null))}
              onEditLast={() => {
                const m = [...msgs].reverse().find((x) => x.by === me.id && !x.deleted && !x.sys);
                if (m) setEdit(m.id);
              }}
              onSent={(m) => {
                jump.current = true;
                setReply(null);
                setEdit(null);
                if (m) merge([m]);
                else poll(conv, since).then((p) => merge(p.changed));
              }}
            />
          </>
        )}
      </section>

      {ch && (
        <Dialog open={panel} onClose={() => setPanel(false)} title={ch.name} side>
          <Details
            ch={ch}
            me={me}
            msgs={msgs}
            members={members}
            nameOf={nameOf}
            onEdit={() => (setPanel(false), setChForm(ch))}
            onMute={() => act(() => setMute(ch.id, !ch.muted)).then((r) => r?.ok && setChannels((cs) => cs.map((c) => (c.id === ch.id ? { ...c, muted: !c.muted } : c))))}
            onJump={(id) => (setPanel(false), jumpTo(id))}
          />
        </Dialog>
      )}
      <Dialog open={!!more} onClose={() => setMore(null)} title="React">
        <EmojiGrid onPick={(e) => (ch && more && act(() => react(ch.id, more, e)).then(() => poll(conv, since).then((p) => merge(p.changed))), setMore(null))} />
      </Dialog>
      <Dialog open={!!del} onClose={() => setDel(null)} title="Delete this message?">
        <p className="text-sm">It&apos;s replaced with &ldquo;Message deleted&rdquo; for everyone.</p>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={() => setDel(null)}>
            Keep it
          </Button>
          <Button
            tone="primary"
            onClick={async () => {
              if (ch && del) await act(() => deleteMessage(ch.id, del));
              setDel(null);
              poll(conv, since).then((p) => merge(p.changed));
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
      <ChannelDialog
        c={chForm}
        me={me}
        onClose={() => setChForm(null)}
        onSaved={async (id) => {
          setChForm(null);
          const p = await poll(null, "");
          setChannels(p.channels);
          if (id && p.channels.find((x) => x.id === id && !x.archived)) go(id);
          else if (id === conv) setConv(null);
        }}
      />
      <LookDialog
        open={lookOpen}
        look={look}
        me={me}
        onClose={() => setLookOpen(false)}
        onSave={async (l) => {
          if ((await act(() => saveLook(l)))?.ok) setLook(l);
        }}
      />
    </div>
  );

  function jumpTo(id: string) {
    const el = document.getElementById(`m-${id}`);
    if (!el) return toast("That message is further back than this view goes.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-pink");
    setTimeout(() => el.classList.remove("ring-2", "ring-pink"), 1600);
  }
}

function Divider({ label, accent, night }: { label: string; accent?: boolean; night?: boolean }) {
  return (
    <div className="my-3 flex items-center gap-3 text-xs font-bold" role="separator">
      <i className={cn("h-px flex-1", accent ? "bg-pink" : night ? "bg-cream/20" : "bg-ink/15")} />
      <span className={cn("rounded-full px-2.5 py-0.5", accent ? "bg-pink text-white" : night ? "bg-cream/10 text-cream" : "bg-white text-slate")}>{label}</span>
      <i className={cn("h-px flex-1", accent ? "bg-pink" : night ? "bg-cream/20" : "bg-ink/15")} />
    </div>
  );
}

function PinBar({ ch, msgs, nameOf }: { ch: Channel; msgs: Message[]; nameOf: (id: number | null) => string }) {
  const pins = ch.pins.map((id) => msgs.find((m) => m.id === id)).filter((m): m is Message => !!m && !m.deleted);
  if (!pins.length) return null;
  const m = pins[pins.length - 1];
  return (
    <button
      type="button"
      onClick={() => document.getElementById(`m-${m.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
      className="flex items-center gap-2 border-b border-ink/10 bg-lime/30 px-3 py-1.5 text-left text-sm"
    >
      <Pin className="size-3.5 flex-none" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <b>{pins.length > 1 ? `${pins.length} pinned` : "Pinned"}</b> · {first(nameOf(m.by))}: {plainOf(m.text || m.files[0]?.name || "Attachment").slice(0, 120)}
      </span>
    </button>
  );
}

function Rich({ text, members, me }: { text: string; members: Member[]; me: Me }) {
  const tokens = tokenize(
    text,
    members.map((m) => m.name),
    me.name,
  );
  return (
    <>
      {tokens.map((t, i) =>
        t.t === "text" ? (
          <Fragment key={i}>{t.v}</Fragment>
        ) : t.t === "br" ? (
          <br key={i} />
        ) : t.t === "b" ? (
          <b key={i}>{t.v}</b>
        ) : t.t === "i" ? (
          <i key={i}>{t.v}</i>
        ) : t.t === "s" ? (
          <s key={i}>{t.v}</s>
        ) : t.t === "code" ? (
          <code key={i} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">
            {t.v}
          </code>
        ) : t.t === "link" ? (
          <a key={i} href={t.v} target="_blank" rel="noopener noreferrer" className="underline [overflow-wrap:anywhere]">
            {t.v.length > 60 ? `${t.v.slice(0, 57)}…` : t.v}
          </a>
        ) : (
          <span key={i} className={cn("rounded px-0.5 font-semibold", t.me ? "bg-lime text-ink" : "bg-black/10")}>
            {t.v}
          </span>
        ),
      )}
    </>
  );
}

type RowProps = {
  m: Message;
  me: Me;
  cont: boolean;
  ch: Channel;
  msgs: Message[];
  sel: boolean;
  nameOf: (id: number | null) => string;
  lookOf: (id: number | null) => Look | undefined;
  members: Member[];
  filesOn: boolean;
  night: boolean;
  onSelect: () => void;
  onReact: (e: string) => void;
  onMore: () => void;
  onReply: () => void;
  onTask?: () => void;
  onPin?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAck: () => void;
  onJump: (id: string) => void;
};

function MessageRow({ m, me, cont, ch, msgs, sel, nameOf, lookOf, members, filesOn, night, onSelect, onReact, onMore, onReply, onTask, onPin, onEdit, onDelete, onAck, onJump }: RowProps) {
  const mine = m.by === me.id;
  const [, label, bg, fg] = colorOf(lookOf(m.by), m.by);
  const name = nameOf(m.by);
  if (m.sys) return <p className={cn("my-2 text-center text-xs", night ? "text-cream/70" : "text-slate")}>{m.text}</p>;
  const rp = m.reply ? msgs.find((x) => x.id === m.reply) : null;
  const big = !rp && !m.files.length && !m.deleted && emojiOnly(m.text);
  const reactions = Object.entries(m.reactions).filter(([, a]) => a.length);
  const pinned = ch.pins.includes(m.id);
  const ib = "grid size-8 place-items-center rounded-full hover:bg-cream";
  return (
    <div id={`m-${m.id}`} className={cn("group relative flex gap-2 rounded-2xl px-1", cont ? "mt-0.5" : "mt-3", mine && "flex-row-reverse", sel && "bg-ink/5")}>
      {!mine && <div className="w-8 flex-none">{!cont && <Avatar name={name} />}</div>}
      <div className={cn("flex min-w-0 max-w-[min(560px,82%)] flex-col", mine && "items-end")}>
        {!cont && !mine && (
          <p className={cn("mb-0.5 text-xs font-bold", night ? "text-cream" : "text-ink")}>
            {name} <span className="sr-only">· bubble {label}</span>
          </p>
        )}
        <div onClick={onSelect} className="cursor-default">
          {m.deleted ? (
            <p className={cn("rounded-2xl border-2 border-dashed px-3 py-1.5 text-sm italic", night ? "border-cream/30 text-cream/70" : "border-ink/20 text-slate")}>Message deleted</p>
          ) : big ? (
            <p className="text-4xl leading-tight">{m.text}</p>
          ) : (
            <div className={cn("rounded-[18px] px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,.08)]", mine ? "rounded-br-md" : "rounded-bl-md")} style={{ background: bg, color: fg }}>
              {rp && (
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), onJump(rp.id))}
                  className="mb-1.5 block w-full rounded-lg border-l-4 bg-black/10 px-2 py-1 text-left text-xs"
                  style={{ borderColor: colorOf(lookOf(rp.by), rp.by)[2] === bg ? "currentColor" : colorOf(lookOf(rp.by), rp.by)[2] }}
                >
                  <b className="block">{rp.by === me.id ? "You" : first(nameOf(rp.by))}</b>
                  <span className="line-clamp-2 opacity-80">{rp.deleted ? "Message deleted" : plainOf(rp.text || rp.files[0]?.name || "Attachment").slice(0, 160)}</span>
                </button>
              )}
              {m.files.map((f, i) => (
                <FileChip key={i} f={f} href={`/admin/chat/file?c=${encodeURIComponent(ch.id)}&m=${encodeURIComponent(m.id)}&i=${i}`} usable={filesOn && f.key?.startsWith("chat/")} />
              ))}
              {m.text && (
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  <Rich text={m.text} members={members} me={me} />
                </p>
              )}
              <span className="mt-0.5 block text-right text-[11px] opacity-70">
                {pinned && "📌 "}
                {m.edited && "edited · "}
                {hhmm(m.at)}
              </span>
            </div>
          )}
        </div>
        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map(([e, who]) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                aria-pressed={who.includes(me.id)}
                title={who.map((id) => first(nameOf(id))).join(", ")}
                aria-label={`${e} ${who.length}, from ${who.map((id) => first(nameOf(id))).join(", ")}`}
                className={cn("rounded-full border-2 bg-white px-2 py-0.5 text-xs font-semibold text-ink", who.includes(me.id) ? "border-ink" : "border-ink/15")}
              >
                {e} {who.length}
              </button>
            ))}
          </div>
        )}
        {ch.announce && !m.deleted && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {m.acks.includes(me.id) ? (
              <span className="rounded-full bg-[#e0f1e7] px-2 py-0.5 font-semibold text-[#1e7a4c]">✓ Got it</span>
            ) : (
              !mine && (
                <Button size="sm" onClick={onAck}>
                  ✓ Got it
                </Button>
              )
            )}
            {(mine || me.owner) && (
              <span className={night ? "text-cream/70" : "text-slate"} title={m.acks.map((id) => first(nameOf(id))).join(", ")}>
                Seen by {m.acks.length} of {Math.max(0, members.length - 1)}
              </span>
            )}
          </div>
        )}
      </div>
      {!m.deleted && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={cn(
            "absolute -top-4 z-10 items-center gap-0.5 rounded-full border-2 border-ink bg-white p-0.5 text-ink shadow-md",
            mine ? "left-1" : "right-1",
            sel ? "flex" : "hidden group-focus-within:flex group-hover:flex",
          )}
        >
          {QUICK_REACT.slice(0, 5).map((e) => (
            <button key={e} type="button" onClick={() => onReact(e)} aria-label={`React ${e}`} className={cn(ib, "text-base")}>
              {e}
            </button>
          ))}
          <button type="button" onClick={onMore} aria-label="More reactions" className={ib}>
            <SmilePlus className="size-4" aria-hidden />
          </button>
          <i className="mx-0.5 h-5 w-px bg-ink/15" />
          <button type="button" onClick={onReply} aria-label="Reply" title="Reply" className={ib}>
            <CornerUpLeft className="size-4" aria-hidden />
          </button>
          {onTask && (
            <button type="button" onClick={onTask} aria-label="Make it a task" title="Make it a task" className={ib}>
              <ListTodo className="size-4" aria-hidden />
            </button>
          )}
          {onPin && (
            <button type="button" onClick={onPin} aria-label={pinned ? "Unpin" : "Pin"} title={pinned ? "Unpin" : "Pin"} className={ib}>
              <Pin className="size-4" aria-hidden />
            </button>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label="Edit" title="Edit" className={ib}>
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} aria-label="Delete" title="Delete" className={cn(ib, "text-[#c42b3c]")}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FileChip({ f, href, usable }: { f: ChatFile; href: string; usable: boolean }) {
  if (!usable)
    return (
      <span className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 text-xs" title="This file came from the old HQ and wasn't carried over">
        <FileText className="size-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        <span className="opacity-70">not carried over</span>
      </span>
    );
  if (/^image\//.test(f.type))
    return (
      <a href={href} target="_blank" rel="noopener" className="mb-1 block overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not an optimisable asset */}
        <img src={href} alt={f.name} loading="lazy" className="max-h-64 w-auto max-w-full" />
      </a>
    );
  return (
    <a href={href} target="_blank" rel="noopener" className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 text-sm">
      <FileText className="size-4 flex-none" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{f.name}</span>
      <span className="text-xs opacity-70">{fsize(f.size)}</span>
    </a>
  );
}

/* ── Writing a message ───────────────────────────────────────────────── */

type ComposerProps = {
  ch: Channel;
  me: Me;
  members: Member[];
  look: Look;
  filesOn: boolean;
  msgs: Message[];
  reply: string | null;
  edit: string | null;
  draft: string;
  onDraft: (t: string) => void;
  nameOf: (id: number | null) => string;
  onCancel: () => void;
  onEditLast: () => void;
  onSent: (m: Message | null) => void;
};

function Composer({ ch, me, members, look, filesOn, msgs, reply, edit, draft, onDraft, nameOf, onCancel, onEditLast, onSent }: ComposerProps) {
  const act = useAct();
  const toast = useToast();
  const editing = edit ? msgs.find((m) => m.id === edit) : null;
  const replying = reply ? msgs.find((m) => m.id === reply) : null;
  // keyed by the message being edited, so editing starts from that message's text
  const [text, setText] = useState(editing ? editing.text : draft);
  const [files, setFiles] = useState<Pending[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [ac, setAc] = useState<{ list: (Member | "everyone")[]; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (edit) ta.current?.focus();
  }, [edit]);
  useEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(160, t.scrollHeight)}px`;
  }, [text]);

  if (ch.announce && !me.poster)
    return (
      <p className="border-t-2 border-ink/10 px-4 py-3 text-sm text-slate">📣 Only the owner and admins post in {ch.name}. React or tap &ldquo;Got it&rdquo; to show you&apos;ve seen an announcement.</p>
    );

  const set = (t: string) => {
    setText(t);
    onDraft(t);
    const caret = ta.current?.selectionStart ?? t.length;
    const m = t.slice(0, caret).match(/(^|\s)@([\w ]{0,20})$/);
    if (!m) return setAc(null);
    const q = m[2].toLowerCase();
    const list: (Member | "everyone")[] = members.filter((p) => p.id !== me.id && p.name.toLowerCase().startsWith(q)).slice(0, 6);
    if (me.admin && "everyone".startsWith(q)) list.push("everyone");
    setAc(list.length ? { list, n: 0 } : null);
  };
  const pick = (who: Member | "everyone") => {
    const t = ta.current;
    const pos = t?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\w ]{0,20})$/, `@${who === "everyone" ? "everyone" : who.name} `);
    const next = before + text.slice(pos);
    setText(next);
    onDraft(next);
    setAc(null);
    requestAnimationFrame(() => {
      t?.focus();
      t?.setSelectionRange(before.length, before.length);
    });
  };

  async function upload(list: FileList | File[]) {
    if (!filesOn) return toast("File sharing isn't set up yet.");
    for (const file of [...list].slice(0, 6)) {
      const p: Pending = { name: file.name, type: file.type || "application/octet-stream", size: file.size, state: "up" };
      setFiles((fs) => [...fs, p]);
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/admin/chat/upload", { method: "POST", body: form }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (r?.ok) Object.assign(p, { state: "ok", key: j.key, type: j.type, size: j.size });
      else {
        p.state = "err";
        toast(j.error || `Couldn't upload ${file.name}.`);
      }
      setFiles((fs) => [...fs]);
    }
  }

  async function send() {
    if (busy) return;
    if (files.some((f) => f.state === "up")) return toast("Wait for your files to finish uploading.");
    const ok = files.filter((f) => f.state === "ok").map((f) => ({ key: f.key!, name: f.name, type: f.type, size: f.size }));
    if (!text.trim() && !ok.length) return;
    setBusy(true);
    const t = text;
    setText("");
    onDraft("");
    setAc(null);
    setEmoji(false);
    if (editing) {
      const r = await act(() => editMessage(ch.id, editing.id, t));
      if (!r?.ok) setText(t);
      else onSent(null);
    } else {
      const r = await act(() => sendMessage(ch.id, { text: t, reply, files: ok }));
      if (!r?.ok) setText(t);
      else {
        setFiles([]);
        onSent(r.msg ?? null);
      }
    }
    setBusy(false);
    ta.current?.focus();
  }

  const enterSends = look.enter !== "newline";
  return (
    <div className="relative border-t-2 border-ink/10 bg-white px-3 pt-2 pb-3">
      {(editing || replying) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-cream px-3 py-1.5 text-sm">
          {editing ? <Pencil className="size-4" aria-hidden /> : <CornerUpLeft className="size-4" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">
            {editing ? (
              "Editing your message"
            ) : (
              <>
                <b>Replying to {replying!.by === me.id ? "yourself" : first(nameOf(replying!.by))}</b> · {plainOf(replying!.text || replying!.files[0]?.name || "Attachment").slice(0, 100)}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              if (editing) setText("");
              onCancel();
            }}
            aria-label={editing ? "Cancel edit" : "Cancel reply"}
            className="grid size-7 place-items-center rounded-full hover:bg-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, n) => (
            <span key={n} className={cn("flex max-w-[220px] items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs", f.state === "err" ? "border-[#c42b3c] text-[#c42b3c]" : "border-ink/15")}>
              <FileText className="size-3.5 flex-none" aria-hidden />
              <span className="truncate">{f.name}</span>
              {f.state === "up" && <span className="text-slate">uploading…</span>}
              <button type="button" onClick={() => setFiles((fs) => fs.filter((_, i) => i !== n))} aria-label={`Remove ${f.name}`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {ac && (
        <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 mb-1 grid w-72 gap-0.5 rounded-2xl border-2 border-ink bg-white p-1 shadow-lg">
          {ac.list.map((u, n) => (
            <button
              key={u === "everyone" ? "everyone" : u.id}
              type="button"
              role="option"
              aria-selected={n === ac.n}
              onMouseDown={(e) => (e.preventDefault(), pick(u))}
              className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm", n === ac.n && "bg-cream")}
            >
              {u === "everyone" ? (
                <>
                  <span aria-hidden>📣</span> <b>@everyone</b> <span className="text-xs text-slate">Notify the whole team</span>
                </>
              ) : (
                <>
                  <Avatar name={u.name} /> <b>{u.name}</b> <span className="truncate text-xs text-slate">{u.roles.join(", ")}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button type="button" onClick={() => setEmoji(!emoji)} aria-label="Emoji" aria-expanded={emoji} className="grid size-10 flex-none place-items-center rounded-full text-xl hover:bg-cream">
          😊
        </button>
        <button
          type="button"
          onClick={() => (filesOn ? fileIn.current?.click() : toast("File sharing turns on once file storage is set up."))}
          aria-label="Attach a file"
          title={filesOn ? "Attach a photo or file (up to 4 MB)" : "File sharing turns on once file storage is set up"}
          className={cn("grid size-10 flex-none place-items-center rounded-full hover:bg-cream", !filesOn && "opacity-40")}
        >
          <Paperclip className="size-5" aria-hidden />
        </button>
        <input ref={fileIn} type="file" multiple hidden onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ""))} />
        <textarea
          id="ch-input"
          ref={ta}
          rows={1}
          value={text}
          onChange={(e) => set(e.target.value)}
          onPaste={(e) => {
            const fs = [...(e.clipboardData?.files ?? [])];
            if (fs.length) {
              e.preventDefault();
              upload(fs);
            }
          }}
          onKeyDown={(e) => {
            if (ac) {
              if (e.key === "ArrowDown") return (e.preventDefault(), setAc({ ...ac, n: (ac.n + 1) % ac.list.length }));
              if (e.key === "ArrowUp") return (e.preventDefault(), setAc({ ...ac, n: (ac.n - 1 + ac.list.length) % ac.list.length }));
              if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), pick(ac.list[ac.n]));
              if (e.key === "Escape") return setAc(null);
            }
            if (e.key === "Enter" && !e.nativeEvent.isComposing && (enterSends ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape" && (reply || edit)) {
              if (edit) setText("");
              onCancel();
            } else if (e.key === "ArrowUp" && !text) {
              e.preventDefault();
              onEditLast();
            }
          }}
          placeholder={`Message ${ch.name}`}
          aria-label="Write a message"
          enterKeyHint="send"
          className="max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-2xl border-2 border-ink bg-white px-3 py-2 text-[15px] outline-none focus-visible:outline-3 focus-visible:outline-pink/40"
        />
        <button type="button" onClick={send} disabled={busy} aria-label={editing ? "Save edit" : "Send"} className="grid size-10 flex-none place-items-center rounded-full border-2 border-ink bg-pink text-white disabled:opacity-50">
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </div>
      {emoji && (
        <div className="mt-2">
          <EmojiGrid
            onPick={(e) => {
              const t = ta.current;
              const p = t?.selectionStart ?? text.length;
              const next = text.slice(0, p) + e + text.slice(p);
              setText(next);
              onDraft(next);
              requestAnimationFrame(() => {
                t?.focus();
                t?.setSelectionRange(p + e.length, p + e.length);
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function EmojiGrid({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div role="listbox" aria-label="Emoji" className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-0.5 overflow-y-auto">
      {EMOJI_SET.map((e) => (
        <button key={e} type="button" role="option" aria-selected={false} onClick={() => onPick(e)} className="grid size-9 place-items-center rounded-lg text-xl hover:bg-cream">
          {e}
        </button>
      ))}
    </div>
  );
}

/* ── Channel details ─────────────────────────────────────────────────── */

function Details({
  ch,
  me,
  msgs,
  members,
  nameOf,
  onEdit,
  onMute,
  onJump,
}: {
  ch: Channel;
  me: Me;
  msgs: Message[];
  members: Member[];
  nameOf: (id: number | null) => string;
  onEdit: () => void;
  onMute: () => void;
  onJump: (id: string) => void;
}) {
  const pins = ch.pins.map((id) => msgs.find((m) => m.id === id)).filter((m): m is Message => !!m && !m.deleted);
  const files = msgs
    .filter((m) => !m.deleted)
    .flatMap((m) => m.files.map((f, i) => ({ f, i, m })))
    .reverse()
    .slice(0, 30);
  const order: Record<string, number> = { in: 0, break: 1, out: 2, "": 3 };
  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-1 rounded-2xl p-4 text-center" style={{ background: `${channelColor(ch.color)}33` }}>
        <span className="text-4xl" aria-hidden>
          {ch.emoji || "#"}
        </span>
        <b className="font-display text-xl">{ch.name}</b>
        {ch.description && <span className="text-sm text-slate">{ch.description}</span>}
        <div className="mt-1 flex gap-2">
          {(me.owner || ch.createdBy === me.id) && (
            <Button size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden /> Edit
            </Button>
          )}
          <Button size="sm" onClick={onMute}>
            {ch.muted ? "🔔 Unmute" : "🔕 Mute"}
          </Button>
        </div>
      </div>
      <section>
        <h3 className="mb-1.5 text-sm font-bold">Pinned</h3>
        {pins.length ? (
          <ul className="grid gap-1">
            {pins.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onJump(m.id)} className="w-full rounded-xl px-2 py-1.5 text-left hover:bg-cream">
                  <span className="block truncate text-sm">{plainOf(m.text || m.files[0]?.name || "Attachment").slice(0, 90)}</span>
                  <span className="text-xs text-slate">
                    {first(nameOf(m.by))} · {ago(m.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate">Pin key messages so nobody has to scroll for them.</p>
        )}
      </section>
      <section>
        <h3 className="mb-1.5 text-sm font-bold">Shared files</h3>
        {files.length ? (
          <ul className="grid gap-1">
            {files.map(({ f, i, m }) => (
              <li key={`${m.id}-${i}`} className="flex items-center gap-2 text-sm">
                <FileText className="size-4 flex-none" aria-hidden />
                <a href={`/admin/chat/file?c=${encodeURIComponent(ch.id)}&m=${encodeURIComponent(m.id)}&i=${i}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate underline">
                  {f.name}
                </a>
                <span className="text-xs text-slate">{first(nameOf(m.by))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate">Files and photos shared here show up in this list.</p>
        )}
      </section>
      <section>
        <h3 className="mb-1.5 text-sm font-bold">Members · {members.length}</h3>
        <ul className="grid gap-1.5">
          {[...members]
            .sort((a, b) => order[a.day] - order[b.day] || a.name.localeCompare(b.name))
            .map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <span className="relative">
                  <Avatar name={m.name} />
                  <i className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white", DOT[m.day] ?? DOT[""])} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">
                    {m.name}
                    {m.id === me.id && " (you)"}
                  </b>
                  <span className="block truncate text-xs text-slate">{presence(m)}</span>
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function ChannelDialog({ c, me, onClose, onSaved }: { c: Partial<Channel> | null; me: Me; onClose: () => void; onSaved: (id: string | null) => void }) {
  const act = useAct();
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={!!c} onClose={onClose} title={c?.id ? "Edit channel" : "New channel"}>
      {c && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const f = Object.fromEntries(new FormData(e.currentTarget));
            const r = await act(() => saveChannel(c.id ?? null, f));
            setPending(false);
            if (r?.ok) onSaved(r.id ?? null);
          }}
        >
          {!c.id && <p className="text-sm text-slate">Channels are open to everyone on the team.</p>}
          <Field label="Name">
            <input name="name" required autoFocus maxLength={40} defaultValue={c.name ?? ""} placeholder="e.g. Talent desk, Content ideas" className={fieldClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Icon">
              <select name="emoji" defaultValue={c.emoji ?? "✨"} className={fieldClass}>
                {CH_EMOJI.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Colour">
              <select name="color" defaultValue={c.color ?? "sky"} className={fieldClass}>
                {CHAT_COLORS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="What's it for?">
            <input name="description" maxLength={140} defaultValue={c.description ?? ""} placeholder="One line so people know what to post here" className={fieldClass} />
          </Field>
          {me.admin && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="announce" defaultChecked={!!c.announce} className="accent-pink" /> Announcement channel: only the owner and admins post, everyone else taps Got it
            </label>
          )}
          {c.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="archived" defaultChecked={!!c.archived} className="accent-pink" /> Archive this channel (hide it from the list)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              {c.id ? "Save" : "Create channel"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function LookDialog({ open, look, me, onClose, onSave }: { open: boolean; look: Look; me: Me; onClose: () => void; onSave: (l: Look) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Make it yours">
      <LookForm look={look} me={me} onClose={onClose} onSave={onSave} />
    </Dialog>
  );
}

/** Mounted each time the dialog opens, so it starts from the saved look. */
function LookForm({ look, me, onClose, onSave }: { look: Look; me: Me; onClose: () => void; onSave: (l: Look) => void }) {
  const toast = useToast();
  const [l, setL] = useState<Look>(look);
  const [status, setStatus] = useState(look.status ?? "");
  const [, , bg, fg] = colorOf(l, me.id);
  const put = (p: Look) => {
    const next = { ...l, ...p };
    setL(next);
    onSave({ ...next, status });
  };
  const seg = "rounded-full border-2 px-3 py-1 text-sm font-semibold";
  return (
    <>
      <div className="grid gap-2 rounded-2xl p-3" style={WALL[l.wall ?? "paper"]}>
        <p className="w-fit max-w-[80%] rounded-[18px] rounded-bl-md bg-[#5568AF] px-3 py-2 text-sm text-cream">Morning team ☀️ Who&apos;s on the monthly report?</p>
        <p className="ml-auto w-fit max-w-[80%] rounded-[18px] rounded-br-md px-3 py-2 text-sm" style={{ background: bg, color: fg }}>
          On it, sending by noon ✅
        </p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">
          Your bubble colour <span className="font-normal text-slate">· everyone sees your messages in it</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {CHAT_COLORS.map(([k, label, c]) => (
            <button
              key={k}
              type="button"
              aria-label={label}
              aria-pressed={colorOf(l, me.id)[0] === k}
              onClick={() => put({ color: k })}
              className={cn("size-9 rounded-full border-2", colorOf(l, me.id)[0] === k ? "border-ink ring-2 ring-pink ring-offset-2" : "border-ink/20")}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">
          Wallpaper <span className="font-normal text-slate">· just for you</span>
        </legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {CHAT_WALLS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={(l.wall ?? "paper") === k}
              onClick={() => put({ wall: k })}
              className={cn("h-14 rounded-xl border-2 text-xs font-semibold", (l.wall ?? "paper") === k ? "border-ink" : "border-ink/20", k === "night" && "text-cream")}
              style={WALL[k]}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Text size</legend>
          <div className="flex gap-1.5">
            {TEXT_SIZES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={(l.size ?? "m") === k} onClick={() => put({ size: k })} className={cn(seg, (l.size ?? "m") === k ? "border-ink bg-ink text-white" : "border-ink/15")}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Enter key</legend>
          <div className="flex gap-1.5">
            {[
              ["send", "Sends"],
              ["newline", "New line"],
            ].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={(l.enter ?? "send") === k} onClick={() => put({ enter: k })} className={cn(seg, (l.enter ?? "send") === k ? "border-ink bg-ink text-white" : "border-ink/15")}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...l, status });
          toast(status.trim() ? "Status set." : "Status cleared.");
        }}
      >
        <Field label="Your status">
          <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={60} placeholder="e.g. 🎬 On a shoot till 3pm" className={fieldClass} />
        </Field>
        <Button type="submit">Set</Button>
      </form>
      <div className="flex justify-end">
        <Button tone="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}
