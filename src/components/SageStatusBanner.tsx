import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SageRuntimeMode = "live" | "sandbox" | "demo";

export interface SageStatusBannerProps {
  mode: SageRuntimeMode;
  configured: boolean;
  syncing: boolean;
  lastSyncedAt?: string | null;
  error?: string | null;
  onRetry?: () => void;
}

const modeCopy: Record<SageRuntimeMode, { label: string; description: string; tone: string }> = {
  live: { label: "Live Sage sync", description: "Live credentials are active and requests are being sent to Sage.", tone: "text-emerald-600 dark:text-emerald-400" },
  sandbox: { label: "Sandbox QA mode", description: "Requests are routed through the safe QA wrapper and do not touch live accounting data.", tone: "text-amber-600 dark:text-amber-400" },
  demo: { label: "Demo fallback", description: "Sage is not configured yet, so the app is running with local demo data only.", tone: "text-slate-600 dark:text-slate-300" },
};

export function SageStatusBanner({ mode, configured, syncing, lastSyncedAt, error, onRetry }: SageStatusBannerProps) {
  const details = modeCopy[mode];
  const statusText = syncing ? "Sync in progress…" : lastSyncedAt ? `Last sync: ${lastSyncedAt}` : "Awaiting first sync";

  return (
    <div className="mb-4 rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          {mode === "live" ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : mode === "sandbox" ? <ShieldCheck className="mt-0.5 size-4 text-amber-600" /> : <AlertTriangle className="mt-0.5 size-4 text-slate-500" />}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{details.label}</span>
              <Badge variant="secondary" className="text-[10px]">{configured ? "Credentials active" : "Credentials missing"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{details.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium ${details.tone}`}>{statusText}</span>
          {syncing && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />}
          {error && onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry sync
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
