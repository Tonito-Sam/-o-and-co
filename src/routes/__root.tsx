import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";

import appCss from "../styles.css?url";
import faviconImage from "../assets/OCO-Stacked-Logo-White-300px.png";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Toaster } from "@/components/ui/sonner";
import { RoleProvider, useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { LoaderCircle } from "lucide-react";
import { WorkspaceAssistantWidget } from "@/routes/ai-assistant";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border bg-background px-4 py-2 text-sm font-medium">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Office & Co WorkspaceOS" },
      {
        name: "description",
        content:
          "The operating system for Office & Co — sales, tenants, facilities, community, commerce, and executive intelligence in one platform.",
      },
      { property: "og:title", content: "Office & Co WorkspaceOS" },
      {
        property: "og:description",
        content: "Enterprise operating system for coworking and serviced offices.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: faviconImage },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function isPublicRoute(pathname: string) {
  return (
    pathname.startsWith("/auth") ||
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname.startsWith("/checkin") ||
    pathname === "/union-station" ||
    pathname === "/tour-calendar" ||
    pathname === "/tour-request"
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const onboardingRoute = pathname === "/onboarding";
  const publicShell = isPublicRoute(pathname) || onboardingRoute;

  useEffect(() => {
    const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1024px)");
    const syncTabletSidebar = () => setSidebarOpen(!tabletQuery.matches);
    syncTabletSidebar();
    tabletQuery.addEventListener("change", syncTabletSidebar);
    return () => tabletQuery.removeEventListener("change", syncTabletSidebar);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        <RouteAccessGuard pathname={pathname}>
          {publicShell ? (
            <div className="min-h-screen w-full bg-background">
              <Outlet />
              <Toaster />
            </div>
          ) : (
            <AuthenticatedWorkspace sidebarOpen={sidebarOpen} onSidebarOpenChange={setSidebarOpen} />
          )}
        </RouteAccessGuard>
      </RoleProvider>
    </QueryClientProvider>
  );
}

function RouteAccessGuard({ pathname, children }: { pathname: string; children: ReactNode }) {
  const navigate = useNavigate();
  const onboardingRoute = pathname === "/onboarding";
  const [checkingAccess, setCheckingAccess] = useState(!isPublicRoute(pathname));
  const [accessError, setAccessError] = useState("");
  const hasResolvedWorkspaceAccess = useRef(false);

  useEffect(() => {
    if (isPublicRoute(pathname)) {
      hasResolvedWorkspaceAccess.current = false;
      setCheckingAccess(false);
      setAccessError("");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      navigate({ to: pathname === "/" ? "/welcome" : "/auth/sign-in", replace: true });
      return;
    }

    let active = true;
    if (!hasResolvedWorkspaceAccess.current) setCheckingAccess(true);
    setAccessError("");
    const resolveAccess = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !data.session) {
        hasResolvedWorkspaceAccess.current = false;
        navigate({ to: pathname === "/" ? "/welcome" : "/auth/sign-in", replace: true });
        return;
      }

      const [roleResult, membershipResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id),
        supabase
          .from("organization_members")
          .select("status")
          .eq("user_id", data.session.user.id)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      if (!active) return;
      const lookupError = roleResult.error ?? membershipResult.error;
      if (lookupError) {
        hasResolvedWorkspaceAccess.current = false;
        setAccessError("Workspace access could not be verified. Reload the page to try again.");
        setCheckingAccess(false);
        return;
      }

      hasResolvedWorkspaceAccess.current = true;
      const officeRoles = new Set([
        "superadmin",
        "group_admin",
        "group_ceo",
        "crm_manager",
        "sales-manager",
        "rosebank-sales",
        "branch-manager",
        "cafe-manager",
        "community-manager",
        "finance",
      ]);
      const isOfficeStaff = (roleResult.data ?? []).some(({ role }) => officeRoles.has(role));
      const hasOrganization = Boolean(membershipResult.data);
      if (onboardingRoute && (hasOrganization || isOfficeStaff)) {
        navigate({ to: "/", replace: true });
      } else if (!onboardingRoute && !hasOrganization && !isOfficeStaff) {
        navigate({ to: "/onboarding", replace: true });
      }
      setCheckingAccess(false);
    };
    void resolveAccess().catch((error: unknown) => {
      if (!active) return;
      console.error("Workspace access lookup failed:", error);
      setAccessError("Workspace access could not be verified. Reload the page to try again.");
      setCheckingAccess(false);
    });

    return () => {
      active = false;
    };
  }, [navigate, onboardingRoute, pathname]);

  if (!isPublicRoute(pathname) && checkingAccess) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading your workspace
        </div>
      </div>
    );
  }
  if (accessError) {
    return <div className="grid min-h-screen place-items-center px-4 text-center text-sm text-destructive" role="alert">{accessError}</div>;
  }

  return children;
}

function AuthenticatedWorkspace({
  sidebarOpen,
  onSidebarOpenChange,
}: {
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
}) {
  const { role, isLoading } = useRole();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showFloatingAssistant =
    pathname === "/" &&
    ["group-ceo", "branch-manager", "sales-manager", "crm-manager"].includes(role.id);
  const isOrganizationWorkspace =
    role.id === "organization-admin" || role.id === "organization-member";

  if (isLoading) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading your workspace
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={onSidebarOpenChange}>
      <div
        className={`flex min-h-screen w-full bg-background ${isOrganizationWorkspace ? "organization-workspace" : ""}`}
      >
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-8 lg:pb-8">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
      </div>
      {showFloatingAssistant && <WorkspaceAssistantWidget />}
      <Toaster />
    </SidebarProvider>
  );
}
