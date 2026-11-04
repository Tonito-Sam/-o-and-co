import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  LayoutDashboard,
  Target,
  Building2,
  DoorOpen,
  CalendarRange,
  Wallet,
  Users,
  CalendarHeart,
  Headphones,
  Coffee,
  ShoppingBag,
  LifeBuoy,
  BarChart3,
  MessageSquare,
  Landmark,
  Mail,
  Settings,
  Radar,
  UserRound,
  ClipboardList,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/BrandLogo";
import { useRole } from "@/lib/role-context";

const nav = [
  {
    label: "Executive",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Prospect Intelligence",
    items: [
      { title: "Leads Intelligence", url: "/leads-intelligence", icon: Radar },
      { title: "Crawler Activity", url: "/crawler-intelligence", icon: Activity },
      { title: "Prospect Outreach", url: "/outreach", icon: Mail },
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
    ],
  },
  {
    label: "Community & Commerce",
    items: [
      { title: "Feed", url: "/community", icon: Users },
      { title: "Events", url: "/events", icon: CalendarHeart },
      { title: "Podcast", url: "/content", icon: Headphones },
      { title: "Café", url: "/cafe", icon: Coffee },
      { title: "Marketplace", url: "/marketplace", icon: ShoppingBag },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Messages", url: "/messaging", icon: MessageSquare },
      { title: "Organization", url: "/organization", icon: Building2 },
      { title: "Account", url: "/account", icon: UserRound },
      { title: "Support", url: "/support", icon: LifeBuoy },
      { title: "Role Settings", url: "/settings/roles", icon: Settings },
    ],
  },
];

const salesManagerNav = [
  {
    label: "Sales Workspace",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      { title: "Crawler Activity", url: "/crawler-intelligence", icon: Activity },
      { title: "Leads Intelligence", url: "/leads-intelligence", icon: Radar },
      { title: "Prospect Outreach", url: "/outreach", icon: Mail },
      { title: "CRM Pipeline", url: "/crm", icon: Target },
      { title: "Tenants", url: "/tenants", icon: Building2 },
    ],
  },
  {
    label: "Performance",
    items: [{ title: "Analytics", url: "/analytics", icon: BarChart3 }],
  },
  {
    label: "Business Development",
    items: [
      { title: "Events", url: "/events", icon: CalendarHeart },
      { title: "Feed", url: "/community", icon: Users },
      { title: "Podcast", url: "/content", icon: Headphones },
      { title: "Union Station", url: "/union-station", icon: Landmark },
      { title: "Café", url: "/cafe", icon: Coffee },
      { title: "Marketplace", url: "/marketplace", icon: ShoppingBag },
    ],
  },
  {
    label: "Team Tools",
    items: [
      { title: "Messages", url: "/messaging", icon: MessageSquare },
    ],
  },
];

const groupCeoNav = nav.map((group) => {
  if (group.label === "Executive") return { ...group, label: "Executive Portfolio" };
  if (group.label === "Revenue") {
    return { ...group, items: group.items.filter((item) => item.url !== "/crm") };
  }
  if (group.label === "Operations") {
    return {
      ...group,
      label: "Group Operations",
      items: group.items.flatMap((item) => {
        const titles: Record<string, string> = {
          "/facilities": "Portfolio facilities",
          "/bookings": "Cross-branch bookings",
          "/union-station-admin": "Union Station performance",
          "/support": "Group support health",
        };
        const navItem = { ...item, title: titles[item.url] ?? item.title };
        return item.url === "/facilities"
          ? [navItem, { title: "CRM performance", url: "/crm", icon: Target }]
          : [navItem];
      }),
    };
  }
  return group;
});

const branchManagerNav = nav.map((group) =>
  group.label === "Operations"
    ? {
        ...group,
        items: group.items
          .filter((item) => item.url !== "/union-station")
          .map((item) =>
            item.url === "/union-station-admin" ? { ...item, title: "Union Station" } : item,
          ),
      }
    : group,
);

const cafeManagerNav = nav.map((group) =>
  group.label === "Community & Commerce"
    ? {
        ...group,
        items: group.items.flatMap((item) => item.url === "/cafe"
          ? [item, { title: "Orders", url: "/cafe?view=kitchen", icon: ClipboardList }]
          : [item]),
      }
    : group,
);

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, canAccessUrl } = useRole();
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const revenueGroupLabel = role.id === "tenant-admin" ? "Invoice" : "Revenue";
  const sidebarGroups =
    role.id === "group-ceo"
      ? groupCeoNav
      : role.id === "sales-manager"
        ? salesManagerNav
        : role.id === "branch-manager"
          ? branchManagerNav
            : role.id === "cafe-manager"
              ? cafeManagerNav
              : nav.map((group) =>
              group.label === "Revenue" ? { ...group, label: revenueGroupLabel } : group,
            );

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
        {sidebarGroups.map((group) => {
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
          <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand font-medium text-xs">
            {role.initials}
          </div>
          <div className="grid leading-tight min-w-0">
            <span className="text-xs font-medium truncate">{role.user}</span>
            <span className="text-[11px] text-muted-foreground truncate">{role.title}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
