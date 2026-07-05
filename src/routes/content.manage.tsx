import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loadEditableContent, saveEditableContent, type EditableSiteContent } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";

export const Route = createFileRoute("/content/manage")({
  head: () => ({ meta: [{ title: "Manage content — WorkspaceOS" }] }),
  component: ContentManage,
});

function ContentManage() {
  const { role } = useRole();
  const canEdit = ["group-ceo", "sales-manager", "branch-manager", "rosebank-sales", "community-manager", "finance", "lydia-admin"].includes(role.id);
  const [content, setContent] = useState<EditableSiteContent | null>(null);

  useEffect(() => {
    setContent(loadEditableContent());
  }, []);

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-350">
        <PageHeader eyebrow="Content" title="Content management" description="You do not have permission to edit site content." actions={null} />
        <div className="card-soft p-6 text-sm text-muted-foreground">This area is restricted to Office & Co management and content editors.</div>
      </div>
    );
  }

  if (!content) return null;

  const handleImage = (field: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent((prev) => prev ? ({ ...prev, [field]: { ...(prev as any)[field], heroImage: reader.result as string } } as EditableSiteContent) : prev);
    };
    reader.readAsDataURL(file);
  };

  const handleBanner = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent((prev) => prev ? ({ ...prev, about: { ...(prev as any).about, banner: reader.result as string } } as EditableSiteContent) : prev);
    };
    reader.readAsDataURL(file);
  };

  const handleGallery = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const readers = files.map((f) => new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(f);
    }));
    Promise.all(readers).then((imgs) => {
      setContent((prev) => prev ? ({ ...prev, gallery: [...(prev.gallery ?? []), ...imgs] }) : prev);
    });
  };

  const save = () => {
    if (!content) return;
    saveEditableContent(content);
    toast.success("Content saved");
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader eyebrow="Content" title="Content management" description="Edit landing, about and gallery content for the public site." actions={<Button size="sm" onClick={save}>Save</Button>} />

      <div className="space-y-6">
        <section className="card-soft p-4">
          <div className="mb-3 font-medium">Landing</div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={content.landing.title} onChange={(e) => setContent({ ...content, landing: { ...content.landing, title: e.target.value } })} />
            <Label>Subtitle</Label>
            <Input value={content.landing.subtitle} onChange={(e) => setContent({ ...content, landing: { ...content.landing, subtitle: e.target.value } })} />
            <Label>Hero image</Label>
            <Input type="file" accept="image/*" onChange={handleImage("landing")} />
            {content.landing.heroImage ? <img src={content.landing.heroImage} alt="hero" className="mt-2 h-40 w-full object-cover rounded-md" /> : null}
          </div>
        </section>

        <section className="card-soft p-4">
          <div className="mb-3 font-medium">About</div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={content.about.title} onChange={(e) => setContent({ ...content, about: { ...content.about, title: e.target.value } })} />
            <Label>Body</Label>
            <Textarea rows={6} value={content.about.body} onChange={(e) => setContent({ ...content, about: { ...content.about, body: e.target.value } })} />
            <Label>Banner image</Label>
            <Input type="file" accept="image/*" onChange={handleBanner} />
            {content.about.banner ? <img src={content.about.banner} alt="banner" className="mt-2 h-28 w-full object-cover rounded-md" /> : null}
          </div>
        </section>

        <section className="card-soft p-4">
          <div className="mb-3 font-medium">Gallery</div>
          <div className="space-y-2">
            <Label>Upload images</Label>
            <Input type="file" accept="image/*" multiple onChange={handleGallery} />
            <div className="mt-2 flex flex-wrap gap-2">
              {(content.gallery ?? []).map((g, i) => (
                <img key={`${g}-${i}`} src={g} alt={`g-${i}`} className="h-20 w-32 object-cover rounded-md border" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
