import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { ROLES, COMMUNITY_MODULES, type RoleDef, type RoleId, type CommunityModuleKey } from "@/lib/mock";

type ModuleOverrides = Partial<Record<RoleId, Partial<Record<CommunityModuleKey, boolean>>>>;

type Ctx = {
  role: RoleDef;
  setRoleId: (id: RoleId) => void;
  roles: RoleDef[];
  showCommunity: boolean;
  setShowCommunity: (v: boolean) => void;
  /** resolved community module access for current role (with overrides) */
  moduleAccess: Record<CommunityModuleKey, boolean>;
  /** check if any role can access a module (used by Role Settings UI) */
  getRoleAccess: (roleId: RoleId, key: CommunityModuleKey) => boolean;
  setRoleAccess: (roleId: RoleId, key: CommunityModuleKey, value: boolean) => void;
  /** test if a route URL is a community module URL & whether current role can see it */
  canAccessUrl: (url: string) => boolean;
};

const RoleContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "woos.role";
const COMMUNITY_KEY = "woos.ceo.showCommunity";
const OVERRIDES_KEY = "woos.communityOverrides";

const urlToKey = new Map<string, CommunityModuleKey>(COMMUNITY_MODULES.map((m) => [m.url, m.key]));

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>("group-ceo");
  const [showCommunity, setShowCommunity] = useState<boolean>(true);
  const [overrides, setOverrides] = useState<ModuleOverrides>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as RoleId | null;
    if (stored && ROLES.find((r) => r.id === stored)) setRoleId(stored);
    const sc = window.localStorage.getItem(COMMUNITY_KEY);
    if (sc !== null) setShowCommunity(sc === "1");
    const ov = window.localStorage.getItem(OVERRIDES_KEY);
    if (ov) {
      try { setOverrides(JSON.parse(ov)); } catch { /* noop */ }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, roleId);
  }, [roleId]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(COMMUNITY_KEY, showCommunity ? "1" : "0");
  }, [showCommunity]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  }, [overrides]);

  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0];

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

  const moduleAccess = COMMUNITY_MODULES.reduce((acc, m) => {
    acc[m.key] = getRoleAccess(role.id, m.key);
    return acc;
  }, {} as Record<CommunityModuleKey, boolean>);

  const canAccessUrl = useCallback(
    (url: string) => {
      if (!role.nav.includes(url)) return false;
      const key = urlToKey.get(url);
      if (!key) return true;
      // Group CEO master switch
      if (role.id === "group-ceo" && !showCommunity) return false;
      return getRoleAccess(role.id, key);
    },
    [role, showCommunity, getRoleAccess],
  );

  return (
    <RoleContext.Provider
      value={{
        role, setRoleId, roles: ROLES, showCommunity, setShowCommunity,
        moduleAccess, getRoleAccess, setRoleAccess, canAccessUrl,
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
