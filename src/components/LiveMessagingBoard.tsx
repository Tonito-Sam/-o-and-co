import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Plus, RefreshCw, Search, Send, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private" | "restricted";
  allowed_roles: string[];
};

type ChannelMembership = {
  channel_id: string;
  subscribed: boolean;
  muted: boolean;
};

type WorkspaceProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

type Message = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  thread_id?: string;
  channel_id?: string;
};

type DirectThread = {
  id: string;
  created_at: string;
  partner_id: string;
  preview: string;
  last_message_at: string;
};

type ActiveConversation = { kind: "channel" | "direct"; id: string } | null;

const messageTime = (value: string) =>
  new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export function LiveMessagingBoard() {
  const { role } = useRole();
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("You");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [memberships, setMemberships] = useState<ChannelMembership[]>([]);
  const [directory, setDirectory] = useState<WorkspaceProfile[]>([]);
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [active, setActive] = useState<ActiveConversation>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState<WorkspaceProfile[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<WorkspaceProfile | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState("");
  const [directoryUnavailable, setDirectoryUnavailable] = useState(false);

  const profileNames = useMemo(
    () =>
      new Map(directory.map((profile) => [profile.id, profile.full_name || "Workspace member"])),
    [directory],
  );
  const activeChannel =
    active?.kind === "channel" ? channels.find((channel) => channel.id === active.id) : null;
  const activeThread =
    active?.kind === "direct" ? threads.find((thread) => thread.id === active.id) : null;
  const activeTitle =
    activeChannel?.name ?? (activeThread ? profileNames.get(activeThread.partner_id) : "");
  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredThreads = threads.filter((thread) =>
    (profileNames.get(thread.partner_id) ?? "Workspace member")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const loadWorkspace = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace messaging is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    const user = userResult.user;
    if (userError || !user) {
      setError("Sign in to view workspace messages.");
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const [profileResult, channelResult, membershipResult, directoryResult, memberResult] =
      await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("messaging_channels")
          .select("id,name,description,visibility,allowed_roles")
          .eq("archived", false)
          .order("name"),
        supabase
          .from("channel_members")
          .select("channel_id,subscribed,muted")
          .eq("profile_id", user.id),
        supabase.rpc("get_messaging_directory", { _search: null }),
        supabase.from("direct_thread_members").select("thread_id").eq("profile_id", user.id),
      ]);

    if (profileResult.data?.full_name) setUserName(profileResult.data.full_name);
    else setUserName(user.email ?? "You");

    if (channelResult.error) {
      setError(`Could not load channels: ${channelResult.error.message}`);
      setLoading(false);
      return;
    }

    const availableChannels = (channelResult.data ?? []) as Channel[];
    setChannels(availableChannels);
    setMemberships((membershipResult.data ?? []) as ChannelMembership[]);

    if (directoryResult.error) {
      setDirectoryUnavailable(true);
      setDirectory([]);
    } else {
      setDirectoryUnavailable(false);
      setDirectory((directoryResult.data ?? []) as WorkspaceProfile[]);
    }

    const threadIds = (memberResult.data ?? []).map(({ thread_id }) => thread_id);
    if (memberResult.error || threadIds.length === 0) {
      setThreads([]);
    } else {
      const [threadResult, directMessageResult, threadMemberResult] = await Promise.all([
        supabase.from("direct_threads").select("id,created_at").in("id", threadIds),
        supabase
          .from("direct_messages")
          .select("id,thread_id,author_id,body,created_at")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("direct_thread_members")
          .select("thread_id,profile_id")
          .in("thread_id", threadIds),
      ]);
      const profilesByThread = new Map<string, string>();
      for (const member of threadMemberResult.data ?? []) {
        if (member.profile_id !== user.id)
          profilesByThread.set(member.thread_id, member.profile_id);
      }
      const latestByThread = new Map<string, Message>();
      for (const message of (directMessageResult.data ?? []) as Message[]) {
        if (!latestByThread.has(message.thread_id ?? ""))
          latestByThread.set(message.thread_id ?? "", message);
      }
      setThreads(
        (threadResult.data ?? [])
          .map((thread) => {
            const latest = latestByThread.get(thread.id);
            return {
              id: thread.id,
              created_at: thread.created_at,
              partner_id: profilesByThread.get(thread.id) ?? "",
              preview: latest?.body ?? "No messages yet",
              last_message_at: latest?.created_at ?? thread.created_at,
            };
          })
          .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
      );
    }

    setError("");
    setLoading(false);
    setActive(
      (current) =>
        current ?? (availableChannels[0] ? { kind: "channel", id: availableChannels[0].id } : null),
    );
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const loadActiveMessages = useCallback(async () => {
    if (!active) {
      setMessages([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setMessagesLoading(true);
    const table = active.kind === "channel" ? "channel_messages" : "direct_messages";
    const ownerColumn = active.kind === "channel" ? "channel_id" : "thread_id";
    const { data, error: queryError } = await supabase
      .from(table)
      .select("id,author_id,body,created_at")
      .eq(ownerColumn, active.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (queryError) {
      setError(`Could not load this conversation: ${queryError.message}`);
      setMessages([]);
    } else {
      setMessages((data ?? []) as Message[]);
      setError("");
    }
    setMessagesLoading(false);
  }, [active]);

  useEffect(() => {
    void loadActiveMessages();
  }, [loadActiveMessages]);

  useEffect(() => {
    if (!newMessageOpen || recipientSearch.trim().length < 2) {
      setRecipientResults([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let activeSearch = true;
    const timeout = window.setTimeout(() => {
      void supabase
        .rpc("get_messaging_directory", { _search: recipientSearch.trim() })
        .then(({ data, error: queryError }) => {
          if (!activeSearch) return;
          setDirectoryUnavailable(Boolean(queryError));
          setRecipientResults((data ?? []) as WorkspaceProfile[]);
        });
    }, 250);
    return () => {
      activeSearch = false;
      window.clearTimeout(timeout);
    };
  }, [newMessageOpen, recipientSearch]);

  const sendMessage = async () => {
    if (!active || !draft.trim() || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const table = active.kind === "channel" ? "channel_messages" : "direct_messages";
    const ownerColumn = active.kind === "channel" ? "channel_id" : "thread_id";
    const { data, error: sendError } = await supabase
      .from(table)
      .insert({ [ownerColumn]: active.id, author_id: userId, body: draft.trim() })
      .select("id,author_id,body,created_at")
      .single();
    if (sendError) {
      toast.error(`Message was not sent: ${sendError.message}`);
      return;
    }
    setMessages((current) => [...current, data as Message]);
    setDraft("");
  };

  const subscribeToChannel = async () => {
    if (!activeChannel || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const current = memberships.find((membership) => membership.channel_id === activeChannel.id);
    const { error: saveError } = await supabase.from("channel_members").upsert(
      {
        channel_id: activeChannel.id,
        profile_id: userId,
        subscribed: !current?.subscribed,
        muted: current?.muted ?? false,
      },
      { onConflict: "channel_id,profile_id" },
    );
    if (saveError) {
      toast.error(`Channel preference was not saved: ${saveError.message}`);
      return;
    }
    await loadWorkspace();
  };

  const createDirectMessage = async () => {
    if (!selectedRecipient || !firstMessage.trim()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: createError } = await supabase.rpc("create_direct_message", {
      _recipient_id: selectedRecipient.id,
      _body: firstMessage.trim(),
    });
    if (createError) {
      toast.error(`Direct message was not sent: ${createError.message}`);
      return;
    }
    setNewMessageOpen(false);
    setSelectedRecipient(null);
    setRecipientSearch("");
    setFirstMessage("");
    await loadWorkspace();
    setActive({ kind: "direct", id: data as string });
  };

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow="Workspace communications"
        title="Messages"
        description={`Channels and direct conversations for ${role.title}.`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadWorkspace()}
              disabled={loading}
              aria-label="Refresh messages"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={() => setNewMessageOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              New message
            </Button>
          </>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <section className="grid h-[min(72vh,760px)] min-h-[480px] grid-cols-[minmax(190px,240px)_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card lg:grid-cols-[minmax(210px,260px)_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter conversations"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Channels
            </div>
            {loading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Loading channels…</p>
            ) : filteredChannels.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No channels available for this account.
              </p>
            ) : (
              filteredChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setActive({ kind: "channel", id: channel.id })}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${active?.id === channel.id ? "bg-brand-soft text-brand" : "hover:bg-muted/60"}`}
                >
                  <span className="text-muted-foreground">#</span>
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {memberships.some(
                    (membership) => membership.channel_id === channel.id && membership.subscribed,
                  ) ? (
                    <span
                      className="size-1.5 rounded-full bg-emerald-500"
                      aria-label="Subscribed"
                    />
                  ) : null}
                </button>
              ))
            )}

            <div className="mt-5 flex items-center justify-between px-2 pb-2 pt-1">
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                Direct messages
              </div>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {threads.length}
              </Badge>
            </div>
            {filteredThreads.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No direct conversations yet.
              </p>
            ) : (
              filteredThreads.map((thread) => {
                const name = profileNames.get(thread.partner_id) ?? "Workspace member";
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setActive({ kind: "direct", id: thread.id })}
                    className={`mb-0.5 flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left ${active?.id === thread.id ? "bg-brand-soft" : "hover:bg-muted/60"}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                      {initials(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {messageTime(thread.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {thread.preview}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            {directoryUnavailable ? (
              <p className="mt-3 border-t px-2 pt-3 text-xs text-muted-foreground">
                New direct messages need the messaging directory migration applied in Supabase.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {!active ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-sm">
                <MessageSquare className="mx-auto size-8 text-muted-foreground/60" />
                <h2 className="mt-3 font-display text-lg font-semibold">Choose a conversation</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a channel or start a direct message. No sample conversations are shown.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    {active.kind === "channel" ? (
                      <span className="font-display text-lg">#</span>
                    ) : (
                      <Users className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-semibold">
                      {activeTitle || "Direct message"}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {activeChannel?.description ??
                        (active.kind === "direct" ? "Private conversation" : "Workspace channel")}
                    </p>
                  </div>
                </div>
                {activeChannel ? (
                  <Button size="sm" variant="outline" onClick={() => void subscribeToChannel()}>
                    {memberships.some(
                      (membership) =>
                        membership.channel_id === activeChannel.id && membership.subscribed,
                    )
                      ? "Unsubscribe"
                      : "Subscribe"}
                  </Button>
                ) : null}
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                {messagesLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading conversation…
                  </p>
                ) : messages.length === 0 ? (
                  <div className="grid h-full min-h-48 place-items-center text-center">
                    <div>
                      <MessageSquare className="mx-auto size-7 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium">No messages yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Start the conversation with a real message.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-5">
                    {messages.map((message) => {
                      const ownMessage = message.author_id === userId;
                      const author = ownMessage
                        ? userName
                        : (profileNames.get(message.author_id) ?? "Workspace member");
                      return (
                        <article key={message.id} className="flex gap-3">
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium ${ownMessage ? "bg-brand-soft text-brand" : "bg-muted"}`}
                          >
                            {initials(author)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold">{author}</span>
                              <time className="text-[11px] text-muted-foreground">
                                {messageTime(message.created_at)}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <form
                className="border-t p-3 sm:p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`Message ${active.kind === "channel" ? `#${activeTitle}` : activeTitle || "this conversation"}`}
                    rows={2}
                    className="max-h-32 min-h-11 resize-y"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Send message"
                    disabled={!draft.trim()}
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </form>
            </>
          )}
        </main>
      </section>

      <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New direct message</DialogTitle>
            <DialogDescription>
              Start a private conversation with a workspace colleague or organization administrator.
            </DialogDescription>
          </DialogHeader>
          {directoryUnavailable ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
              The messaging directory is not available yet. Apply the latest messaging migration in
              Supabase to enable new direct messages.
            </p>
          ) : (
            <div className="space-y-3">
              <Input
                value={recipientSearch}
                onChange={(event) => {
                  setRecipientSearch(event.target.value);
                  setSelectedRecipient(null);
                }}
                placeholder="Search people by name"
              />
              {recipientResults.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {recipientResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setSelectedRecipient(person)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${selectedRecipient?.id === person.id ? "bg-brand-soft text-brand" : "hover:bg-muted/60"}`}
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-medium">
                        {initials(person.full_name)}
                      </span>
                      <span>{person.full_name}</span>
                    </button>
                  ))}
                </div>
              ) : recipientSearch.trim().length >= 2 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  No matching workspace contacts.
                </p>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">
                  Enter at least two characters to find a person.
                </p>
              )}
              {selectedRecipient ? (
                <Textarea
                  value={firstMessage}
                  onChange={(event) => setFirstMessage(event.target.value)}
                  placeholder={`Write the first message to ${selectedRecipient.full_name}`}
                  rows={3}
                />
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMessageOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createDirectMessage()}
              disabled={!selectedRecipient || !firstMessage.trim() || directoryUnavailable}
            >
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
