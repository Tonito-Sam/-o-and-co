import { loadInvoices } from "@/lib/mock";
import { getSageApiClient } from "@/lib/sage-api";

export interface MigrationResult {
  successful: number;
  failed: number;
  total: number;
  errors: Array<{ invoiceId: string; error: string }>;
}

export async function migrateLocalInvoicesToSage(): Promise<MigrationResult> {
  const sageClient = getSageApiClient();
  if (!sageClient) {
    return {
      successful: 0,
      failed: 0,
      total: 0,
      errors: [{ invoiceId: "", error: "Sage API client not configured." }],
    };
  }

  const localInvoices = loadInvoices();
  const result: MigrationResult = { successful: 0, failed: 0, total: localInvoices.length, errors: [] };

  for (const invoice of localInvoices) {
    try {
      const existingInvoices = await sageClient.getInvoices({ tenantName: invoice.tenant, top: 50 });
      const alreadySynced = existingInvoices.some((sageInvoice) => {
        const commentMatches = sageInvoice.Comments?.includes(invoice.id);
        const dateMatches = sageInvoice.Date === invoice.issuedAt.split("T")[0];
        return Boolean(commentMatches || dateMatches);
      });

      if (alreadySynced) {
        result.successful += 1;
        continue;
      }

      await sageClient.createInvoice({
        tenant: invoice.tenant,
        amount: invoice.amount,
        due: invoice.due,
        items: invoice.items,
        note: `${invoice.note ?? ""} (Original: ${invoice.id})`,
        branch: invoice.branch,
        date: invoice.issuedAt.split("T")[0],
      });

      result.successful += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : "Unknown migration error",
      });
    }
  }

  return result;
}
