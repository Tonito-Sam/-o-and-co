import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bell, Search, Plus, Command, UserCog, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { ROLES, type RoleId } from "@/lib/mock";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function TopBar() {
  const { role, setRoleId, showCommunity, setShowCommunity } = useRole();
  const isCEO = role.id === "group-ceo";
  return (
    <header className="sticky top-0 z-20 h-14 border-b bg-background/80 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-4">
        <SidebarTrigger />
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-display text-foreground font-medium">WorkspaceOS</span>
          <span className="opacity-40">/</span>
          <span className="truncate max-w-[260px]">{role.scope}</span>
        </div>

        <div className="relative ml-auto hidden md:block w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tenants, rooms, invoices…" className="pl-9 pr-12 h-9 bg-muted/40 border-transparent focus-visible:bg-card" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Command className="size-2.5" />K
          </kbd>
        </div>

        <Select value={role.id} onValueChange={(v) => setRoleId(v as RoleId)}>
          <SelectTrigger className="h-9 w-[230px] hidden sm:flex gap-1.5">
            <UserCog className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wider">View as</SelectLabel>
              {ROLES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{r.user}</span>
                    <span className="text-muted-foreground text-xs">· {r.title}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {isCEO && (
          <div className="hidden lg:flex items-center gap-2 rounded-md border bg-card/60 px-2.5 h-9">
            <Users className="size-3.5 text-muted-foreground" />
            <Label htmlFor="community-toggle" className="text-xs text-muted-foreground cursor-pointer">Community</Label>
            <Switch id="community-toggle" checked={showCommunity} onCheckedChange={setShowCommunity} />
          </div>
        )}

        <Badge variant="outline" className="hidden lg:inline-flex text-[10px] gap-1">
          <span className="size-1.5 rounded-full bg-success" /> Live
        </Badge>


        <Button size="sm" className="h-9 gap-1.5">
          <Plus className="size-4" /> New
        </Button>

        <Button variant="ghost" size="icon" className="relative size-9">
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-brand" />
        </Button>
      </div>
    </header>
  );
}
