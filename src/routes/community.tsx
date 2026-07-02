import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { communityPosts } from "@/lib/mock";
import { Heart, MessageCircle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — WorkspaceOS" }] }),
  component: Community,
});

function Community() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow="Community Platform"
        title="The Office & Co community"
        description="Welcomes, announcements, launches and hiring across every branch. Moderated, automated, alive."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active members" value="1,284" delta="+23" accent="brand" />
        <StatCard label="Posts this week" value="184" delta="▲ 12%" accent="success" />
        <StatCard label="Pending approval" value="6" accent="warning" />
        <StatCard label="Engagement rate" value="62%" hint="Likes + comments" />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="card-soft p-4">
            <Textarea placeholder="Share an update with the community…" className="border-0 resize-none focus-visible:ring-0 px-0" />
            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-xs text-muted-foreground">Posts to public feed are reviewed before publishing</div>
              <Button size="sm" className="gap-1.5"><Sparkles className="size-3.5" />Post</Button>
            </div>
          </div>
          {communityPosts.map((p) => (
            <article key={p.id} className="card-soft p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand text-xs font-medium">
                    {p.author.split(" ").map(w => w[0]).slice(0, 2).join("")}
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{p.author}</div>
                    <div className="text-[11px] text-muted-foreground">{p.role} · {p.time} ago</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{p.kind}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{p.body}</p>
              <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
                <button className="flex items-center gap-1.5 hover:text-foreground"><Heart className="size-3.5" /> {p.reactions}</button>
                <button className="flex items-center gap-1.5 hover:text-foreground"><MessageCircle className="size-3.5" /> {p.comments}</button>
              </div>
            </article>
          ))}
        </div>
        <aside className="space-y-4">
          <div className="card-soft p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Trending</div>
            <ul className="space-y-2 text-sm">
              {["#FoundersBreakfast", "#NewMember", "#AIWorkshop", "#WineDown", "#Hiring"].map(t => (
                <li key={t} className="flex justify-between"><span className="text-brand font-medium">{t}</span><span className="text-[11px] text-muted-foreground">{Math.floor(Math.random() * 40) + 5}</span></li>
              ))}
            </ul>
          </div>
          <div className="card-soft p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Awaiting approval</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Helix Ventures · Launch</span><Button size="sm" variant="ghost" className="h-6 text-[11px]">Review</Button></div>
              <div className="flex justify-between"><span>BrightSeed · Promo</span><Button size="sm" variant="ghost" className="h-6 text-[11px]">Review</Button></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
