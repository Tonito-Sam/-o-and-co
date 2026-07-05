import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Target, Building2, DoorOpen, CalendarRange, Wallet,
  Users, CalendarHeart, Headphones, Coffee, ShoppingBag, LifeBuoy,
  Bell, BarChart3, Sparkles, MessageSquare, Smartphone, Landmark, Settings,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/BrandLogo";
import { useRole } from "@/lib/role-context";

const nav = [
  {
    label: "Executive",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "AI Assistant", url: "/ai-assistant", icon: Sparkles },
    ],
  },
  {
    label: "Revenue",
    items: [
      { title: "CRM & Sales", url: "/crm", icon: Target },
      { title: "Tenants", url: "/tenants", icon: Building2 },
      { title: "Billing", url: "/billing", icon: Wallet },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Facilities", url: "/facilities", icon: DoorOpen },
      { title: "Bookings", url: "/bookings", icon: CalendarRange },
      { title: "Union Station", url: "/union-station", icon: Landmark },
      { title: "Union Station Admin", url: "/union-station-admin", icon: BarChart3 },
      { title: "Support", url: "/support", icon: LifeBuoy },
    ],
  },
  {
    label: "Community & Commerce",
    items: [
      { title: "Feed", url: "/community", icon: Users },
      { title: "Events", url: "/events", icon: CalendarHeart },
      { title: "Content Hub", url: "/content", icon: Headphones },
      { title: "Café", url: "/cafe", icon: Coffee },
      { title: "Marketplace", url: "/marketplace", icon: ShoppingBag },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Messaging", url: "/messaging", icon: MessageSquare },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Member App", url: "/mobile-app", icon: Smartphone },
      { title: "Role Settings", url: "/settings/roles", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, canAccessUrl } = useRole();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary shadow-soft shrink-0">
            <BrandLogo className="size-7 object-contain" />
          </div>
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-semibold">Office &amp; Co</span>
            <span className="text-[11px] text-muted-foreground">WorkspaceOS</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group) => {
          const items = group.items.filter((i) => canAccessUrl(i.url));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand font-medium text-xs">{role.initials}</div>
          <div className="grid leading-tight min-w-0">
            <span className="text-xs font-medium truncate">{role.user}</span>
            <span className="text-[11px] text-muted-foreground truncate">{role.title}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
