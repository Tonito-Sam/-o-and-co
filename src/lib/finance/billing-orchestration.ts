import { tenants } from "@/lib/mock";
import type { InvoiceDraft, InvoiceLineItem, RecurringCharge, TenantAccount } from "@/lib/finance/finance-types";
import { calculateTax, generateId, getMonthString } from "@/lib/finance/utils";

const STORAGE_KEY = "oco-finance-invoice-drafts";

const seedTenantAccounts = (): TenantAccount[] =>
  tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    branchId: tenant.branch,
    plan: tenant.plan.includes("Private Suite") ? "enterprise" : tenant.plan.includes("Floor") ? "premium" : "basic",
    health: tenant.health === "Excellent" ? "good" : tenant.health === "At Risk" ? "warning" : "good",
    members: tenant.members,
    billingEmail: `${tenant.name.toLowerCase().replace(/[^a-z]+/g, ".")}@billing.local`,
    paymentMethod: "charge_to_account",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

class BillingOrchestrationService {
  private invoices: Map<string, InvoiceDraft> = new Map();
  private recurringCharges: Map<string, RecurringCharge> = new Map();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as InvoiceDraft[];
          parsed.forEach((invoice) => this.invoices.set(invoice.id, invoice));
        }
      } catch {
        // ignore malformed persisted data
      }
    }
  }

  private persist() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.invoices.values())));
    }
  }

  async createMonthlyDrafts(year: number, month: number): Promise<InvoiceDraft[]> {
    const drafts: InvoiceDraft[] = [];
    const tenantAccounts = seedTenantAccounts();

    for (const tenant of tenantAccounts) {
      const draft = this.createTenantDraft(tenant, year, month);
      drafts.push(draft);
      this.invoices.set(draft.id, draft);
    }

    this.persist();
    return drafts;
  }

  private createTenantDraft(tenant: TenantAccount, year: number, month: number): InvoiceDraft {
    const items = this.generateLineItems(tenant, year, month);
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = calculateTax(subtotal);
    const total = subtotal + tax;

    return {
      id: generateId("INV-DRAFT"),
      tenantId: tenant.id,
      branchId: tenant.branchId,
      month: getMonthString(month),
      year,
      lineItems: items,
      subtotal,
      tax,
      total,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private generateLineItems(tenant: TenantAccount, year: number, month: number): InvoiceLineItem[] {
    const priceByPlan: Record<TenantAccount["plan"], number> = {
      basic: 25000,
      premium: 45000,
      enterprise: 85000,
    };

    const items: InvoiceLineItem[] = [
      {
        id: generateId("ITEM"),
        description: `Monthly workspace allocation · ${tenant.branchId}`,
        quantity: 1,
        unitPrice: priceByPlan[tenant.plan],
        total: priceByPlan[tenant.plan],
        category: "rent",
        metadata: { month, year },
      },
      {
        id: generateId("ITEM"),
        description: "Community & concierge services",
        quantity: 1,
        unitPrice: 4200,
        total: 4200,
        category: "services",
        metadata: { month, year },
      },
    ];

    return items;
  }

  async addRecurringCharge(charge: Omit<RecurringCharge, "id" | "createdAt" | "updatedAt">): Promise<RecurringCharge> {
    const item: RecurringCharge = {
      id: generateId("RCHG"),
      ...charge,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.recurringCharges.set(item.id, item);
    return item;
  }

  async approveDraft(invoiceId: string, approverId: string): Promise<InvoiceDraft> {
    const draft = this.invoices.get(invoiceId);
    if (!draft) throw new Error("Invoice draft not found");
    if (draft.status !== "draft") throw new Error("Invoice is not in draft status");

    draft.status = "pending_approval";
    draft.approvedBy = approverId;
    draft.approvedAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    this.invoices.set(invoiceId, draft);
    this.persist();
    return draft;
  }

  async deliverInvoice(invoiceId: string): Promise<InvoiceDraft> {
    const draft = this.invoices.get(invoiceId);
    if (!draft) throw new Error("Invoice not found");
    if (draft.status !== "pending_approval" && draft.status !== "approved") {
      throw new Error("Invoice must be approved before delivery");
    }

    draft.status = "sent";
    draft.sentAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    this.invoices.set(invoiceId, draft);
    this.persist();
    return draft;
  }

  async getInvoice(invoiceId: string): Promise<InvoiceDraft | undefined> {
    return this.invoices.get(invoiceId);
  }

  async getAllInvoices(): Promise<InvoiceDraft[]> {
    return Array.from(this.invoices.values());
  }
}

export const billingOrchestration = new BillingOrchestrationService();
