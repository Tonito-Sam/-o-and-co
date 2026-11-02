import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Landmark, RefreshCw, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type VenueRequest = {
  id: string;
  reference: string;
  client_company: string;
  event_type: string;
  event_date: string;
  starts_time: string;
  ends_time: string;
  attendees: number;
  layout: string;
  status: string;
  estimate_zar: number;
  contract_sent: boolean;
  contract_signed: boolean;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

export function UnionStationPerformanceDashboard() {
  const { role } = useRole();
  const [requests, setRequests] = useState<VenueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace event data is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("union_station_requests")
      .select(
        "id,reference,client_company,event_type,event_date,starts_time,ends_time,attendees,layout,status,estimate_zar,contract_sent,contract_signed",
      )
      .order("event_date", { ascending: false })
      .limit(500);
    if (queryError) {
      setError(queryError.message);
      setRequests([]);
    } else {
      setError("");
      setRequests((data ?? []) as VenueRequest[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const activeRequests = requests.filter(
    (request) => !["completed", "declined"].includes(request.status),
  );
  const confirmed = requests.filter((request) =>
    ["confirmed", "invoiced", "completed"].includes(request.status),
  );
  const pipeline = requests.filter((request) =>
    ["submitted", "in_review", "quoted"].includes(request.status),
  );
  const confirmedEstimate = confirmed.reduce((sum, request) => sum + request.estimate_zar, 0);
  const pipelineEstimate = pipeline.reduce((sum, request) => sum + request.estimate_zar, 0);
  const expectedAttendees = activeRequests.reduce((sum, request) => sum + request.attendees, 0);
  const monthlyActivity = useMemo(() => {
    const current = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(current.getFullYear(), current.getMonth() - 5 + index, 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
      const monthRequests = requests.filter((request) => request.event_date.startsWith(key));
      return {
        label: new Intl.DateTimeFormat("en-ZA", { month: "short", year: "2-digit" }).format(month),
        count: monthRequests.length,
        estimate: monthRequests.reduce((sum, request) => sum + request.estimate_zar, 0),
      };
    });
  }, [requests]);

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo"
            ? "Group Operations · Union Station"
            : "Union Station · Venue operations"
        }
        title={role.id === "group-ceo" ? "Union Station performance" : "Venue performance"}
        description="Venue request volume, event estimates, attendance, and contract status from live booking records."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/union-station">
                Booking workflow <ArrowUpRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRequests()}
              disabled={loading}
              aria-label="Refresh venue requests"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Venue data unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Confirmed estimate"
          value={loading ? "—" : money(confirmedEstimate)}
          hint="Confirmed, invoiced, completed"
          accent="success"
        />
        <StatCard
          label="Open pipeline estimate"
          value={loading ? "—" : money(pipelineEstimate)}
          hint={`${pipeline.length} active requests`}
          accent="brand"
        />
        <StatCard
          label="Active requests"
          value={loading ? "—" : String(activeRequests.length)}
          hint="Live venue workflow"
        />
        <StatCard
          label="Expected attendees"
          value={loading ? "—" : new Intl.NumberFormat("en-ZA").format(expectedAttendees)}
          hint="Active requests"
          accent="brand"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Recent venue activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Request estimates are not collected revenue; invoices and payments remain the accounting
            source.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading venue records…</p>
        ) : requests.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-8 text-center">
            <Landmark className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No venue requests found</p>
            <p className="text-xs text-muted-foreground">
              Request and event performance will appear when records exist.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Attendees</th>
                  <th className="px-4 py-3 text-right font-medium">Estimate</th>
                  <th className="px-4 py-3 text-right font-medium">Contract</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{request.reference}</td>
                    <td className="px-4 py-3 font-medium">{request.client_company}</td>
                    <td className="px-4 py-3">
                      {request.event_type} · {request.layout}
                    </td>
                    <td className="px-4 py-3">
                      {request.event_date} · {request.starts_time.slice(0, 5)}–
                      {request.ends_time.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5 text-muted-foreground" />
                        {request.attendees}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {money(request.estimate_zar)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {request.contract_signed
                        ? "Signed"
                        : request.contract_sent
                          ? "Sent"
                          : "Not sent"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={
                          ["declined", "completed"].includes(request.status)
                            ? "secondary"
                            : ["confirmed", "invoiced"].includes(request.status)
                              ? "default"
                              : "outline"
                        }
                      >
                        {request.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="font-display text-base font-semibold">Six-month request activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Based on event dates and stored estimates.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {monthlyActivity.map((month) => (
            <div key={month.label} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{month.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{month.count}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {money(month.estimate)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
