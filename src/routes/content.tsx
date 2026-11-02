import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { Headphones, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreatorStudioPanel } from "./content.manage";

export const Route = createFileRoute("/content")({
  head: () => ({ meta: [{ title: "Content Hub — WorkspaceOS" }] }),
  component: Content,
});

function Content() {
  const { role } = useRole();
  const isDirectStudioRoute = useRouterState({
    select: (state) => state.location.pathname === "/content/manage",
  });
  const canEdit = ["group-ceo", "branch-manager", "community-manager"].includes(role.id);
  const [items, setItems] = useState<PublishedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("The content library is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .from("content_items")
      .select("id,title,kind,host,duration,plays,media_url,published,created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError(queryError.message);
        } else {
          setItems((data ?? []) as PublishedContent[]);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const totalPlays = items.reduce((sum, item) => sum + (item.plays ?? 0), 0);
  const podcastCount = items.filter((item) => item.kind.toLowerCase().includes("podcast")).length;
  const featured = [...items].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))[0];

  if (isDirectStudioRoute) return <Outlet />;

  return (
    <div className="mx-auto max-w-325">
      <PageHeader
        eyebrow="Podcast & Content Hub"
        title="The Office & Co library"
        description="Published podcasts, interviews, training, and resources from the Office & Co library."
        actions={
          canEdit ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">Creator Studio</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Creator Studio</DialogTitle>
                  <DialogDescription>
                    Create, edit, and publish Podcast library content.
                  </DialogDescription>
                </DialogHeader>
                <CreatorStudioPanel inDialog />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Published content" value={loading ? "—" : String(items.length)} />
        <StatCard label="Podcasts" value={loading ? "—" : String(podcastCount)} accent="brand" />
        <StatCard
          label="Recorded plays"
          value={loading ? "—" : new Intl.NumberFormat().format(totalPlays)}
          accent="success"
        />
        <StatCard
          label="Media attached"
          value={loading ? "—" : String(items.filter((item) => item.media_url).length)}
          hint="Published items"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Content library unavailable: {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading published content
        </div>
      ) : items.length === 0 && !error ? (
        <div className="grid justify-items-center gap-2 border-y py-16 text-center">
          <Headphones className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No published content yet</p>
        </div>
      ) : (
        <>
          {featured && (
            <section className="mb-6 border-y py-5">
              <Badge variant="outline" className="mb-3">
                Most-played published item
              </Badge>
              <h2 className="font-display text-xl font-semibold">{featured.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {featured.kind}
                {featured.host ? ` · ${featured.host}` : ""}
                {featured.duration ? ` · ${featured.duration}` : ""}
              </p>
              {featured.media_url &&
                (featured.kind.toLowerCase().includes("video") ? (
                  <video
                    controls
                    preload="none"
                    src={featured.media_url}
                    className="mt-4 max-h-96 w-full rounded-md bg-black"
                  />
                ) : (
                  <audio controls preload="none" src={featured.media_url} className="mt-4 w-full" />
                ))}
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="card-soft p-4">
                <div className="mb-3 grid h-28 place-items-center rounded-md bg-muted">
                  <Headphones className="size-8 text-muted-foreground" />
                </div>
                <Badge variant="outline" className="mb-1.5 text-[10px]">
                  {item.kind}
                </Badge>
                <h3 className="text-sm font-medium leading-tight">{item.title}</h3>
                {item.host && <p className="mt-1 text-[11px] text-muted-foreground">{item.host}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {item.duration ? `${item.duration} · ` : ""}
                  {(item.plays ?? 0).toLocaleString()} plays
                </p>
                {item.media_url && (
                  <a
                    className="mt-3 inline-block text-xs font-medium text-brand hover:underline"
                    href={item.media_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open media
                  </a>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type PublishedContent = {
  id: string;
  title: string;
  kind: string;
  host: string | null;
  duration: string | null;
  plays: number | null;
  media_url: string | null;
  published: boolean;
  created_at: string;
};
