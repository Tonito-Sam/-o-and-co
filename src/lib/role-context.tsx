import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  ROLES,
  COMMUNITY_MODULES,
  type RoleDef,
  type RoleId,
  type CommunityModuleKey,
} from "@/lib/mock";
import { getSupabaseClient } from "@/lib/supabase";

type ModuleOverrides = Partial<Record<RoleId, Partial<Record<CommunityModuleKey, boolean>>>>;

type Ctx = {
  role: RoleDef;
  isLoading: boolean;
  updateFullName: (name: string) => void;
  roles: RoleDef[];
  showCommunity: boolean;
  setShowCommunity: (v: boolean) => void;
  canSeeRevenue: boolean;
  canSeeInvoiceStatus: boolean;
  /** resolved community module access for current role (with overrides) */
  moduleAccess: Record<CommunityModuleKey, boolean>;
  /** check if any role can access a module (used by Role Settings UI) */
  getRoleAccess: (roleId: RoleId, key: CommunityModuleKey) => boolean;
  setRoleAccess: (roleId: RoleId, key: CommunityModuleKey, value: boolean) => void;
  /** test if a route URL is a community module URL & whether current role can see it */
  canAccessUrl: (url: string) => boolean;
};

const RoleContext = createContext<Ctx | null>(null);
const COMMUNITY_KEY = "woos.ceo.showCommunity";
const OVERRIDES_KEY = "woos.communityOverrides";

const urlToKey = new Map<string, CommunityModuleKey>(COMMUNITY_MODULES.map((m) => [m.url, m.key]));
const organizationRouteSections: Record<string, string[]> = {
  "/bookings": ["rooms"],
  "/facilities": ["offices", "desks", "rooms", "parking", "equipment"],
  "/community": ["feed"],
  "/events": ["events"],
  "/cafe": ["cafe"],
  "/marketplace": ["marketplace", "shop"],
  "/support": ["support"],
};

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>("member");
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [organizationBranch, setOrganizationBranch] = useState<string | null>(null);
  const [assignedBranchName, setAssignedBranchName] = useState<string | null>(null);
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [assignedBranchNames, setAssignedBranchNames] = useState<string[]>([]);
  const [organizationSections, setOrganizationSections] = useState<string[] | null>(null);
  const [showCommunity, setShowCommunity] = useState<boolean>(true);
  const [overrides, setOverrides] = useState<ModuleOverrides>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sc = window.localStorage.getItem(COMMUNITY_KEY);
    if (sc !== null) setShowCommunity(sc === "1");
    const ov = window.localStorage.getItem(OVERRIDES_KEY);
    if (ov) {
      try {
        setOverrides(JSON.parse(ov));
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;
    const roleMap: Record<string, RoleId> = {
      superadmin: "superadmin",
      group_admin: "group-admin",
      group_ceo: "group-ceo",
      crm_manager: "crm-manager",
      sales_manager: "sales-manager",
      rosebank_sales: "rosebank-sales",
      branch_manager: "branch-manager",
      cafe_manager: "cafe-manager",
      community_manager: "community-manager",
      finance: "finance",
      tenant_admin: "tenant-admin",
      member: "member",
    };

    const loadIdentity = async (userId: string, email?: string) => {
      const [roleResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role,branch_id").eq("user_id", userId),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id,branch_id,role")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError)
        console.error("Organization role lookup failed:", membershipError.message);

      const mappedRoles = (roleResult.data ?? [])
        .map(({ role }) => roleMap[role])
        .filter((id): id is RoleId => Boolean(id));
      const rolePriority: RoleId[] = [
        "superadmin",
        "group-admin",
        "group-ceo",
        "crm-manager",
        "sales-manager",
        "rosebank-sales",
        "cafe-manager",
        "branch-manager",
        "community-manager",
        "finance",
        "tenant-admin",
        "member",
      ];
      const platformRole = rolePriority.find((id) => mappedRoles.includes(id));
      const platformRoleRecord = (roleResult.data ?? []).find(
        ({ role }) => roleMap[role] === platformRole,
      );
      let assignedBranch: string | null = null;
      let branchIdsForRole: string[] = [];
      let branchNamesForRole: string[] = [];
      if (platformRoleRecord?.branch_id) {
        branchIdsForRole = (roleResult.data ?? [])
          .filter((assignment) => roleMap[assignment.role] === platformRole && assignment.branch_id)
          .map((assignment) => assignment.branch_id as string);
        const { data } = await supabase
          .from("branches")
          .select("id,name")
          .in("id", branchIdsForRole);
        branchNamesForRole = (data ?? []).map((branch) => branch.name);
        assignedBranch = branchNamesForRole[0] ?? null;
      }
      if (!active) return;
      setAssignedBranchName(assignedBranch);
      setAssignedBranchIds(branchIdsForRole);
      setAssignedBranchNames(branchNamesForRole);
      const organizationRole: RoleId | undefined =
        membership?.role === "admin"
          ? "organization-admin"
          : membership?.role === "member"
            ? "organization-member"
            : undefined;
      setRoleId(
        platformRole && platformRole !== "member"
          ? platformRole
          : (organizationRole ?? platformRole ?? "member"),
      );
      setUserName(profileResult.data?.full_name?.trim() || email || "Workspace member");

      if (membership) {
        const [organizationResult, branchResult, sectionsResult] = await Promise.all([
          supabase
            .from("organizations")
            .select("name")
            .eq("id", membership.organization_id)
            .maybeSingle(),
          supabase.from("branches").select("name").eq("id", membership.branch_id).maybeSingle(),
          supabase
            .from("branch_sections")
            .select("section_key")
            .eq("branch_id", membership.branch_id)
            .eq("enabled", true),
        ]);
        if (!active) return;
        setOrganizationName(organizationResult.data?.name ?? null);
        setOrganizationBranch(branchResult.data?.name ?? null);
        if (sectionsResult.error) {
          console.error(
            "Organization branch sections lookup failed:",
            sectionsResult.error.message,
          );
          setOrganizationSections([]);
        } else {
          setOrganizationSections(
            (sectionsResult.data ?? []).map(({ section_key }) => section_key),
          );
        }
      } else {
        setOrganizationName(null);
        setOrganizationBranch(null);
        setOrganizationSections(null);
      }
      setIsLoading(false);
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        return;
      }
      void loadIdentity(data.user.id, data.user.email);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoading(true);
      if (!session?.user) {
        setRoleId("member");
        setUserName(null);
        setOrganizationName(null);
        setOrganizationBranch(null);
        setOrganizationSections(null);
        setAssignedBranchName(null);
        setAssignedBranchIds([]);
        setAssignedBranchNames([]);
        return;
      }
      window.setTimeout(() => void loadIdentity(session.user.id, session.user.email), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(COMMUNITY_KEY, showCommunity ? "1" : "0");
  }, [showCommunity]);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  }, [overrides]);

  const roleDefinition =
    ROLES.find((r) => r.id === roleId) ?? ROLES.find((r) => r.id === "member")!;
  const initials = userName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const role = {
    ...roleDefinition,
    user: userName ?? roleDefinition.user,
    initials: initials || roleDefinition.initials,
    ...(organizationName
      ? {
          tenant: organizationName,
          scope: `${organizationName}${organizationBranch ? ` · ${organizationBranch}` : ""}`,
        }
      : {}),
    ...(organizationBranch || assignedBranchName
      ? {
          branch: organizationBranch ?? assignedBranchName ?? undefined,
          branchIds: assignedBranchIds,
          branchNames: assignedBranchNames,
          ...(roleDefinition.id === "branch-manager" && assignedBranchNames.length > 0
            ? { title: `Branch Manager · ${assignedBranchNames.join(" + ")}` }
            : {}),
          ...(roleDefinition.id === "branch-manager"
            ? { scope: `${assignedBranchNames.join(", ") || assignedBranchName} · Branch management` }
            : {}),
        }
      : {}),
    ...(roleDefinition.id === "cafe-manager" && assignedBranchName
      ? { scope: `${assignedBranchName} Café` }
      : {}),
  };
  const canSeeRevenue = ["superadmin", "group-admin", "group-ceo", "crm-manager", "finance"].includes(role.id);
  const canSeeInvoiceStatus = ["superadmin", "group-admin", "group-ceo", "finance", "tenant-admin"].includes(
    role.id,
  );

  const getRoleAccess = useCallback(
    (rid: RoleId, key: CommunityModuleKey) => {
      const ov = overrides[rid]?.[key];
      if (typeof ov === "boolean") return ov;
      return ROLES.find((r) => r.id === rid)?.communityModules[key] ?? false;
    },
    [overrides],
  );

  const setRoleAccess = useCallback((rid: RoleId, key: CommunityModuleKey, value: boolean) => {
    setOverrides((prev) => ({ ...prev, [rid]: { ...prev[rid], [key]: value } }));
  }, []);

  const moduleAccess = COMMUNITY_MODULES.reduce(
    (acc, m) => {
      acc[m.key] = getRoleAccess(role.id, m.key);
      return acc;
    },
    {} as Record<CommunityModuleKey, boolean>,
  );

  const canAccessUrl = useCallback(
    (url: string) => {
      if (!role.nav.includes(url)) return false;
      if (role.id === "organization-admin" || role.id === "organization-member") {
        const requiredSections = organizationRouteSections[url];
        if (requiredSections) {
          return (organizationSections ?? []).some((section) => requiredSections.includes(section));
        }
      }
      const key = urlToKey.get(url);
      if (!key) return true;
      // Group CEO master switch
      if (role.id === "group-ceo" && !showCommunity) return false;
      return getRoleAccess(role.id, key);
    },
    [role, showCommunity, getRoleAccess, organizationSections],
  );

  return (
    <RoleContext.Provider
      value={{
        role,
        isLoading,
        updateFullName: setUserName,
        roles: ROLES,
        showCommunity,
        setShowCommunity,
        canSeeRevenue,
        canSeeInvoiceStatus,
        moduleAccess,
        getRoleAccess,
        setRoleAccess,
        canAccessUrl,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
