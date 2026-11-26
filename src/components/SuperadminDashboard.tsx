import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  CirclePause,
  Clock,
  FileText,
  LifeBuoy,
  LoaderCircle,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getSupabaseClient } from "@/lib/supabase";
import type { RoleDef } from "@/lib/mock";
import { toast } from "sonner";

type GreetingState = { dateLabel: string; greeting: string };
type CommunityStats = { livePosts: number; postsThisWeek: number; openReports: number; reactions: number };
type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  work_branch_id: string | null;
};
type StaffRole = { user_id: string; role: string; branch_id: string | null };
type StaffMember = StaffProfile & { roleLabels: string[]; branchName: string | null; canDelete: boolean };
type OrganizationRecord = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  branch_id: string;
  created_by: string;
  created_at: string;
  branches: { name: string }[] | null;
};
type OrganizationMembership = {
  organization_id: string;
  status: "active" | "suspended";
};
type RegisteredOrganization = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  branch: string;
  createdAt: string;
  status: "active" | "suspended" | "no_members";
  memberCount: number;
};
type Branch = { id: string; name: string };

type SupportTicket = {
  id: string;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  created_at: string;
  tenant_id: string | null;
  raised_by: string | null;
  assignee_id: string | null;
};

type AuditEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};

type QuickActionProps = {
  icon: LucideIcon;
  label: string;
  to: "/support" | "/tenant-access" | "/staff" | "/settings/roles" | "/audit";
  badge?: number;
};

const VIEW_TITLES: Record<string, string> = {
  overview: "overview",
  staff: "staff",
  tenants: "tenants",
  support: "support",
  audit: "audit",
  analytics: "analytics",
};

function QuickAction({ icon: Icon, label, to, badge }: QuickActionProps) {
  return (
    <Link to={to} className="group flex min-w-0 items-center gap-3 rounded-md border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/30">
      <span className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {badge !== undefined && badge > 0
        ? <Badge variant="destructive">{badge}</Badge>
        : <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />}
    </Link>
  );
}

function exportCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escapeCell = (value: string | number | null) => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const contents = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function priorityVariant(priority: SupportTicket["priority"]) {
  if (priority === "urgent") return "destructive" as const;
  if (priority === "high") return "default" as const;
  if (priority === "low") return "outline" as const;
  return "secondary" as const;
}

function statusVariant(status: SupportTicket["status"]) {
  if (status === "open") return "destructive" as const;
  if (status === "in_progress") return "default" as const;
  if (status === "resolved") return "secondary" as const;
  return "outline" as const;
}

const officeCoEmailDomains = ["@officeandco.co.za", "@officeandco.co.ca"];

async function getAccountActionError(error: unknown, serverError: unknown, fallback: string) {
  if (typeof serverError === "string") return serverError;
  if (error && typeof error === "object") {
    const requestError = error as { message?: unknown; context?: unknown };
    if (requestError.context instanceof Response) {
      try {
        const body = await requestError.context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof body.error === "string") return body.error;
        if (typeof body.message === "string") return body.message;
      } catch {
        // Use the SDK message when the response is not JSON.
      }
    }
    if (typeof requestError.message === "string") {
      if (requestError.message.includes("Failed to send a request to the Edge Function")) {
        return "Could not reach account management. Confirm the Edge Function is deployed and the Supabase project is reachable.";
      }
      return requestError.message;
    }
  }
  return fallback;
}

export function SuperadminDashboard({
  role,
  greetingState,
  firstName,
  view = "overview",
}: {
  role: RoleDef;
  greetingState: GreetingState;
  firstName: string;
  view?: "overview" | "staff" | "tenants" | "support" | "audit" | "analytics";
}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [organizations, setOrganizations] = useState<RegisteredOrganization[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSupportCount, setOpenSupportCount] = useState<number | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [communityStatsError, setCommunityStatsError] = useState("");
  const [tenantAction, setTenantAction] = useState<{ organization: RegisteredOrganization; action: "delete" } | null>(null);
  const [updatingTenantId, setUpdatingTenantId] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [organizationStatusFilter, setOrganizationStatusFilter] = useState("all");
  const [organizationBranchFilter, setOrganizationBranchFilter] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketTab, setTicketTab] = useState<"all" | "open" | "in_progress" | "urgent" | "unassigned">("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");

  useEffect(() => {
    if (view !== "overview" || role.id !== "superadmin") return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCommunityStatsError("Workspace data is not configured.");
      return;
    }

    let active = true;
    const loadCommunityStats = async () => {
      const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [livePosts, postsThisWeek, openReports, reactions] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "approved").gte("created_at", weekStart),
        supabase.from("community_post_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("post_reactions").select("id", { count: "exact", head: true }),
      ]);
      const resultError = livePosts.error ?? postsThisWeek.error ?? openReports.error ?? reactions.error;
      if (resultError) throw new Error(resultError.message);
      if (!active) return;
      setCommunityStats({
        livePosts: livePosts.count ?? 0,
        postsThisWeek: postsThisWeek.count ?? 0,
        openReports: openReports.count ?? 0,
        reactions: reactions.count ?? 0,
      });
      setCommunityStatsError("");
    };

    void loadCommunityStats().catch((cause: unknown) => {
      if (!active) return;
      setCommunityStatsError(cause instanceof Error ? cause.message : "Could not load community statistics.");
    });

    return () => {
      active = false;
    };
  }, [role.id, view]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }

    const loadDirectory = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Could not verify the current account.");
        const currentUserId = userData.user.id;
        const pageSize = 500;
        const domainFilter = officeCoEmailDomains
          .map((domain) => `email.ilike.%${domain}`)
          .join(",");
        const profiles: StaffProfile[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error: profileError } = await supabase
            .from("profiles")
            .select("id,full_name,email,work_branch_id")
            .or(domainFilter)
            .order("full_name")
            .range(offset, offset + pageSize - 1);
          if (profileError) throw new Error(profileError.message);
          const page = (data ?? []) as StaffProfile[];
          profiles.push(...page);
          if (page.length < pageSize) break;
        }

        const matchingProfiles = profiles.filter(({ email }) => {
          const normalizedEmail = email?.trim().toLowerCase();
          return officeCoEmailDomains.some((domain) => normalizedEmail?.endsWith(domain));
        });
        const roleAssignments: StaffRole[] = [];
        for (let index = 0; index < matchingProfiles.length; index += pageSize) {
          const userIds = matchingProfiles.slice(index, index + pageSize).map(({ id }) => id);
          const { data, error: roleError } = await supabase
            .from("user_roles")
            .select("user_id,role,branch_id")
            .in("user_id", userIds);
          if (roleError) throw new Error(roleError.message);
          roleAssignments.push(...((data ?? []) as StaffRole[]));
        }

        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id,name");
        if (branchError) throw new Error(branchError.message);
        const branches = new Map(((branchData ?? []) as Branch[]).map(({ id, name }) => [id, name]));
        const rolesByUser = new Map<string, StaffRole[]>();
        for (const assignment of roleAssignments) {
          const assignments = rolesByUser.get(assignment.user_id) ?? [];
          assignments.push(assignment);
          rolesByUser.set(assignment.user_id, assignments);
        }

        const organizationRecords: OrganizationRecord[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error: organizationError } = await supabase
            .from("organizations")
            .select("id,name,website,industry,branch_id,created_by,created_at")
            .order("created_at", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (organizationError) throw new Error(organizationError.message);
          const page = (data ?? []) as OrganizationRecord[];
          organizationRecords.push(...page);
          if (page.length < pageSize) break;
        }
        const organizationIds = organizationRecords.map(({ id }) => id);
        const organizationMemberships: OrganizationMembership[] = [];
        for (let index = 0; index < organizationIds.length; index += pageSize) {
          const { data, error: membershipError } = await supabase
            .from("organization_members")
            .select("organization_id,status")
            .in("organization_id", organizationIds.slice(index, index + pageSize));
          if (membershipError) throw new Error(membershipError.message);
          organizationMemberships.push(...((data ?? []) as OrganizationMembership[]));
        }
        const creatorIds = [...new Set(organizationRecords.map(({ created_by }) => created_by))];
        const creatorProfiles: StaffProfile[] = [];
        for (let index = 0; index < creatorIds.length; index += pageSize) {
          const { data, error: creatorError } = await supabase
            .from("profiles")
            .select("id,full_name,email")
            .in("id", creatorIds.slice(index, index + pageSize));
          if (creatorError) throw new Error(creatorError.message);
          creatorProfiles.push(...((data ?? []) as StaffProfile[]));
        }
        const creatorsById = new Map(creatorProfiles.map((profile) => [profile.id, profile]));
        const membershipCounts = new Map<string, { active: number; suspended: number }>();
        for (const membership of organizationMemberships) {
          const counts = membershipCounts.get(membership.organization_id) ?? { active: 0, suspended: 0 };
          counts[membership.status] += 1;
          membershipCounts.set(membership.organization_id, counts);
        }

        const { count: supportCount } = await supabase
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .not("status", "in", '("resolved","closed")');

        // Support tickets
        let ticketRows: SupportTicket[] = [];
        if (view === "support" || view === "overview") {
          const { data, error: ticketError } = await supabase
            .from("support_tickets")
            .select("id,subject,status,priority,created_at,tenant_id,raised_by,assignee_id")
            .order("created_at", { ascending: false })
            .limit(300);
          if (ticketError) throw new Error(ticketError.message);
          ticketRows = (data ?? []) as SupportTicket[];
        }

        // Audit log
        let auditRows: AuditEntry[] = [];
        if (view === "audit" || view === "overview") {
          const { data, error: auditError } = await supabase
            .from("audit_log")
            .select("id,actor_id,actor_email,action,target_type,target_id,created_at")
            .order("created_at", { ascending: false })
            .limit(500);
          if (auditError) {
            // Audit table may not exist yet — soft fail
            auditRows = [];
          } else {
            auditRows = (data ?? []) as AuditEntry[];
          }
        }

        if (!active) return;
        setOpenSupportCount(supportCount ?? null);
        setTickets(ticketRows);
        setAuditEntries(auditRows);
        setStaff(matchingProfiles.map((profile) => {
          const assignments = rolesByUser.get(profile.id) ?? [];
          const hasGlobalScope = assignments.some(({ role: assignedRole, branch_id }) =>
            assignedRole !== "member" && !branch_id,
          );
          const branchIds = new Set(assignments.flatMap(({ branch_id }) => branch_id ? [branch_id] : []));
          if (profile.work_branch_id) branchIds.add(profile.work_branch_id);
          const locations = [
            ...(hasGlobalScope ? ["Global-wide"] : []),
            ...[...branchIds].map((branchId) => branches.get(branchId) ?? "Assigned branch"),
          ];
          return {
            ...profile,
            roleLabels: assignments
              .filter(({ role: assignedRole }) => assignedRole !== "member")
              .map(({ role: assignedRole, branch_id }) =>
                `${assignedRole.replaceAll("_", " ")}${branch_id ? ` · ${branches.get(branch_id) ?? "Branch"}` : " · Group-wide"}`,
              ),
            branchName: locations.length > 0 ? locations.join(" · ") : null,
            canDelete: profile.id !== currentUserId && !assignments.some(({ role: assignedRole }) =>
              ["superadmin", "group_ceo"].includes(assignedRole),
            ),
          };
        }));
        setOrganizations(organizationRecords.map((organization) => {
          const creator = creatorsById.get(organization.created_by);
          const counts = membershipCounts.get(organization.id) ?? { active: 0, suspended: 0 };
          const status = counts.active > 0 ? "active" : counts.suspended > 0 ? "suspended" : "no_members";
          return {
            id: organization.id,
            name: organization.name,
            website: organization.website,
            industry: organization.industry,
            creatorName: creator?.full_name ?? null,
            creatorEmail: creator?.email ?? null,
            branch: branches.get(organization.branch_id) ?? "Branch",
            createdAt: organization.created_at,
            status,
            memberCount: counts.active + counts.suspended,
          };
        }));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load platform users.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDirectory();
    return () => {
      active = false;
    };
  }, [view]);

  const toggleStaffSelection = (userId: string, checked: boolean | "indeterminate") => {
    setSelectedStaffIds((current) => {
      const next = new Set(current);
      if (checked === true) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const deleteSelectedStaff = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || selectedStaffIds.size === 0) return;
    setDeleting(true);
    let deletedCount = 0;
    let failure = "";
    const selectedIds = [...selectedStaffIds];

    for (const userId of selectedIds) {
      const { data, error: deleteError } = await supabase.functions.invoke("manage-platform-account", {
        body: { user_id: userId, account_type: "staff", action: "delete" },
      });
      if (deleteError || data?.error) {
        failure = await getAccountActionError(deleteError, data?.error, "Could not delete the selected account.");
        break;
      }
      deletedCount += 1;
    }

    if (deletedCount > 0) {
      const deletedIds = new Set(selectedIds.slice(0, deletedCount));
      setStaff((current) => current.filter(({ id }) => !deletedIds.has(id)));
      setSelectedStaffIds(new Set(selectedIds.slice(deletedCount)));
      toast.success(`${deletedCount} staff account${deletedCount === 1 ? "" : "s"} deleted.`);
    }
    if (failure) toast.error(failure);
    setDeleting(false);
    setDeleteDialogOpen(false);
  };

  const updateTenantAccount = async (organization: RegisteredOrganization, action: "suspend" | "activate" | "delete") => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdatingTenantId(organization.id);
    const { data, error: actionError } = await supabase.functions.invoke("manage-platform-account", {
      body: { organization_id: organization.id, account_type: "tenant", action },
    });
    if (actionError || data?.error) {
      toast.error(await getAccountActionError(actionError, data?.error, "Could not update the tenant account."));
    } else if (action === "delete") {
      setOrganizations((current) => current.filter(({ id }) => id !== organization.id));
      toast.success("Organization registration deleted.");
    } else {
      setOrganizations((current) => current.map((item) => item.id === organization.id
        ? { ...item, status: action === "suspend" ? "suspended" : "active" }
        : item));
      toast.success(action === "suspend" ? "Organization access suspended." : "Organization access reactivated.");
    }
    setUpdatingTenantId("");
    setTenantAction(null);
  };

  // ---------- Derived data ----------
  const selectedStaff = staff.filter(({ id }) => selectedStaffIds.has(id));
  const staffRoleOptions = useMemo(
    () => [...new Set(staff.flatMap(({ roleLabels }) => roleLabels))].sort(),
    [staff],
  );
  const visibleStaff = useMemo(() => staff.filter((member) => {
    const query = staffSearch.trim().toLowerCase();
    const matchesSearch = !query || [member.full_name, member.email, member.branchName, ...member.roleLabels]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch && (staffRoleFilter === "all" || member.roleLabels.includes(staffRoleFilter));
  }), [staff, staffSearch, staffRoleFilter]);

  const organizationBranchOptions = useMemo(
    () => [...new Set(organizations.map(({ branch }) => branch))].sort(),
    [organizations],
  );
  const visibleOrganizations = useMemo(() => organizations.filter((organization) => {
    const query = organizationSearch.trim().toLowerCase();
    const matchesSearch = !query || [organization.name, organization.creatorName, organization.creatorEmail, organization.industry, organization.branch]
      .some((value) => value?.toLowerCase().includes(query));
    const matchesStatus = organizationStatusFilter === "all" || organization.status === organizationStatusFilter;
    const matchesBranch = organizationBranchFilter === "all" || organization.branch === organizationBranchFilter;
    return matchesSearch && matchesStatus && matchesBranch;
  }), [organizations, organizationSearch, organizationStatusFilter, organizationBranchFilter]);

  const visibleTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = !query || [ticket.subject, ticket.tenant_id, ticket.raised_by]
        .some((value) => value?.toLowerCase().includes(query));
      if (!matchesSearch) return false;
      if (ticketTab === "all") return true;
      if (ticketTab === "urgent") return ticket.priority === "urgent";
      if (ticketTab === "unassigned") return !ticket.assignee_id;
      return ticket.status === ticketTab;
    });
  }, [tickets, ticketSearch, ticketTab]);

  const ticketCounts = useMemo(() => ({
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    urgent: tickets.filter((t) => t.priority === "urgent").length,
    unassigned: tickets.filter((t) => !t.assignee_id).length,
  }), [tickets]);

  const auditActionOptions = useMemo(
    () => [...new Set(auditEntries.map(({ action }) => action))].sort(),
    [auditEntries],
  );
  const visibleAudit = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditEntries.filter((entry) => {
      const matchesSearch = !query || [entry.actor_email, entry.action, entry.target_type, entry.target_id]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesAction = auditActionFilter === "all" || entry.action === auditActionFilter;
      return matchesSearch && matchesAction;
    });
  }, [auditEntries, auditSearch, auditActionFilter]);

  // Analytics-derived
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const member of staff) {
      for (const label of member.roleLabels) {
        const base = label.split(" · ")[0];
        counts[base] = (counts[base] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [staff]);

  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const org of organizations) {
      counts[org.branch] = (counts[org.branch] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [organizations]);

  const weeklySignups = useMemo(() => {
    const buckets: { weekLabel: string; count: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(now);
      start.setDate(now.getDate() - i * 7 - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      end.setHours(23, 59, 59, 999);
      const count = organizations.filter(({ createdAt }) => {
        const d = new Date(createdAt).getTime();
        return d >= start.getTime() && d <= end.getTime();
      }).length;
      buckets.push({
        weekLabel: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count,
      });
    }
    return buckets;
  }, [organizations]);

  const tenantStatusCounts = useMemo(() => ({
    active: organizations.filter((o) => o.status === "active").length,
    suspended: organizations.filter((o) => o.status === "suspended").length,
    no_members: organizations.filter((o) => o.status === "no_members").length,
  }), [organizations]);

  const urgentOpen = useMemo(
    () => tickets.filter((t) => t.priority === "urgent" && (t.status === "open" || t.status === "in_progress")).length,
    [tickets],
  );

  const headerTitle =
    view === "overview" ? `${greetingState.greeting}, ${firstName}.`
    : view === "staff" ? "Office & Co staff"
    : view === "tenants" ? "Tenant accounts"
    : view === "support" ? "Support tickets"
    : view === "audit" ? "Audit log"
    : "Platform analytics";

  const headerDescription =
    view === "overview" ? "Platform health and account totals across WorkspaceOS."
    : view === "staff" ? "Manage Office & Co staff access across WorkspaceOS."
    : view === "tenants" ? "Review tenant members and manage their application access."
    : view === "support" ? "Triage and resolve support tickets raised across tenants."
    : view === "audit" ? "Immutable record of administrative actions taken on the platform."
    : "Trends, distribution, and platform health across WorkspaceOS.";

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow={`${role.title} · ${greetingState.dateLabel}`}
        title={headerTitle}
        description={headerDescription}
      />
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Could not load platform users: {error}
        </p>
      )}

      {/* ---------------- OVERVIEW ---------------- */}
      {view === "overview" && <>
        {communityStatsError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Could not load community statistics: {communityStatsError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Live posts" value={communityStats ? String(communityStats.livePosts) : "—"} accent="brand" />
          <StatCard label="Posts this week" value={communityStats ? String(communityStats.postsThisWeek) : "—"} accent="success" />
          <StatCard label="Open reports" value={communityStats ? String(communityStats.openReports) : "—"} accent="warning" />
          <StatCard label="Reactions" value={communityStats ? String(communityStats.reactions) : "—"} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Staff accounts" value={loading ? "—" : String(staff.length)} hint="Office & Co email domains" accent="brand" />
          <StatCard label="Registered organizations" value={loading ? "—" : String(organizations.length)} hint="With or without an active lease" accent="success" />
          <StatCard label="Suspended organizations" value={loading ? "—" : String(tenantStatusCounts.suspended)} hint="Organization access disabled" />
          <StatCard label="Open support" value={openSupportCount === null ? "—" : String(openSupportCount)} hint={`${urgentOpen} urgent`} accent="warning" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active tenants" value={loading ? "—" : String(tenantStatusCounts.active)} hint="With an active member" accent="success" />
          <StatCard label="No members" value={loading ? "—" : String(tenantStatusCounts.no_members)} hint="Registration only" />
          <StatCard label="Staff roles assigned" value={loading ? "—" : String(roleCounts.reduce((sum, [, n]) => sum + n, 0))} hint="Across all staff" accent="brand" />
          <StatCard label="Audit events" value={loading ? "—" : String(auditEntries.length)} hint="Most recent 500" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickAction icon={LifeBuoy} label="Support queue" to="/support" badge={openSupportCount ?? 0} />
          <QuickAction icon={Building2} label="Tenant accounts" to="/tenant-access" />
          <QuickAction icon={Users} label="Staff directory" to="/staff" />
          <QuickAction icon={Settings2} label="Role settings" to="/settings/roles" />
        </div>

        {/* Recent activity strip */}
        {!loading && auditEntries.length > 0 && (
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-display text-sm font-semibold">Recent activity</h2>
              <Button asChild size="sm" variant="ghost">
                <Link to="/audit">View all<ChevronRight className="size-4" /></Link>
              </Button>
            </div>
            <ul className="divide-y text-sm">
              {auditEntries.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Activity className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{entry.actor_email ?? "system"}</span>
                    <span className="text-muted-foreground"> — {entry.action}</span>
                    {entry.target_type && <span className="text-muted-foreground"> · {entry.target_type}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>}

      {/* ---------------- STAFF ---------------- */}
      {view === "staff" && <>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Office &amp; Co staff</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Loading staff accounts…" : `${visibleStaff.length} of ${staff.length} staff accounts`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedStaffIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
                  <Trash2 className="size-4" />Delete selected ({selectedStaffIds.size})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => exportCsv(
                "office-co-staff.csv",
                ["Name", "Email", "Platform roles", "Branch"],
                visibleStaff.map((member) => [member.full_name, member.email, member.roleLabels.join("; "), member.branchName]),
              )}>Export CSV</Button>
              <Button asChild size="sm" variant="outline"><Link to="/settings/roles">Role settings</Link></Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search staff…" className="pl-9" />
            </div>
            <Select value={staffRoleFilter} onValueChange={setStaffRoleFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {staffRoleOptions.map((staffRole) => <SelectItem key={staffRole} value={staffRole}>{staffRole}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading staff accounts…</div>
          ) : error ? (
            <p className="p-4 text-sm text-muted-foreground">Staff list unavailable.</p>
          ) : visibleStaff.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No staff accounts match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                    <th className="px-4 py-3 font-medium">Staff member</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Platform roles</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleStaff.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedStaffIds.has(member.id)}
                          onCheckedChange={(checked) => toggleStaffSelection(member.id, checked)}
                          disabled={!member.canDelete || deleting}
                          aria-label={`Select ${member.email ?? member.full_name ?? "staff account"} for deletion`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{member.full_name || "Unnamed staff member"}</td>
                      <td className="px-4 py-3">{member.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {member.roleLabels.length > 0
                            ? member.roleLabels.map((label) => <Badge key={label} variant="outline" className="capitalize">{label}</Badge>)
                            : <span className="text-muted-foreground">No platform role</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{member.branchName ?? "Group-wide / unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>}

      {/* ---------------- TENANTS ---------------- */}
      {view === "tenants" && <>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Registered organizations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Loading organizations…" : `${visibleOrganizations.length} of ${organizations.length} registered organizations`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => exportCsv(
                "registered-organizations.csv",
                ["Organization", "Registered by", "Email", "Branch", "Industry", "Status", "Members", "Registered"],
                visibleOrganizations.map((organization) => [organization.name, organization.creatorName, organization.creatorEmail, organization.branch, organization.industry, organization.status, organization.memberCount, organization.createdAt]),
              )}>Export CSV</Button>
              <Button asChild size="sm" variant="outline"><Link to="/tenants">Tenant records</Link></Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={organizationSearch} onChange={(event) => setOrganizationSearch(event.target.value)} placeholder="Search organizations…" className="pl-9" />
            </div>
            <Select value={organizationStatusFilter} onValueChange={setOrganizationStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="no_members">No members</SelectItem>
              </SelectContent>
            </Select>
            <Select value={organizationBranchFilter} onValueChange={setOrganizationBranchFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {organizationBranchOptions.map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading organizations…</div>
          ) : error ? (
            <p className="p-4 text-sm text-muted-foreground">Tenant list unavailable.</p>
          ) : visibleOrganizations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No organizations match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">Registered by</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Registered</th>
                    <th className="px-4 py-3 font-medium">Members</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleOrganizations.map((organization) => (
                    <tr key={organization.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        <div>{organization.name}</div>
                        {organization.website && <a className="text-xs text-muted-foreground hover:underline" href={organization.website} target="_blank" rel="noreferrer">{organization.website}</a>}
                      </td>
                      <td className="px-4 py-3">{organization.creatorName || organization.creatorEmail || "—"}</td>
                      <td className="px-4 py-3">{organization.branch}</td>
                      <td className="px-4 py-3">{new Date(organization.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{organization.memberCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={organization.status === "active" ? "secondary" : organization.status === "suspended" ? "destructive" : "outline"} className="capitalize">{organization.status.replaceAll("_", " ")}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={Boolean(updatingTenantId) || organization.status === "no_members"} onClick={() => void updateTenantAccount(organization, organization.status === "active" ? "suspend" : "activate")}>
                            {updatingTenantId === organization.id ? <LoaderCircle className="size-4 animate-spin" /> : organization.status === "active" ? <CirclePause className="size-4" /> : <CircleCheck className="size-4" />}
                            {organization.status === "active" ? "Suspend" : "Reactivate"}
                          </Button>
                          <Button size="icon" variant="destructive" title="Delete organization registration" aria-label={`Delete ${organization.name}`} disabled={Boolean(updatingTenantId)} onClick={() => setTenantAction({ organization, action: "delete" })}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>}

      {/* ---------------- SUPPORT ---------------- */}
      {view === "support" && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total tickets" value={loading ? "—" : String(ticketCounts.all)} hint="Most recent 300" accent="brand" />
          <StatCard label="Open" value={loading ? "—" : String(ticketCounts.open)} hint="Awaiting first response" accent="warning" />
          <StatCard label="In progress" value={loading ? "—" : String(ticketCounts.in_progress)} hint="Being worked on" />
          <StatCard label="Urgent" value={loading ? "—" : String(ticketCounts.urgent)} hint="Highest priority" />
        </div>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Support queue</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Loading tickets…" : `${visibleTickets.length} of ${tickets.length} tickets`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => exportCsv(
              "support-tickets.csv",
              ["Subject", "Status", "Priority", "Organization", "Created by", "Assignee", "Created"],
              visibleTickets.map((t) => [t.subject, t.status, t.priority, t.tenant_id, t.raised_by, t.assignee_id, t.created_at]),
            )}>Export CSV</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Search tickets…" className="pl-9" />
            </div>
          </div>
          <Tabs value={ticketTab} onValueChange={(value) => setTicketTab(value as typeof ticketTab)}>
            <div className="px-4 pt-3">
              <TabsList>
                <TabsTrigger value="all">All ({ticketCounts.all})</TabsTrigger>
                <TabsTrigger value="open">Open ({ticketCounts.open})</TabsTrigger>
                <TabsTrigger value="in_progress">In progress ({ticketCounts.in_progress})</TabsTrigger>
                <TabsTrigger value="urgent">Urgent ({ticketCounts.urgent})</TabsTrigger>
                <TabsTrigger value="unassigned">Unassigned ({ticketCounts.unassigned})</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value={ticketTab} className="mt-0">
              {loading ? (
                <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading tickets…</div>
              ) : visibleTickets.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No tickets match this view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-y bg-muted/30 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Priority</th>
                        <th className="px-4 py-3 font-medium">Assignee</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                        <th className="px-4 py-3 font-medium">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleTickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2">
                              {ticket.priority === "urgent" && <AlertTriangle className="size-4 text-destructive" />}
                              <span>{ticket.subject}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(ticket.status)} className="capitalize">{ticket.status.replaceAll("_", " ")}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={priorityVariant(ticket.priority)} className="capitalize">{ticket.priority}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {ticket.assignee_id
                              ? <span className="text-muted-foreground">Assigned</span>
                              : <Badge variant="outline">Unassigned</Badge>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">{relativeTime(ticket.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </>}

      {/* ---------------- AUDIT ---------------- */}
      {view === "audit" && <>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Audit log</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Loading events…" : `${visibleAudit.length} of ${auditEntries.length} events`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => exportCsv(
              "audit-log.csv",
              ["Actor", "Action", "Target type", "Target ID", "Timestamp"],
              visibleAudit.map((e) => [e.actor_email, e.action, e.target_type, e.target_id, e.created_at]),
            )}>Export CSV</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search audit events…" className="pl-9" />
            </div>
            <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {auditActionOptions.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading audit log…</div>
          ) : visibleAudit.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <FileText className="size-8 text-muted-foreground/60" />
              <p>No audit events recorded yet.</p>
              <p className="text-xs">Create an <code>audit_log</code> table to start tracking administrative actions.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {visibleAudit.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20">
                  <div className="rounded-md bg-primary/10 p-1.5 text-primary"><Activity className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{entry.actor_email ?? entry.actor_id ?? "system"}</span>
                      <span className="text-muted-foreground"> performed </span>
                      <Badge variant="outline" className="mx-1">{entry.action}</Badge>
                      {entry.target_type && <span className="text-muted-foreground"> on {entry.target_type}</span>}
                    </p>
                    {entry.target_id && (
                      <p className="truncate text-xs text-muted-foreground">{entry.target_id}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>}

      {/* ---------------- ANALYTICS ---------------- */}
      {view === "analytics" && <>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-semibold">Tenant status breakdown</h2>
            </div>
            <div className="mt-4 space-y-3">
              {(["active", "suspended", "no_members"] as const).map((key) => {
                const count = tenantStatusCounts[key];
                const pct = organizations.length ? Math.round((count / organizations.length) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize">{key.replaceAll("_", " ")}</span>
                      <span className="text-muted-foreground">{count} · {pct}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div
                        className={`h-2 rounded-full ${key === "active" ? "bg-success" : key === "suspended" ? "bg-destructive" : "bg-muted-foreground"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-semibold">New tenant signups (8 weeks)</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              {weeklySignups.map((bucket, index) => {
                const max = Math.max(1, ...weeklySignups.map((b) => b.count));
                const height = `${Math.max(4, (bucket.count / max) * 100)}%`;
                return (
                  <div key={`${bucket.weekLabel}-${index}`} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end">
                      <div className="w-full rounded-t bg-primary/70" style={{ height }} title={`${bucket.count} signups`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{bucket.weekLabel}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-semibold">Staff role distribution</h2>
            </div>
            {roleCounts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No role assignments yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {roleCounts.slice(0, 8).map(([role, count]) => {
                  const max = roleCounts[0]?.[1] ?? 1;
                  return (
                    <li key={role} className="flex items-center gap-2">
                      <span className="w-40 truncate capitalize">{role}</span>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary/70" style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                      </div>
                      <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-semibold">Tenants per branch</h2>
            </div>
            {branchCounts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No organizations registered yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {branchCounts.map(([branch, count]) => {
                  const max = branchCounts[0]?.[1] ?? 1;
                  return (
                    <li key={branch} className="flex items-center gap-2">
                      <span className="w-40 truncate">{branch}</span>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-success/70" style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                      </div>
                      <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-muted-foreground" />
            <h2 className="font-display text-sm font-semibold">Platform summary</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Staff</dt>
              <dd className="mt-1 text-lg font-semibold">{staff.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Tenants</dt>
              <dd className="mt-1 text-lg font-semibold">{organizations.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Open tickets</dt>
              <dd className="mt-1 text-lg font-semibold">{openSupportCount ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Audit events</dt>
              <dd className="mt-1 text-lg font-semibold">{auditEntries.length}</dd>
            </div>
          </dl>
        </section>
      </>}

      {/* ---------------- DIALOGS ---------------- */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected staff account{selectedStaff.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected login account, profile, platform roles, and tenant memberships. This cannot be undone.
              <span className="mt-2 block font-medium text-foreground">
                {selectedStaff.map(({ full_name, email }) => full_name || email).join(", ")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || selectedStaff.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedStaff();
              }}
            >
              {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete account{selectedStaff.length === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={tenantAction !== null} onOpenChange={(open) => { if (!open && !updatingTenantId) setTenantAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tenant account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the organization registration and its memberships. This cannot be undone.
              <span className="mt-2 block font-medium text-foreground">{tenantAction?.organization.name}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(updatingTenantId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(updatingTenantId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => {
              event.preventDefault();
              if (tenantAction) void updateTenantAccount(tenantAction.organization, tenantAction.action);
            }}>
              {updatingTenantId ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}