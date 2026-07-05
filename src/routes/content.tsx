import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { content } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Link } from "@tanstack/react-router";
import { Play, Headphones } from "lucide-react";

export const Route = createFileRoute("/content")({
  head: () => ({ meta: [{ title: "Content Hub — WorkspaceOS" }] }),
  component: Content,
});

function Content() {
  const { role } = useRole();
  const canEdit = ["group-ceo", "sales-manager", "branch-manager", "rosebank-sales", "community-manager", "finance", "lydia-admin"].includes(role.id);
  return (
    <div className="mx-auto max-w-325">
      <PageHeader
        eyebrow="Podcast & Content Hub"
        title="The Office & Co library"
        description="Podcasts, interviews, training and resources — produced in our podcast studios, streamed to every tenant."
        actions={canEdit ? <Link to="/content/manage"><Button size="sm">Edit content</Button></Link> : <Button size="sm">Upload</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total plays (mo)" value="48,210" delta="▲ 22%" accent="success" />
        <StatCard label="Episodes" value="142" />
        <StatCard label="Avg listen" value="68%" hint="of episode" accent="brand" />
        <StatCard label="Subscribers" value="2,184" delta="+184" />
      </div>

      <div className="card-soft overflow-hidden mb-6">
        <div className="grid md:grid-cols-2">
          <div className="h-64 md:h-auto bg-linear-to-br from-primary via-brand to-accent" />
          <div className="p-6 md:p-8 flex flex-col justify-center">
            <Badge variant="outline" className="w-fit mb-3">Featured · Episode 47</Badge>
            <h2 className="font-display text-2xl font-semibold mb-2">Building a category-defining brand in Africa</h2>
            <p className="text-sm text-muted-foreground mb-4">A conversation with three founders who built brands that outgrew their categories — recorded live at Bryanston Studio.</p>
            <div className="flex items-center gap-3">
              <Button className="gap-2"><Play className="size-4 fill-current" /> Play episode</Button>
              <span className="text-xs text-muted-foreground">42 min · 4,820 plays</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {content.map((c) => (
          <div key={c.id} className="card-soft p-4 hover:shadow-elevated transition-shadow cursor-pointer">
            <div className="h-32 rounded-md bg-linear-to-br from-accent to-brand-soft mb-3 grid place-items-center">
              <Headphones className="size-8 text-brand/70" />
            </div>
            <Badge variant="outline" className="text-[10px] mb-1.5">{c.kind}</Badge>
            <div className="text-sm font-medium leading-tight">{c.title}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{c.host}</div>
            <div className="text-[11px] text-muted-foreground mt-2">{c.duration} · {c.plays.toLocaleString()} plays</div>
          </div>
        ))}
      </div>
    </div>
  );
}
