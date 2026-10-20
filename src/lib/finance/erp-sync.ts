import type { GLMapping, InvoiceDraft } from "@/lib/finance/finance-types";
import { generateId } from "@/lib/finance/utils";

class ERPSyncService {
  private glMappings: Map<string, GLMapping> = new Map();

  async mapInvoiceToGL(invoice: InvoiceDraft): Promise<GLMapping[]> {
    const mappings = invoice.lineItems.map((item) => {
      const mapping: GLMapping = {
        id: generateId("GL"),
        invoiceId: invoice.id,
        accountCode: this.getAccountCode(item.category),
        accountName: this.getAccountName(item.category),
        amount: item.total,
        category: item.category,
        taxCode: "VAT-STD",
        mappedAt: new Date().toISOString(),
        synced: false,
      };

      this.glMappings.set(mapping.id, mapping);
      return mapping;
    });

    return mappings;
  }

  private getAccountCode(category: string): string {
    const map: Record<string, string> = {
      rent: "4001",
      utilities: "4002",
      services: "4003",
      other: "4004",
    };

    return map[category] ?? "4000";
  }

  private getAccountName(category: string): string {
    const map: Record<string, string> = {
      rent: "Rental Revenue",
      utilities: "Utility Revenue",
      services: "Service Revenue",
      other: "Other Revenue",
    };

    return map[category] ?? "Revenue";
  }

  async syncInvoiceToERP(invoice: InvoiceDraft, mappings: GLMapping[]): Promise<{ success: boolean; syncedMappings: GLMapping[]; errors?: string[] }> {
    const errors: string[] = [];
    const syncedMappings: GLMapping[] = [];

    for (const mapping of mappings) {
      const didSync = Math.random() > 0.03;
      mapping.synced = didSync;
      mapping.syncError = didSync ? undefined : `Failed to sync GL mapping ${mapping.id}`;
      this.glMappings.set(mapping.id, mapping);

      if (didSync) {
        syncedMappings.push(mapping);
      } else {
        errors.push(mapping.syncError ?? "Unknown GL sync error");
      }
    }

    return {
      success: errors.length === 0,
      syncedMappings,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getGLMappings(invoiceId: string): Promise<GLMapping[]> {
    return Array.from(this.glMappings.values()).filter((mapping) => mapping.invoiceId === invoiceId);
  }
}

export const erpSync = new ERPSyncService();
