import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messages, channelsCatalog, sampleThread, ROLES, tenantManagers } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Hash, Lock, Send, Plus, Search, BellOff, Bell, Eye, ShieldCheck, MessageSquarePlus, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/messaging")({
  head: () => ({ meta: [{ title: "Messaging — WorkspaceOS" }] }),
  component: Messaging,
});

const STORAGE_SUBS = "woos.channelSubs";
const STORAGE_MUTES = "woos.channelMutes";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(window.localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
}
function writeSet(key: string, s: Set<string>) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify([...s]));
}

function Messaging() {
  const { role } = useRole();
  const allowed = useMemo(() => channelsCatalog.filter(c => c.allowedRoles.includes(role.id)), [role.id]);

  const [subs, setSubs] = useState<Set<string>>(() => {
    const s = readSet(STORAGE_SUBS);
    if (s.size === 0) allowed.forEach(c => s.add(c.name));
    return s;
  });
  const [mutes, setMutes] = useState<Set<string>>(() => readSet(STORAGE_MUTES));
  const [active, setActive] = useState(allowed[0]?.name ?? "");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const subscribed = allowed.filter(c => subs.has(c.name));
  const activeChannel = channelsCatalog.find(c => c.name === active);

  const toggleSub = (name: string) => {
    const next = new Set(subs);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSubs(next); writeSet(STORAGE_SUBS, next);
    toast.success(next.has(name) ? `Subscribed to #${name}` : `Unsubscribed from #${name}`);
  };
  const toggleMute = (name: string) => {
    const next = new Set(mutes);
    if (next.has(name)) next.delete(name); else next.add(name);
    setMutes(next); writeSet(STORAGE_MUTES, next);
  };
  const send = () => {
    if (!draft.trim()) return;
    toast.success(`Posted to #${active}`);
    setDraft("");
  };

  const channelIcon = (visibility: string) => visibility === "private" ? Lock : visibility === "restricted" ? ShieldCheck : Hash;

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Internal Communications"
        title="Messaging"
        description={`Private channels and DMs for management, exec and ops — separate from the tenant community. Viewing as ${role.title}.`}
        actions={
          <>
            <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Search className="size-3.5" />Browse channels</Button></DialogTrigger>
              <BrowseChannels allowed={allowed} subs={subs} onToggle={toggleSub} />
            </Dialog>
            <Dialog open={dmOpen} onOpenChange={setDmOpen}>
              <DialogTrigger asChild><Button size="sm" className="gap-1.5"><MessageSquarePlus className="size-4" />New DM</Button></DialogTrigger>
              <NewDmDialog onClose={() => setDmOpen(false)} />
            </Dialog>
          </>
        }
      />

      <div className="grid lg:grid-cols-[260px_1fr_280px] gap-4 h-[70vh] card-soft overflow-hidden">
        {/* Sidebar */}
        <aside className="border-r flex flex-col">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-8 h-8 text-sm bg-muted/40 border-transparent" />
            </div>
          </div>
          <div className="px-2 py-2 overflow-y-auto flex-1">
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Subscribed channels</div>
              <button onClick={() => setBrowseOpen(true)} className="text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /></button>
            </div>
            {subscribed.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No subscriptions yet. Browse channels.</div>}
            {subscribed.map((c) => {
              const Icon = channelIcon(c.visibility);
              const muted = mutes.has(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => setActive(c.name)}
                  className={`w-full group flex items-center justify-between px-2 py-1.5 rounded-md text-sm ${active === c.name ? "bg-brand-soft text-brand font-medium" : "hover:bg-muted/50"}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Icon className="size-3.5 shrink-0" />
                    <span className={muted ? "opacity-60" : ""}>{c.name}</span>
                  </span>
                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); toggleMute(c.name); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggleMute(c.name); } }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {muted ? <BellOff className="size-3" /> : <Bell className="size-3" />}
                    </span>
                  </TooltipTrigger><TooltipContent>{muted ? "Unmute" : "Mute"}</TooltipContent></Tooltip></TooltipProvider>
                </button>
              );
            })}
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-1.5 mt-3">Direct messages</div>
            {messages.map((m) => (
              <button key={m.id} className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 text-left">
                <div className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-medium shrink-0">{m.from.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="flex justify-between"><span className={`truncate text-xs ${m.unread ? "font-semibold" : ""}`}>{m.from}</span><span className="text-[10px] text-muted-foreground">{m.time}</span></div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.preview}</div>
                </div>
              </button>
            ))}

            <div className="flex items-center justify-between px-2 py-1.5 mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5"><Building2 className="size-3" />Tenant managers</div>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tenantManagers.length}</Badge>
            </div>
            {tenantManagers.map((t) => (
              <button key={t.id} className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 text-left">
                <div className="relative shrink-0">
                  <div className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand text-[10px] font-medium">{t.initials}</div>
                  {t.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success border-2 border-card" />}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="flex justify-between">
                    <span className={`truncate text-xs ${t.unread > 0 ? "font-semibold" : ""}`}>{t.name}</span>
                    <span className="text-[10px] text-muted-foreground">{t.lastTime}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.tenant} · {t.branch}</div>
                  <div className="truncate text-[11px] text-muted-foreground/80">{t.lastPreview}</div>
                </div>
                {t.unread > 0 && <Badge className="text-[9px] h-4 px-1.5">{t.unread}</Badge>}
              </button>
            ))}
          </div>
        </aside>

        {/* Thread */}
        <section className="flex flex-col min-w-0">
          {activeChannel ? (
            <>
              <div className="border-b px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => { const Icon = channelIcon(activeChannel.visibility); return <Icon className="size-4 text-brand shrink-0" />; })()}
                  <div className="font-display font-semibold truncate">{activeChannel.name}</div>
                  <Badge variant="outline" className="text-[10px]">{activeChannel.visibility} · {activeChannel.members} members</Badge>
                </div>
                <Button size="sm" variant={subs.has(activeChannel.name) ? "outline" : "default"} onClick={() => toggleSub(activeChannel.name)} className="h-7 text-[11px]">
                  {subs.has(activeChannel.name) ? "Unsubscribe" : "Subscribe"}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {sampleThread.map((m, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand text-xs font-medium">{m.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">{m.from}</span>
                        <span className="text-[11px] text-muted-foreground">{m.role}</span>
                        <span className="text-[11px] text-muted-foreground ml-auto">{m.time}</span>
                      </div>
                      <p className="text-sm text-foreground/90 mt-0.5">{m.text}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Eye className="size-3" />
                        <div className="flex -space-x-1.5">
                          {m.seenBy.slice(0, 4).map(s => (
                            <div key={s} className="size-5 rounded-full border-2 border-card bg-muted grid place-items-center text-[9px] font-medium">{s}</div>
                          ))}
                        </div>
                        <span>Seen by {m.seenBy.length}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-destructive/20" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-destructive">New</span>
                  <div className="flex-1 h-px bg-destructive/20" />
                </div>
              </div>
              <div className="border-t p-3">
                <div className="relative">
                  <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`Message #${active}`}
                    className="h-11 pr-12 bg-muted/30 border-transparent"
                  />
                  <Button size="icon" className="absolute right-1.5 top-1.5 size-8" onClick={send}><Send className="size-3.5" /></Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Select or subscribe to a channel</div>
          )}
        </section>

        {/* Right panel */}
        <aside className="border-l p-4 hidden lg:block overflow-y-auto">
          {activeChannel && (
            <>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">About</div>
              <p className="text-sm text-foreground/80 mb-4">{activeChannel.description}</p>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Access</div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {activeChannel.allowedRoles.map(rid => {
                  const r = ROLES.find(x => x.id === rid);
                  return <Badge key={rid} variant="outline" className="text-[10px]">{r?.title ?? rid}</Badge>;
                })}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Members ({activeChannel.members})</div>
              <div className="space-y-2">
                {["Anthony Manas", "Samantha Naidoo", "Naledi Khoza", "Pieter v.d. Merwe", "Regie Mthembu", "Lerato Pillay"].map(n => (
                  <div key={n} className="flex items-center gap-2 text-sm">
                    <div className="size-6 rounded-full bg-muted grid place-items-center text-[10px]">{n.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
                    {n}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function BrowseChannels({ allowed, subs, onToggle }: { allowed: typeof channelsCatalog; subs: Set<string>; onToggle: (n: string) => void }) {
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Browse channels</DialogTitle>
        <DialogDescription>Subscribe to channels available to your role. Restricted channels require role-based access.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {allowed.map(c => (
          <div key={c.name} className="flex items-start justify-between rounded-md border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">#{c.name}</span>
                <Badge variant="outline" className="text-[10px]">{c.visibility}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.members} members</div>
            </div>
            <Switch checked={subs.has(c.name)} onCheckedChange={() => onToggle(c.name)} />
          </div>
        ))}
      </div>
    </DialogContent>
  );
}

function NewDmDialog({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState<string[]>([]);
  const [text, setText] = useState("");
  const send = () => {
    if (to.length === 0 || !text.trim()) { toast.error("Pick a recipient and write a message."); return; }
    toast.success(`DM sent to ${to.length} member${to.length > 1 ? "s" : ""}`);
    onClose();
  };
  const internal = ROLES.filter(r => !["tenant-admin"].includes(r.id));
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New direct message</DialogTitle>
        <DialogDescription>Reach internal team members or tenant managers directly.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        <div>
          <Label className="text-xs mb-1.5 block">Office &amp; Co team</Label>
          <div className="flex flex-wrap gap-1.5">
            {internal.map(r => (
              <button
                key={r.id}
                onClick={() => setTo(to.includes(r.user) ? to.filter(x => x !== r.user) : [...to, r.user])}
                className={`px-2.5 py-1 rounded-full border text-xs ${to.includes(r.user) ? "bg-brand-soft text-brand border-brand/30" : "hover:bg-muted/50"}`}
              >{r.user}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block flex items-center gap-1.5"><Building2 className="size-3" />Tenant managers</Label>
          <div className="flex flex-wrap gap-1.5">
            {tenantManagers.map(t => (
              <button
                key={t.id}
                onClick={() => setTo(to.includes(t.name) ? to.filter(x => x !== t.name) : [...to, t.name])}
                className={`px-2.5 py-1 rounded-full border text-xs ${to.includes(t.name) ? "bg-brand-soft text-brand border-brand/30" : "hover:bg-muted/50"}`}
                title={`${t.tenant} · ${t.branch}`}
              >{t.name} <span className="text-muted-foreground">· {t.tenant}</span></button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Message</Label>
          <Textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Write a message…" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={send} className="gap-1.5"><Send className="size-3.5" />Send</Button>
      </DialogFooter>
    </DialogContent>
  );
}
