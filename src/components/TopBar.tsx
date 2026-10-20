import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bell, Search, Plus, Command, Users } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/BrandLogo";
import { getSupabaseClient } from "@/lib/supabase";

export function TopBar() {
  const { role, showCommunity, setShowCommunity, canAccessUrl } = useRole();
  const isCEO = role.id === "group-ceo";
  const canManagePlatformRoles = ["group-admin", "group-ceo", "superadmin"].includes(role.id);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    body: string | null;
    url: string | null;
    read_at: string | null;
    created_at: string;
  }>>([]);
  const isOrganizationUser = role.id === "organization-admin" || role.id === "organization-member";
  const isOrganizationMember = role.id === "organization-member";
  const actionOptions = isOrganizationMember
    ? [
        { label: "Open community feed", href: "/community" },
        { label: "Visit the café", href: "/cafe" },
        { label: "Browse marketplace", href: "/marketplace" },
        { label: "Manage your profile", href: "/account" },
      ]
    : isOrganizationUser
      ? [
          { label: "Book a room or space", href: "/bookings" },
          { label: "Place a café order", href: "/cafe" },
          { label: "Get support", href: "/support" },
          { label: "Browse marketplace", href: "/marketplace" },
        ]
      : ["crm-manager", "sales-manager", "rosebank-sales"].includes(role.id)
        ? [
            { label: "Create a lead", href: "/crm" },
            { label: "Add a tenant", href: "/tenants" },
            { label: "Open bookings", href: "/bookings" },
          ]
        : role.id === "finance"
          ? [
              { label: "Create invoice", href: "/billing" },
              { label: "Review tenant accounts", href: "/tenants" },
            ]
          : role.id === "branch-manager"
            ? [
                { label: "Manage facilities", href: "/facilities" },
                { label: "Review bookings", href: "/bookings" },
                { label: "Resolve support", href: "/support" },
              ]
            : [
                { label: "New listing", href: "/marketplace" },
                { label: "New invoice draft", href: "/billing" },
                { label: "New content", href: "/content" },
                { label: "New tenant", href: "/tenants" },
              ];
  const quickActions = actionOptions.filter((action) => canAccessUrl(action.href));

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    let notificationChannel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows, error } = await supabase
        .from("notifications")
        .select("id,title,body,url,read_at,created_at")
        .eq("profile_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!active) return;
      if (error) console.error("Notification load failed:", error.message);
      else setNotifications(rows ?? []);
      notificationChannel = supabase
        .channel(`profile-notifications-${data.user.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${data.user.id}`,
        }, (payload) => {
          if (!active) return;
          setNotifications((current) => [payload.new as (typeof current)[number], ...current].slice(0, 8));
        })
        .subscribe();
    });
    return () => {
      active = false;
      if (notificationChannel) void supabase.removeChannel(notificationChannel);
    };
  }, [role.id]);

  const markNotificationRead = async (notificationId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("id", notificationId);
    if (error) return;
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: readAt } : item));
  };
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

  return (
    <header className="sticky top-0 z-20 h-14 border-b bg-background/80 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-4">
        <div className="flex items-center gap-2 lg:hidden">
          <Link to="/" className="flex items-center md:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-primary shadow-soft shrink-0">
              <BrandLogo className="size-5 object-contain" />
            </div>
          </Link>
          <SidebarTrigger />
        </div>

        <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-display text-foreground font-medium">WorkspaceOS</span>
          <span className="opacity-40">/</span>
          <span className="truncate max-w-65">{role.scope}</span>
        </div>
        <div className="hidden min-w-0 items-center text-sm text-muted-foreground md:flex lg:hidden">
          <span className="truncate">{role.scope}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden xl:block w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={
                isOrganizationMember ? "Search your workspace…" : "Search tenants, rooms, invoices…"
              }
              className="pl-9 pr-12 h-9 bg-muted/40 border-transparent focus-visible:bg-card"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden xl:inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Command className="size-2.5" />K
            </kbd>
          </div>

          <Badge variant="outline" className="hidden sm:inline-flex">
            {role.title}
          </Badge>

          {isCEO && (
            <div className="hidden lg:flex items-center gap-2 rounded-md border bg-card/60 px-2.5 h-9">
              <Users className="size-3.5 text-muted-foreground" />
              <Label
                htmlFor="community-toggle"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Feed
              </Label>
              <Switch
                id="community-toggle"
                checked={showCommunity}
                onCheckedChange={setShowCommunity}
              />
            </div>
          )}

          <Badge variant="outline" className="hidden lg:inline-flex text-[10px] gap-1">
            <span className="size-1.5 rounded-full bg-success" /> Live
          </Badge>

          {quickActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="hidden h-9 gap-1.5 md:flex">
                  <Plus className="size-4" />
                  {isOrganizationMember ? "Explore" : isOrganizationUser ? "Book" : "New"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  {isOrganizationMember
                    ? "Your workspace"
                    : isOrganizationUser
                      ? `For ${role.tenant ?? "your organization"}`
                      : "Quick actions"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.map((action) => (
                  <DropdownMenuItem key={action.label} asChild>
                    <Link to={action.href} className="flex items-center justify-between">
                      <span>{action.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative size-9 shrink-0">
                <Bell className="size-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
              ) : notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  asChild={Boolean(notification.url)}
                  onSelect={() => void markNotificationRead(notification.id)}
                  className="flex flex-col items-start gap-0.5"
                >
                  {notification.url ? (
                    <Link to={notification.url} className="w-full">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {!notification.read_at && <span className="size-1.5 rounded-full bg-brand" />}
                        {notification.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{notification.body ?? new Date(notification.created_at).toLocaleString()}</span>
                    </Link>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{notification.title}</span>
                      <span className="text-xs text-muted-foreground">{notification.body ?? new Date(notification.created_at).toLocaleString()}</span>
                    </>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                <Avatar className="size-9 border border-border/70 bg-muted/60">
                  <AvatarFallback className="bg-brand-soft text-brand text-[11px] font-semibold">
                    {role.initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{role.user}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/account">Account</Link>
              </DropdownMenuItem>
              {canManagePlatformRoles && (
                <DropdownMenuItem asChild>
                  <Link to="/settings/roles">Platform settings</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void getSupabaseClient()?.auth.signOut()}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
