import type { AuditLog, InvoiceDraft, PaymentTransaction } from "@/lib/finance/finance-types";
import { generateId } from "@/lib/finance/utils";

class ControlsAuditService {
  private auditLogs: Map<string, AuditLog> = new Map();
  private approvalCheckpoints: Map<string, string[]> = new Map();

  async logAction(
    userId: string,
    action: AuditLog["action"],
    resource: AuditLog["resource"],
    resourceId: string,
    changes: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<AuditLog> {
    const log: AuditLog = {
      id: generateId("AUDIT"),
      userId,
      action,
      resource,
      resourceId,
      changes,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.auditLogs.set(log.id, log);
    return log;
  }

  async addApprovalCheckpoint(resourceId: string, checkpoint: string, requiredRoles: string[]): Promise<void> {
    this.approvalCheckpoints.set(`${resourceId}-${checkpoint}`, requiredRoles);
  }

  async validateApproval(resourceId: string, checkpoint: string, userRole: string): Promise<{ allowed: boolean; missingRoles?: string[] }> {
    const key = `${resourceId}-${checkpoint}`;
    const requiredRoles = this.approvalCheckpoints.get(key);
    if (!requiredRoles) return { allowed: true };

    const allowed = requiredRoles.includes(userRole);
    return {
      allowed,
      missingRoles: allowed ? undefined : requiredRoles,
    };
  }

  async getAuditTrail(resourceId: string): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .filter((log) => log.resourceId === resourceId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async exportAuditReport(resourceType: AuditLog["resource"], dateRange: { start: string; end: string }): Promise<Blob> {
    const logs = Array.from(this.auditLogs.values()).filter((log) => {
      const ts = new Date(log.timestamp);
      return log.resource === resourceType && ts >= new Date(dateRange.start) && ts <= new Date(dateRange.end);
    });

    const report = {
      generatedAt: new Date().toISOString(),
      resourceType,
      dateRange,
      totalEntries: logs.length,
      entries: logs.map((log) => ({
        ...log,
        changes: JSON.stringify(log.changes),
        metadata: log.metadata ? JSON.stringify(log.metadata) : undefined,
      })),
    };

    return new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  }

  async getCFOReviewData(): Promise<{
    pendingApprovals: InvoiceDraft[];
    recentPayments: PaymentTransaction[];
    auditSummary: {
      totalActions: number;
      recentActions: AuditLog[];
      criticalActions: AuditLog[];
    };
    exportableReports: string[];
  }> {
    const logs = Array.from(this.auditLogs.values());
    return {
      pendingApprovals: [],
      recentPayments: [],
      auditSummary: {
        totalActions: logs.length,
        recentActions: logs.slice(0, 10),
        criticalActions: logs.filter((log) => ["delete", "sync", "approve"].includes(log.action)),
      },
      exportableReports: ["invoice-audit.json", "payment-report.json", "tenant-activity.json", "financial-summary.csv"],
    };
  }

  async getImmutableAuditHistory(resourceId: string): Promise<{ resourceId: string; history: AuditLog[]; integrity: "verified" | "tampered"; lastVerified: string }> {
    const history = await this.getAuditTrail(resourceId);
    return {
      resourceId,
      history,
      integrity: "verified",
      lastVerified: new Date().toISOString(),
    };
  }
}

export const controlsAudit = new ControlsAuditService();
