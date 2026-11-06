import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, MessageSquare, RefreshCw, Send } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
        "id,reference,branch_id,tenant_id,raised_by,requester_name,organization_name,subject,body,priority,status,sla_due_at,created_at,branches(name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (branchIds)
      query = branchIds.length
        ? query.in("branch_id", branchIds)
        : query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setTickets([]);
    } else {
      setError("");
      setTickets((data ?? []) as Ticket[]);
    }
    setLoading(false);
  }, [branchScope]);

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

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo" ? "Group Operations · Support" : "Branch Operations · Support"
        }
        title={role.id === "group-ceo" ? "Group support health" : "Support queue"}
        description={
          role.id === "group-ceo"
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

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Live service queue</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: support ticket records. Response-time and satisfaction metrics are not reported
            without stored measurements.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading support tickets…</p>
        ) : tickets.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-10 text-center">
            <LifeBuoy className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No support tickets found</p>
            <p className="text-xs text-muted-foreground">
              There are no ticket records in the current scope.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Sender</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  {role.id === "group-ceo" ? (
                    <th className="px-4 py-3 font-medium">Branch</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">SLA due</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const branch = Array.isArray(ticket.branches)
                    ? ticket.branches[0]
                    : ticket.branches;
                  const pastSla =
                    ticket.sla_due_at &&
                    new Date(ticket.sla_due_at).getTime() < Date.now() &&
                    !["resolved", "closed"].includes(ticket.status);
                  return (
                    <tr key={ticket.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">
                        {ticket.reference ?? ticket.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">{ticket.requester_name ?? "Unknown requester"}</td>
                      <td className="px-4 py-3">{ticket.organization_name ?? "Not linked"}</td>
                      {role.id === "group-ceo" ? (
                        <td className="px-4 py-3">{branch?.name ?? "Unassigned"}</td>
                      ) : null}
                      <td className="px-4 py-3 font-medium">
                        <Button type="button" variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={() => void openTicket(ticket)}>
                          <MessageSquare className="mr-1 size-3.5 shrink-0" />{ticket.subject}
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            ["urgent", "high"].includes(ticket.priority)
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {ticket.priority}
                        </Badge>
                      </td>
                      <td
                        className={`px-4 py-3 text-xs ${pastSla ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        {ticket.sla_due_at
                          ? new Date(ticket.sla_due_at).toLocaleString()
                          : "Not set"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={
                            ["resolved", "closed"].includes(ticket.status) ? "default" : "outline"
                          }
                        >
                          {ticket.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={selectedTicket !== null} onOpenChange={(open) => { if (!open) setSelectedTicket(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selectedTicket && <>
            <DialogHeader>
              <DialogTitle>{selectedTicket.subject}</DialogTitle>
              <DialogDescription>
                {selectedTicket.reference ?? selectedTicket.id.slice(0, 8)} · {selectedTicket.priority} priority · {selectedTicket.status.replaceAll("_", " ")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium">Original request</div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{selectedTicket.body || "No description provided."}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{new Date(selectedTicket.created_at).toLocaleString()}</p>
              </div>
              {loadingMessages ? (
                <p className="py-4 text-sm text-muted-foreground">Loading replies…</p>
              ) : ticketMessages.map((message) => (
                <div key={message.id} className="rounded-md border p-3">
                  <div className="text-xs font-medium">{message.author_id === selectedTicket.raised_by ? "Requester" : "Support team"}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{message.message}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <form onSubmit={(event) => void sendReply(event)} className="space-y-2">
              <Label htmlFor="support-ticket-reply">Reply to requester</Label>
              <Textarea id="support-ticket-reply" required maxLength={5000} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a response…" />
              {replyError && <p role="alert" className="text-sm text-destructive">{replyError}</p>}
              <Button type="submit" disabled={sendingReply || !reply.trim()} className="gap-2">
                <Send className="size-4" />{sendingReply ? "Sending…" : "Send reply"}
              </Button>
            </form>
            <DialogFooter>
              {selectedTicket.status !== "in_progress" && selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                <Button variant="outline" disabled={updatingStatus} onClick={() => void updateTicketStatus("in_progress")}>Mark in progress</Button>
              )}
              {selectedTicket.status === "resolved" || selectedTicket.status === "closed" ? (
                <Button variant="outline" disabled={updatingStatus} onClick={() => void updateTicketStatus("open")}>Reopen ticket</Button>
              ) : (
                <Button disabled={updatingStatus} onClick={() => void updateTicketStatus("resolved")}>Resolve ticket</Button>
              )}
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
