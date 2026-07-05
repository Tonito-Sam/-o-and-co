import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, useRouterState, useNavigate, HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

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
import { RoleProvider } from "@/lib/role-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
          <a href="/" className="rounded-md border bg-background px-4 py-2 text-sm font-medium">Go home</a>
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
      { name: "description", content: "The operating system for Office & Co — sales, tenants, facilities, community, commerce, and executive intelligence in one platform." },
      { property: "og:title", content: "Office & Co WorkspaceOS" },
      { property: "og:description", content: "Enterprise operating system for coworking and serviced offices." },
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
      <head><HeadContent /></head>
      <body suppressHydrationWarning>{children}<Scripts /></body>
    </html>
  );
}

function isPublicRoute(pathname: string) {
  return pathname.startsWith("/auth") || pathname === "/welcome" || pathname.startsWith("/welcome/") || pathname.startsWith("/checkin") || pathname === "/tour-calendar" || pathname === "/tour-request";
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const publicShell = isPublicRoute(pathname);

  useEffect(() => {
    if (publicShell) return;
    if (typeof window === "undefined") return;
    const authed = window.localStorage.getItem("woos.authed") === "1";
    if (!authed) navigate({ to: "/welcome" });
  }, [publicShell, pathname, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        {publicShell ? (
          <div className="min-h-screen w-full bg-background">
            <Outlet />
            <Toaster />
          </div>
        ) : (
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex flex-1 flex-col min-w-0">
                <TopBar />
                <main className="flex-1 px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-8">
                  <Outlet />
                </main>
                <MobileBottomNav />
              </div>
            </div>
            <Toaster />
          </SidebarProvider>
        )}
      </RoleProvider>
    </QueryClientProvider>
  );
}
