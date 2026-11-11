import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LifeBuoy, MessageSquare, RefreshCw, Search, Send } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { OrganizationSupportView } from "@/components/tenant/OrganizationViews";
import { toast } from "sonner";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Support — WorkspaceOS" }] }),
  component: Support,
});

type Ticket = {
  id: string;
  reference: string | null;
  branch_id: string | null;
  tenant_id: string | null;
  raised_by: string | null;
  assignee_id: string | null;
  requester_name: string | null;
  organization_name: string | null;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  sla_due_at: string | null;
  created_at: string;
  branches: { name: string } | { name: string }[] | null;
};

type SupportAgent = { id: string; full_name: string | null; email: string | null };
type QueueTab = "all" | "unassigned" | "mine" | "urgent";

type TicketMessage = {
  id: string;
  ticket_id: string;
  author_id: string;
  message: string;
  created_at: string;
};

function Support() {
  const { role } = useRole();
  if (["tenant-admin", "organization-admin", "organization-member"].includes(role.id)) {
    return <OrganizationSupportView />;
  }
  return <OperationsSupport />;
}

function OperationsSupport() {
  const { role } = useRole();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [queueTab, setQueueTab] = useState<QueueTab>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [supportAgents, setSupportAgents] = useState<SupportAgent[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const branchScope = role.id === "branch-manager" ? (role.branchIds ?? []).join(",") : "all";

  const loadTickets = useCallback(async () => {
    const branchIds = branchScope === "all" ? null : branchScope ? branchScope.split(",") : [];
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace support data is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("support_tickets")
      .select(
        "id,reference,branch_id,tenant_id,raised_by,assignee_id,requester_name,organization_name,subject,body,priority,status,sla_due_at,created_at,branches(name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (branchIds)
      query = branchIds.length
        ? query.in("branch_id", branchIds)
        : query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    const { data, error: queryError } = await query;
    const { data: authData } = await supabase.auth.getUser();
    setCurrentUserId(authData.user?.id ?? "");
    if (["superadmin", "group-ceo"].includes(role.id)) {
      const { data: agents, error: agentError } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .or("email.ilike.%@officeandco.co.za,email.ilike.%@officeandco.co.ca")
        .order("full_name");
      if (agentError) toast.error(`Could not load support assignees: ${agentError.message}`);
      setSupportAgents((agents ?? []) as SupportAgent[]);
    }
    if (queryError) {
      setError(queryError.message);
      setTickets([]);
    } else {
      setError("");
      setTickets((data ?? []) as Ticket[]);
    }
    setLoading(false);
  }, [branchScope, role.id]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setTicketMessages([]);
    setReply("");
    setReplyError("");
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingMessages(true);
    const { data, error: messageError } = await supabase
      .from("support_ticket_messages")
      .select("id,ticket_id,author_id,message,created_at")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    setLoadingMessages(false);
    if (messageError) {
      toast.error(messageError.message);
      return;
    }
    setTicketMessages((data ?? []) as TicketMessage[]);
  };

  const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = reply.trim();
    if (!selectedTicket || !message) return;
    setReplyError("");
    const supabase = getSupabaseClient();
    if (!supabase) {
      setReplyError("The support service is unavailable. Try again later.");
      return;
    }
    setSendingReply(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setReplyError("Your session has expired. Sign in again to reply.");
        return;
      }
      const { data, error: insertError } = await supabase
        .from("support_ticket_messages")
        .insert({ ticket_id: selectedTicket.id, author_id: auth.user.id, message })
        .select("id,ticket_id,author_id,message,created_at")
        .single();
      if (insertError) {
        setReplyError(insertError.message);
        return;
      }
      setTicketMessages((current) => [...current, data as TicketMessage]);
      setReply("");
      toast.success("Reply sent to the requester.");
    } catch (cause) {
      setReplyError(cause instanceof Error ? cause.message : "Could not send your reply.");
    } finally {
      setSendingReply(false);
    }
  };

  const updateTicketStatus = async (status: "open" | "in_progress" | "resolved") => {
    if (!selectedTicket) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdatingStatus(true);
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ status })
      .eq("id", selectedTicket.id);
    setUpdatingStatus(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setSelectedTicket({ ...selectedTicket, status });
    setTickets((current) => current.map((ticket) => ticket.id === selectedTicket.id ? { ...ticket, status } : ticket));
    toast.success(status === "resolved" ? "Ticket resolved." : "Ticket status updated.");
  };

  const updateAssignee = async (ticketId: string, assigneeId: string | null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ assignee_id: assigneeId })
      .eq("id", ticketId);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, assignee_id: assigneeId } : ticket));
    setSelectedTicket((current) => current?.id === ticketId ? { ...current, assignee_id: assigneeId } : current);
    toast.success(assigneeId ? "Ticket assigned." : "Ticket unassigned.");
  };

  const applyBulkUpdate = async (updates: { assignee_id?: string | null; status?: "resolved" | "closed" }, successMessage: string) => {
    const ids = [...selectedTicketIds];
    const supabase = getSupabaseClient();
    if (!supabase || ids.length === 0) return;
    setBulkUpdating(true);
    const { error: updateError } = await supabase.from("support_tickets").update(updates).in("id", ids);
    setBulkUpdating(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setTickets((current) => current.map((ticket) => ids.includes(ticket.id) ? { ...ticket, ...updates } : ticket));
    setSelectedTicket((current) => current && ids.includes(current.id) ? { ...current, ...updates } : current);
    setSelectedTicketIds(new Set());
    toast.success(successMessage);
  };

  const toggleTicketSelection = (ticketId: string, checked: boolean | "indeterminate") => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (checked === true) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  };

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)),
    [tickets],
  );
  const overdueTickets = openTickets.filter(
    (ticket) => ticket.sla_due_at && new Date(ticket.sla_due_at).getTime() < Date.now(),
  );
  const urgentTickets = openTickets.filter((ticket) =>
    ["urgent", "high"].includes(ticket.priority),
  );
  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesTab = queueTab === "all"
        || (queueTab === "unassigned" && !ticket.assignee_id)
        || (queueTab === "mine" && ticket.assignee_id === currentUserId)
        || (queueTab === "urgent" && ["urgent", "high"].includes(ticket.priority));
      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesSearch = !query || [ticket.reference, ticket.requester_name, ticket.organization_name, ticket.subject]
        .some((value) => value?.toLowerCase().includes(query));
      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [tickets, queueTab, statusFilter, search, currentUserId]);
  const canManageQueue = ["superadmin", "group-ceo", "sales-manager", "community-manager", "branch-manager"].includes(role.id);
  const canAssignQueue = ["superadmin", "group-ceo"].includes(role.id);

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "superadmin" ? "Platform Administration · Support" : role.id === "group-ceo" ? "Group Operations · Support" : "Branch Operations · Support"
        }
        title={role.id === "superadmin" ? "Platform support queue" : role.id === "group-ceo" ? "Group support health" : "Support queue"}
        description={
          ["superadmin", "group-ceo"].includes(role.id)
            ? "Live service requests and SLA risks across active branches."
            : "Live service requests and SLA risks for your assigned branches."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTickets()}
            disabled={loading}
            aria-label="Refresh support tickets"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Support data unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open tickets"
          value={loading ? "—" : String(openTickets.length)}
          hint="Not resolved or closed"
          accent="brand"
        />
        <StatCard
          label="High priority"
          value={loading ? "—" : String(urgentTickets.length)}
          hint="High or urgent"
          accent={urgentTickets.length ? "warning" : "success"}
        />
        <StatCard
          label="Past SLA"
          value={loading ? "—" : String(overdueTickets.length)}
          hint="Open tickets past due"
          accent={overdueTickets.length ? "warning" : "success"}
        />
        <StatCard
          label="All tickets"
          value={loading ? "—" : String(tickets.length)}
          hint="Records returned"
        />
      </div>

      <div className="space-y-3">
        <Tabs value={queueTab} onValueChange={(value) => setQueueTab(value as QueueTab)}>
          <TabsList aria-label="Support queue filters">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="urgent">Urgent</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets…" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          {selectedTicketIds.size > 0 && canManageQueue && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedTicketIds.size} selected</span>
              {currentUserId && <Button size="sm" variant="outline" disabled={bulkUpdating} onClick={() => void applyBulkUpdate({ assignee_id: currentUserId }, "Selected tickets assigned to you.")}>Assign to me</Button>}
              <Button size="sm" variant="outline" disabled={bulkUpdating} onClick={() => void applyBulkUpdate({ status: "resolved" }, "Selected tickets resolved.")}>Resolve</Button>
              <Button size="sm" variant="outline" disabled={bulkUpdating} onClick={() => void applyBulkUpdate({ status: "closed" }, "Selected tickets closed.")}>Close</Button>
            </div>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Support queue</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a ticket to read and reply to its conversation.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading support tickets…</p>
        ) : tickets.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-10 text-center">
            <LifeBuoy className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No support tickets found</p>
            <p className="text-xs text-muted-foreground">There are no ticket records in the current scope.</p>
          </div>
        ) : visibleTickets.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No tickets match these filters.</p>
        ) : (
          <div className="grid min-h-[620px] grid-cols-1 md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            <div className={`${selectedTicket ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r`}>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">{visibleTickets.length} tickets</span>
                {canManageQueue && (
                  <Checkbox
                    checked={visibleTickets.length > 0 && visibleTickets.every(({ id }) => selectedTicketIds.has(id))}
                    onCheckedChange={(checked) => setSelectedTicketIds((current) => {
                      const next = new Set(current);
                      for (const ticket of visibleTickets) {
                        if (checked === true) next.add(ticket.id);
                        else next.delete(ticket.id);
                      }
                      return next;
                    })}
                    aria-label="Select visible tickets"
                  />
                )}
              </div>
              <ul className="min-h-0 flex-1 divide-y overflow-y-auto md:max-h-[720px]">
                {visibleTickets.map((ticket) => {
                  const selected = selectedTicket?.id === ticket.id;
                  const branch = Array.isArray(ticket.branches) ? ticket.branches[0] : ticket.branches;
                  return (
                    <li key={ticket.id} className={`flex items-start gap-2 px-3 py-1 ${selected ? "bg-muted/40" : "hover:bg-muted/20"}`}>
                      {canManageQueue && (
                        <Checkbox
                          className="mt-3"
                          checked={selectedTicketIds.has(ticket.id)}
                          onCheckedChange={(checked) => toggleTicketSelection(ticket.id, checked)}
                          aria-label={`Select ticket ${ticket.reference ?? ticket.id.slice(0, 8)}`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void openTicket(ticket)}
                        aria-current={selected ? "true" : undefined}
                        className="min-w-0 flex-1 px-1 py-3 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-medium">{ticket.subject}</span>
                          {ticket.priority === "urgent" && <span className="sr-only">Urgent</span>}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {ticket.requester_name ?? "Unknown requester"} · {ticket.organization_name ?? "Not linked"}
                        </p>
                        {ticket.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ticket.body}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant={ticket.status === "open" ? "destructive" : "outline"} className="capitalize text-[10px]">
                            {ticket.status.replaceAll("_", " ")}
                          </Badge>
                          <Badge variant={["urgent", "high"].includes(ticket.priority) ? "destructive" : "secondary"} className="capitalize text-[10px]">
                            {ticket.priority}
                          </Badge>
                          {role.id === "group-ceo" || role.id === "superadmin" ? (
                            <span className="text-[10px] text-muted-foreground">{branch?.name ?? "Unassigned branch"}</span>
                          ) : null}
                          <span className="ml-auto text-[10px] text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString()}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={`${selectedTicket ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
              {selectedTicket ? (
                <>
                  <header className="border-b px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Button type="button" variant="ghost" size="icon" className="-ml-2 size-8 shrink-0 md:hidden" onClick={() => setSelectedTicket(null)} aria-label="Back to ticket queue">
                        <ArrowLeft className="size-4" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-sm font-semibold">{selectedTicket.subject}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{selectedTicket.reference ?? selectedTicket.id.slice(0, 8)}</span>
                          <span>·</span>
                          <span>{selectedTicket.requester_name ?? "Unknown requester"}</span>
                          <span>·</span>
                          <span>{selectedTicket.organization_name ?? "Not linked"}</span>
                          <Badge variant={selectedTicket.status === "open" ? "destructive" : "outline"} className="capitalize">
                            {selectedTicket.status.replaceAll("_", " ")}
                          </Badge>
                          <Badge variant={["urgent", "high"].includes(selectedTicket.priority) ? "destructive" : "secondary"} className="capitalize">
                            {selectedTicket.priority}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-10 md:pl-0">
                      {canAssignQueue && (
                        <Select value={selectedTicket.assignee_id ?? "unassigned"} onValueChange={(value) => void updateAssignee(selectedTicket.id, value === "unassigned" ? null : value)}>
                          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {selectedTicket.assignee_id && !supportAgents.some(({ id }) => id === selectedTicket.assignee_id) && <SelectItem value={selectedTicket.assignee_id}>Current assignee</SelectItem>}
                            {supportAgents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.full_name || agent.email || "Staff member"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {selectedTicket.sla_due_at && (
                        <span className={`text-xs ${new Date(selectedTicket.sla_due_at).getTime() < Date.now() && !["resolved", "closed"].includes(selectedTicket.status) ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                          SLA {new Date(selectedTicket.sla_due_at).toLocaleString()}
                        </span>
                      )}
                      {selectedTicket.status !== "in_progress" && selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                        <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={updatingStatus} onClick={() => void updateTicketStatus("in_progress")}>In progress</Button>
                      )}
                      {selectedTicket.status === "resolved" || selectedTicket.status === "closed" ? (
                        <Button type="button" size="sm" variant="outline" disabled={updatingStatus} onClick={() => void updateTicketStatus("open")}>Reopen</Button>
                      ) : (
                        <Button type="button" size="sm" disabled={updatingStatus} onClick={() => void updateTicketStatus("resolved")}>Resolve</Button>
                      )}
                    </div>
                  </header>

                  <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:max-h-[540px]">
                    <div className="flex justify-start">
                      <div className="max-w-[88%] rounded-lg border bg-muted/40 px-3 py-2">
                        <div className="text-[11px] font-medium">{selectedTicket.requester_name ?? "Requester"} · Original request</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{selectedTicket.body || "No description provided."}</p>
                        <p className="mt-2 text-[10px] text-muted-foreground">{new Date(selectedTicket.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {loadingMessages ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading conversation…</div>
                    ) : ticketMessages.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground">No replies yet.</p>
                    ) : ticketMessages.map((message) => {
                      const isRequester = message.author_id === selectedTicket.raised_by;
                      return (
                        <div key={message.id} className={`flex ${isRequester ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[88%] rounded-lg px-3 py-2 ${isRequester ? "border bg-muted/40" : "bg-primary text-primary-foreground"}`}>
                            <div className={`text-[11px] font-medium ${isRequester ? "" : "text-primary-foreground/80"}`}>
                              {isRequester ? selectedTicket.requester_name ?? "Requester" : "Support team"}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
                            <p className={`mt-2 text-[10px] ${isRequester ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                              {new Date(message.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={(event) => void sendReply(event)} className="space-y-2 border-t p-3">
                    <Label htmlFor="support-ticket-reply">Reply to requester</Label>
                    <Textarea id="support-ticket-reply" required maxLength={5000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a response…" />
                    <div className="flex items-center justify-between gap-3">
                      {replyError ? <p role="alert" className="text-sm text-destructive">{replyError}</p> : <span className="text-xs text-muted-foreground">Sent to the requester.</span>}
                      <Button type="submit" disabled={sendingReply || !reply.trim()} className="shrink-0 gap-2">
                        <Send className="size-4" />{sendingReply ? "Sending…" : "Send reply"}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center md:flex">
                  <MessageSquare className="size-7 text-muted-foreground/60" />
                  <p className="text-sm font-medium">Select a ticket</p>
                  <p className="text-xs text-muted-foreground">Its conversation will appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
