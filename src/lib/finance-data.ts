import { getSupabaseClient } from "@/lib/supabase";

type BranchRow = {
  id: string;
  name: string;
  status: string;
};

type TenantRow = {
  id: string;
  branch_id: string;
  mrr_zar: number | null;
};

export type LiveInvoiceRow = {
  id: string;
  reference: string;
  tenant_id: string | null;
  amount_zar: number;
  status: string;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type LiveFinanceBranch = {
  id: string;
  name: string;
  tenant_records: number;
  monthly_recurring: number;
  collected_this_month: number;
  open_receivables: number;
  overdue_receivables: number;
};

export type LiveFinanceSnapshot = {
  totals: {
    monthly_recurring: number;
    collected_this_month: number;
    open_receivables: number;
    overdue_receivables: number;
    tenant_records: number;
  };
  branches: LiveFinanceBranch[];
  monthly: { month: string; collected: number; outstanding: number }[];
  invoices: LiveInvoiceRow[];
};

const isOpenInvoice = (status: string) => !["paid", "void"].includes(status.toLowerCase());

async function fetchAllPages<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadLiveFinanceSnapshot(): Promise<LiveFinanceSnapshot> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Workspace data is not configured.");

  const [branches, tenants, invoices] = await Promise.all([
    fetchAllPages<BranchRow>((from, to) =>
      supabase
        .from("branches")
        .select("id,name,status")
        .eq("status", "live")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages<TenantRow>((from, to) =>
      supabase
        .from("tenants")
        .select("id,branch_id,mrr_zar")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages<LiveInvoiceRow>((from, to) =>
      supabase
        .from("invoices")
        .select("id,reference,tenant_id,amount_zar,status,issued_at,due_at,paid_at,metadata")
        .order("issued_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);
  const branchByTenant = new Map(tenants.map((tenant) => [tenant.id, tenant.branch_id]));
  const branchTotals = new Map<string, LiveFinanceBranch>(
    branches.map((branch) => [
      branch.id,
      {
        id: branch.id,
        name: branch.name,
        tenant_records: 0,
        monthly_recurring: 0,
        collected_this_month: 0,
        open_receivables: 0,
        overdue_receivables: 0,
      },
    ]),
  );

  for (const tenant of tenants) {
    const branch = branchTotals.get(tenant.branch_id);
    if (!branch) continue;
    branch.tenant_records += 1;
    branch.monthly_recurring += tenant.mrr_zar ?? 0;
  }

  const now = new Date();
  const currentMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      month: new Intl.DateTimeFormat("en-ZA", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(date),
      collected: 0,
      outstanding: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  let totalCollected = 0;
  let totalOpen = 0;
  let totalOverdue = 0;
  let totalRecurring = 0;
  for (const branch of branchTotals.values()) totalRecurring += branch.monthly_recurring;

  for (const invoice of invoices) {
    const amount = invoice.amount_zar ?? 0;
    const status = invoice.status.toLowerCase();
    const paidDate = invoice.paid_at ? new Date(invoice.paid_at) : null;
    const issueDate = new Date(invoice.issued_at);
    const branchId = invoice.tenant_id ? branchByTenant.get(invoice.tenant_id) : undefined;
    const branch = branchId ? branchTotals.get(branchId) : undefined;

    if (status === "paid") {
      if (paidDate && paidDate.getTime() >= currentMonthStart) {
        totalCollected += amount;
        if (branch) branch.collected_this_month += amount;
      }
    } else if (isOpenInvoice(status)) {
      totalOpen += amount;
      if (branch) branch.open_receivables += amount;
      if (status === "overdue") {
        totalOverdue += amount;
        if (branch) branch.overdue_receivables += amount;
      }
    }

    const monthDate = status === "paid" && paidDate ? paidDate : issueDate;
    const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = monthByKey.get(monthKey);
    if (month) {
      if (status === "paid") month.collected += amount;
      else if (isOpenInvoice(status)) month.outstanding += amount;
    }
  }

  return {
    totals: {
      monthly_recurring: totalRecurring,
      collected_this_month: totalCollected,
      open_receivables: totalOpen,
      overdue_receivables: totalOverdue,
      tenant_records: tenants.length,
    },
    branches: [...branchTotals.values()].sort(
      (a, b) => b.overdue_receivables - a.overdue_receivables || a.name.localeCompare(b.name),
    ),
    monthly: months,
    invoices,
  };
}
