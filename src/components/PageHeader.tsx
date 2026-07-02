import type { ReactNode } from "react";

export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between mb-6">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, delta, hint, accent,
}: { label: string; value: string; delta?: string; hint?: string; accent?: "brand" | "success" | "warning" }) {
  const tone =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning" :
    "text-brand";
  return (
    <div className="card-soft p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 flex items-center justify-between text-xs">
        {delta && <span className={tone}>{delta}</span>}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
