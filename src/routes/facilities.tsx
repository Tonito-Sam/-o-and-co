import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DoorOpen, RefreshCw, Search } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/facilities")({
  head: () => ({ meta: [{ title: "Facilities — WorkspaceOS" }] }),
  component: Facilities,
});

type Branch = { id: string; name: string; status: string };
type FacilityRecord = {
  id: string;
  branch_id: string;
  code: string | null;
  name: string;
  floor: number | null;
  status: string;
  type: string;
  capacity: number | null;
  quantity: number | null;
  available_quantity: number | null;
  monthly_zar: number | null;
};

function Facilities() {
  const { role, isLoading } = useRole();
  const navigate = useNavigate();
  const isTenant = ["tenant-admin", "organization-admin", "organization-member"].includes(role.id);
  const isBranchManager = role.id === "branch-manager";
  const assignedBranchIds = useMemo(
    () => isBranchManager ? role.branchIds ?? [] : [],
    [isBranchManager, role.branchIds],
  );
  const assignedBranchNames = useMemo(
    () => role.branchNames?.length ? role.branchNames : role.branch ? [role.branch] : [],
    [role.branch, role.branchNames],
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [facilities, setFacilities] = useState<FacilityRecord[]>([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isLoading && isTenant) void navigate({ to: "/", replace: true });
  }, [isLoading, isTenant, navigate]);

  const loadFacilities = useCallback(async () => {
    if (isLoading || isTenant) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const branchResult = await supabase.from("branches").select("id,name,status").order("name");
    if (branchResult.error) {
      setError(branchResult.error.message);
      setBranches([]);
      setFacilities([]);
      setLoading(false);
      return;
    }

    let allowedBranches = (branchResult.data ?? []) as Branch[];
    if (isBranchManager) {
      const assignedNames = new Set(assignedBranchNames.map((name) => name.trim().toLowerCase()));
      allowedBranches = allowedBranches.filter(
        (branch) => assignedBranchIds.includes(branch.id) || assignedNames.has(branch.name.trim().toLowerCase()),
      );
    }
    setBranches(allowedBranches);
    const scopedBranchIds = allowedBranches.map((branch) => branch.id);
    if (isBranchManager && scopedBranchIds.length === 0) {
      setFacilities([]);
      setError("");
      setLoading(false);
      return;
    }

    let facilityQuery = supabase.from("facilities").select("id,branch_id,name,floor");
    let roomQuery = supabase.from("rooms").select("id,branch_id,facility_id,code,name,floor,kind,capacity,is_active").eq("is_active", true);
    let officeQuery = supabase.from("branch_offices").select("id,branch_id,code,name,floor,status,capacity,monthly_zar").neq("status", "inactive");
    let deskQuery = supabase.from("branch_desks").select("id,branch_id,code,name,floor,status,desk_type,monthly_zar").neq("status", "inactive");
    let parkingQuery = supabase.from("branch_parking_spaces").select("id,branch_id,code,name,parking_type,status,monthly_zar").neq("status", "inactive");
    let equipmentQuery = supabase.from("branch_equipment").select("id,branch_id,name,category,quantity,available_quantity,is_active").eq("is_active", true);
    if (isBranchManager) {
      facilityQuery = facilityQuery.in("branch_id", scopedBranchIds);
      roomQuery = roomQuery.in("branch_id", scopedBranchIds);
      officeQuery = officeQuery.in("branch_id", scopedBranchIds);
      deskQuery = deskQuery.in("branch_id", scopedBranchIds);
      parkingQuery = parkingQuery.in("branch_id", scopedBranchIds);
      equipmentQuery = equipmentQuery.in("branch_id", scopedBranchIds);
    }

    const [facilityResult, roomResult, officeResult, deskResult, parkingResult, equipmentResult] = await Promise.all([
      facilityQuery,
      roomQuery,
      officeQuery,
      deskQuery,
      parkingQuery,
      equipmentQuery,
    ]);
    const failure = facilityResult.error ?? roomResult.error ?? officeResult.error ?? deskResult.error ?? parkingResult.error ?? equipmentResult.error;
    if (failure) {
      setError(failure.message);
      setFacilities([]);
      setLoading(false);
      return;
    }

    const branchNameById = new Map(allowedBranches.map((branch) => [branch.id, branch.name]));
    const facilityFloorById = new Map((facilityResult.data ?? []).map((facility) => [facility.id, facility.floor]));
    const offices = (officeResult.data ?? []).map((office) => ({
      ...office,
      type: "Office",
      capacity: office.capacity ?? null,
      quantity: null,
      available_quantity: null,
      branch_name: branchNameById.get(office.branch_id),
    }));
    const desks = (deskResult.data ?? []).map((desk) => ({
      ...desk,
      type: desk.desk_type.replaceAll("_", " "),
      capacity: null,
      quantity: null,
      available_quantity: null,
      branch_name: branchNameById.get(desk.branch_id),
    }));
    const portfolioInventory = [
      ...(facilityResult.data ?? []).map((facility) => ({
        ...facility,
        code: null,
        status: "active",
        type: "Facility",
        capacity: null,
        quantity: null,
        available_quantity: null,
        monthly_zar: null,
        branch_name: branchNameById.get(facility.branch_id),
      })),
      ...(roomResult.data ?? []).map((room) => ({
        ...room,
        code: room.code ?? null,
        floor: room.floor ?? (room.facility_id ? facilityFloorById.get(room.facility_id) ?? null : null),
        status: room.is_active ? "active" : "inactive",
        type: `Room · ${room.kind}`,
        quantity: null,
        available_quantity: null,
        monthly_zar: null,
        branch_name: branchNameById.get(room.branch_id),
      })),
      ...offices,
      ...desks,
      ...(parkingResult.data ?? []).map((space) => ({
        ...space,
        floor: null,
        type: `Parking · ${space.parking_type}`,
        capacity: null,
        quantity: null,
        available_quantity: null,
        branch_name: branchNameById.get(space.branch_id),
      })),
      ...(equipmentResult.data ?? []).map((item) => ({
        ...item,
        code: null,
        floor: null,
        type: `Equipment · ${item.category}`,
        status: item.available_quantity > 0 ? "available" : "unavailable",
        capacity: null,
        quantity: item.quantity,
        available_quantity: item.available_quantity,
        monthly_zar: null,
        branch_name: branchNameById.get(item.branch_id),
      })),
    ];
    setFacilities(portfolioInventory.filter((item) => item.branch_name) as FacilityRecord[]);
    setError("");
    setLoading(false);
  }, [assignedBranchIds, assignedBranchNames, isBranchManager, isLoading, isTenant]);

  useEffect(() => {
    void loadFacilities();
  }, [loadFacilities]);

  const visibleBranches = branches.filter(
    (branch) => branchFilter === "all" || branch.id === branchFilter,
  );
  const visibleFacilities = useMemo(
    () =>
      facilities.filter(
        (facility) =>
          (branchFilter === "all" || facility.branch_id === branchFilter) &&
          `${facility.name} ${facility.code} ${facility.type}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [branchFilter, facilities, search],
  );
  const availableCount = visibleFacilities.filter(
    (facility) => ["Office", "hot desk", "dedicated", "team desk"].includes(facility.type) && facility.status === "available",
  ).length;
  const occupiedCount = visibleFacilities.filter(
    (facility) => ["Office", "hot desk", "dedicated", "team desk"].includes(facility.type) && facility.status === "occupied",
  ).length;
  const maintenanceCount = visibleFacilities.filter(
    (facility) => ["Office", "hot desk", "dedicated", "team desk"].includes(facility.type) && facility.status === "maintenance",
  ).length;
  const facilityCount = visibleFacilities.filter((facility) => facility.type === "Facility").length;
  const officeAndDeskCount = visibleFacilities.filter((facility) => ["Office", "hot desk", "dedicated", "team desk"].includes(facility.type)).length;
  const otherResourceCount = visibleFacilities.filter((facility) => facility.type.startsWith("Room ·") || facility.type.startsWith("Parking ·")).length;
  const equipmentUnits = visibleFacilities.filter((facility) => facility.type.startsWith("Equipment ·"));
  const availableEquipment = equipmentUnits.reduce((sum, item) => sum + (item.available_quantity ?? 0), 0);
  const totalEquipment = equipmentUnits.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const showBranchContext = role.id === "group-ceo" || (isBranchManager && branches.length > 1);
  const portfolioDescription = role.id === "group-ceo"
    ? "Live facility, office, meeting-room, parking, and equipment records across branches."
    : isBranchManager
      ? branches.length > 1
        ? "Live facility and office-space inventory across your assigned branches."
        : `Live facility and office-space inventory for ${branches[0]?.name ?? role.branch ?? "your assigned branch"}.`
      : "Live office and desk inventory for your assigned branch.";

  if (isLoading || isTenant) return null;

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo"
            ? "Group Operations · Facilities"
            : isBranchManager
              ? "Branch Operations · Portfolio"
              : "Branch Operations · Facilities"
        }
        title={role.id === "group-ceo" || isBranchManager ? "Portfolio facilities" : "Facilities"}
        description={portfolioDescription}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadFacilities()}
            disabled={loading}
            aria-label="Refresh facilities"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Facilities unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Facilities"
          value={loading ? "—" : String(facilityCount)}
          hint="Branch locations and areas"
        />
        <StatCard
          label="Offices and desks"
          value={loading ? "—" : String(officeAndDeskCount)}
          hint={`${availableCount} available · ${occupiedCount} occupied · ${maintenanceCount} maintenance`}
          accent="success"
        />
        <StatCard
          label="Rooms and parking"
          value={loading ? "—" : String(otherResourceCount)}
          hint="Active inventory records"
        />
        <StatCard
          label="Equipment units available"
          value={loading ? "—" : `${availableEquipment} / ${totalEquipment}`}
          hint="Available / total units"
          accent={availableEquipment ? "brand" : undefined}
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-display text-base font-semibold">Facilities and branch inventory</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Live spaces, rooms, parking, equipment, and monthly lease values.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showBranchContext ? (
              <select
                aria-label="Filter by branch"
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">{isBranchManager ? "All assigned branches" : "All branches"}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search spaces"
                className="h-9 w-48 pl-8"
              />
            </div>
          </div>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading live inventory…</p>
        ) : visibleFacilities.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-10 text-center">
            <DoorOpen className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No facility records found</p>
            <p className="text-xs text-muted-foreground">
              The selected scope has no active facility or inventory records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Facility / resource</th>
                  {showBranchContext ? (
                    <th className="px-4 py-3 font-medium">Branch</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Capacity / units</th>
                  <th className="px-4 py-3 text-right font-medium">Monthly rent</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleFacilities.map((facility) => (
                  <tr key={`${facility.type}-${facility.id}`} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{facility.name}</div>
                      {facility.code && <div className="font-mono text-[11px] text-muted-foreground">{facility.code}</div>}
                      {facility.floor !== null && <div className="text-[11px] text-muted-foreground">Floor {facility.floor}</div>}
                    </td>
                    {showBranchContext ? (
                      <td className="px-4 py-3">{branchNameById.get(facility.branch_id)}</td>
                    ) : null}
                    <td className="px-4 py-3 capitalize">{facility.type}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {facility.quantity !== null
                        ? `${facility.available_quantity ?? 0} / ${facility.quantity} available`
                        : facility.capacity ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {facility.monthly_zar === null
                        ? "—"
                        : new Intl.NumberFormat("en-ZA", {
                            style: "currency",
                            currency: "ZAR",
                            maximumFractionDigits: 0,
                          }).format(facility.monthly_zar)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={
                          facility.status === "available"
                            ? "default"
                            : facility.status === "maintenance"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {facility.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="sr-only">{visibleBranches.length} branches shown</div>
    </div>
  );
}
