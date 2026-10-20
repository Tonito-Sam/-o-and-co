export type InvoiceStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export type PaymentMethod = "eft" | "paystack" | "payfast" | "charge_to_account";
export type SettlementStatus = "pending" | "settled" | "failed";

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: "rent" | "utilities" | "services" | "other";
  metadata?: Record<string, any>;
}

export interface InvoiceDraft {
  id: string;
  tenantId: string;
  branchId: string;
  month: string;
  year: number;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  paidAt?: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  tenantId: string;
  amount: number;
  method: PaymentMethod;
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  reference: string;
  gatewayReference?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  settlementStatus?: SettlementStatus;
  settlementDate?: string;
}

export interface GLMapping {
  id: string;
  invoiceId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  category: string;
  taxCode: string;
  mappedAt: string;
  synced: boolean;
  syncError?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: "create" | "update" | "delete" | "approve" | "reject" | "sync" | "view" | "export";
  resource: "invoice" | "payment" | "tenant" | "branch" | "configuration";
  resourceId: string;
  changes: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
}

export interface TenantAccount {
  id: string;
  name: string;
  branchId: string;
  plan: "basic" | "premium" | "enterprise";
  health: "good" | "warning" | "critical";
  members: number;
  billingEmail: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringCharge {
  id: string;
  tenantId: string;
  description: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "annually";
  category: "rent" | "services" | "utilities" | "other";
  startDate: string;
  endDate?: string;
  status: "active" | "paused" | "cancelled";
  lastBilled: string;
  nextBilling: string;
  createdAt: string;
  updatedAt: string;
}
