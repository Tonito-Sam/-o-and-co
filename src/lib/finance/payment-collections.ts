import { billingOrchestration } from "@/lib/finance/billing-orchestration";
import type { InvoiceDraft, PaymentTransaction } from "@/lib/finance/finance-types";
import { generateId } from "@/lib/finance/utils";

class PaymentCollectionsService {
  private payments: Map<string, PaymentTransaction> = new Map();
  private retryQueue: Map<string, PaymentTransaction> = new Map();

  async processPayment(
    invoiceId: string,
    tenantId: string,
    method: PaymentTransaction["method"],
    amount: number,
    metadata?: Record<string, any>,
  ): Promise<PaymentTransaction> {
    const invoice = await billingOrchestration.getInvoice(invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    const transaction: PaymentTransaction = {
      id: generateId("PAY"),
      invoiceId,
      tenantId,
      amount,
      method,
      status: "processing",
      reference: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settlementStatus: "pending",
      settlementDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    };

    this.payments.set(transaction.id, transaction);

    const success = Math.random() > 0.12;
    if (!success) {
      transaction.status = "failed";
      transaction.settlementStatus = "failed";
      transaction.updatedAt = new Date().toISOString();
      this.payments.set(transaction.id, transaction);
      this.retryQueue.set(transaction.id, transaction);
      throw new Error("Payment processing failed");
    }

    transaction.status = "completed";
    transaction.gatewayReference = `GW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    transaction.settlementStatus = "settled";
    transaction.settlementDate = new Date().toISOString();
    transaction.updatedAt = new Date().toISOString();

    if (invoice.status !== "paid") {
      invoice.status = invoice.total <= amount ? "paid" : "approved";
      invoice.paidAt = invoice.total <= amount ? new Date().toISOString() : undefined;
      invoice.updatedAt = new Date().toISOString();
    }

    this.payments.set(transaction.id, transaction);
    return transaction;
  }

  async processFailedPayment(paymentId: string): Promise<PaymentTransaction> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.status !== "failed") throw new Error("Payment is not in failed state");

    payment.status = "processing";
    payment.updatedAt = new Date().toISOString();
    payment.settlementStatus = "pending";

    const success = Math.random() > 0.2;
    if (!success) {
      payment.status = "failed";
      payment.settlementStatus = "failed";
      payment.updatedAt = new Date().toISOString();
      this.payments.set(paymentId, payment);
      throw new Error("Retry payment failed");
    }

    payment.status = "completed";
    payment.gatewayReference = `GW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    payment.settlementStatus = "settled";
    payment.updatedAt = new Date().toISOString();
    this.payments.set(paymentId, payment);
    this.retryQueue.delete(paymentId);
    return payment;
  }

  async getRetryQueue(): Promise<PaymentTransaction[]> {
    return Array.from(this.retryQueue.values());
  }

  async getPayment(paymentId: string): Promise<PaymentTransaction | undefined> {
    return this.payments.get(paymentId);
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.payments.values()).filter((payment) => payment.invoiceId === invoiceId);
  }

  async getSettlementSummary(): Promise<{ pending: number; settled: number; failed: number; total: number }> {
    const items = Array.from(this.payments.values());
    return {
      pending: items.filter((payment) => payment.settlementStatus === "pending").length,
      settled: items.filter((payment) => payment.settlementStatus === "settled").length,
      failed: items.filter((payment) => payment.settlementStatus === "failed").length,
      total: items.length,
    };
  }
}

export const paymentCollections = new PaymentCollectionsService();
