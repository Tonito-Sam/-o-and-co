import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";

export const Route = createFileRoute("/content/manage")({
  head: () => ({ meta: [{ title: "Creator Studio — WorkspaceOS" }] }),
  component: ContentManageRoute,
});

type ContentRecord = {
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

type ContentDraft = {
  title: string;
  kind: string;
  host: string;
  duration: string;
  media_url: string;
  published: boolean;
};

const emptyDraft: ContentDraft = {
  title: "",
  kind: "Podcast",
  host: "",
  duration: "",
  media_url: "",
  published: false,
};

function ContentManageRoute() {
  return <CreatorStudioPanel />;
}

export function CreatorStudioPanel({ inDialog = false }: { inDialog?: boolean }) {
  const { role } = useRole();
  const canEdit = ["group-ceo", "branch-manager", "community-manager"].includes(role.id);
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadContent = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Creator Studio is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("content_items")
      .select("id,title,kind,host,duration,plays,media_url,published,created_at")
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setItems([]);
    } else {
      setItems((data ?? []) as ContentRecord[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canEdit) void loadContent();
  }, [canEdit, loadContent]);

  const beginEdit = (item: ContentRecord) => {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      kind: item.kind,
      host: item.host ?? "",
      duration: item.duration ?? "",
      media_url: item.media_url ?? "",
      published: item.published,
    });
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const saveContent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.kind.trim()) {
      toast.error("Title and content type are required.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      kind: draft.kind.trim(),
      host: draft.host.trim() || null,
      duration: draft.duration.trim() || null,
      media_url: draft.media_url.trim() || null,
      published: draft.published,
    };
    const result = editingId
      ? await supabase
          .from("content_items")
          .update(payload)
          .eq("id", editingId)
          .select("id,title,kind,host,duration,plays,media_url,published,created_at")
          .single()
      : await supabase
          .from("content_items")
          .insert({ ...payload, plays: 0 })
          .select("id,title,kind,host,duration,plays,media_url,published,created_at")
          .single();
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    const saved = result.data as ContentRecord;
    setItems((current) =>
      editingId
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current],
    );
    toast.success(editingId ? "Content updated." : "Content created.");
    resetDraft();
  };

  const unpublish = async (item: ContentRecord) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("content_items")
      .update({ published: false })
      .eq("id", item.id);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, published: false } : row)),
    );
    toast.success("Content unpublished.");
  };

  if (!canEdit) {
    if (inDialog) {
      return (
        <p className="py-6 text-sm text-muted-foreground">
          You do not have permission to manage published content.
        </p>
      );
    }
    return (
      <div className="mx-auto max-w-350">
        <PageHeader
          eyebrow="Content"
          title="Creator Studio"
          description="Content editing is restricted to authorized creators."
          actions={null}
        />
        <p className="border-y py-5 text-sm text-muted-foreground">
          You do not have permission to manage published content.
        </p>
      </div>
    );
  }

  return (
    <div className={inDialog ? "space-y-5" : "mx-auto max-w-350 space-y-5"}>
      {!inDialog && (
        <PageHeader
          eyebrow="Podcast & Content Hub"
          title="Creator Studio"
          description="Create, edit, and publish library content. Published items appear in the Podcast library."
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Content records unavailable: {error}
        </p>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <form onSubmit={(event) => void saveContent(event)} className="space-y-4 border-y py-5">
          <h2 className="font-display text-base font-semibold">
            {editingId ? "Edit content" : "New content"}
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="content-title">Title</Label>
            <Input
              id="content-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="content-kind">Content type</Label>
              <Input
                id="content-kind"
                value={draft.kind}
                onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-host">Host / creator</Label>
              <Input
                id="content-host"
                value={draft.host}
                onChange={(event) => setDraft({ ...draft, host: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-duration">Duration</Label>
              <Input
                id="content-duration"
                value={draft.duration}
                onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-media-url">Media URL</Label>
              <Input
                id="content-media-url"
                type="url"
                value={draft.media_url}
                onChange={(event) => setDraft({ ...draft, media_url: event.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.published}
              onCheckedChange={(published) => setDraft({ ...draft, published })}
            />
            Publish to library
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create content"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetDraft} disabled={saving}>
                Cancel edit
              </Button>
            )}
          </div>
        </form>

        <section className="space-y-3 border-y py-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Content records</h2>
            <Badge variant="outline">{loading ? "Loading" : items.length}</Badge>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading content records…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No content records yet.</p>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.kind}
                    {item.host ? ` · ${item.host}` : ""}
                    {item.duration ? ` · ${item.duration}` : ""}
                  </div>
                  <Badge variant={item.published ? "default" : "secondary"} className="mt-2">
                    {item.published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => beginEdit(item)}>
                    Edit
                  </Button>
                  {item.published && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void unpublish(item)}
                    >
                      Unpublish
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </div>
  );
}
