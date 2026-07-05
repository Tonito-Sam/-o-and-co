import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, BarChart3, Sparkles, Target, Building2, CalendarRange, Users, Settings, Coffee, ShoppingBag } from "lucide-react";
import { useRole } from "@/lib/role-context";

const items = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "CRM", url: "/crm", icon: Target },
  { title: "Ops", url: "/bookings", icon: CalendarRange },
  { title: "Feed", url: "/community", icon: Users },
  { title: "Café", url: "/cafe", icon: Coffee },
  { title: "Market", url: "/marketplace", icon: ShoppingBag },
  { title: "More", url: "/settings/roles", icon: Settings },
] as const;

const managementOnlyRoles = new Set(["group-ceo", "sales-manager", "branch-manager", "community-manager", "lydia-admin"]);

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { canAccessUrl, role } = useRole();

  const visibleItems = items.filter((item) => {
    if (!canAccessUrl(item.url)) return false;
    if (item.title === "Ops" && !managementOnlyRoles.has(role.id)) return false;
    return true;
  });

  if (visibleItems.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-around gap-1 px-2 py-2">
        {visibleItems.map((item) => {
          const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
          const Icon = item.icon;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] transition-colors ${
                isActive ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <Icon className="mb-1 size-4" />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
