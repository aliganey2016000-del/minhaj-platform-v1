/**
 * Audit Logging System
 * Tracks administrative and sensitive operations for compliance,
 * security, and accountability.
 */

import { Request, Response, NextFunction } from 'express';
import { Document, Schema, model } from 'mongoose';

export interface IAuditLog extends Document {
  userId: string;
  userName?: string;
  action: string;
  resource: string;
  resourceId: string;
  resourceName?: string;
  organizationId?: string;
  method: string;
  endpoint: string;
  statusCode: number;
  changes?: Record<string, any>;
  details?: Record<string, any>;
  ip: string;
  userAgent?: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: String, required: true, index: true },
    userName: String,
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    resourceName: String,
    organizationId: { type: String, index: true },
    method: String,
    endpoint: String,
    statusCode: Number,
    changes: Schema.Types.Mixed,
    details: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { collection: 'auditLogs' }
);

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, timestamp: -1 });
auditLogSchema.index({ organizationId: 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export const AUDITED_ACTIONS = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_DELETED: 'PAYMENT_DELETED',
  PAYMENT_STATUS_CHANGED: 'PAYMENT_STATUS_CHANGED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  DISCOUNT_GRANTED: 'DISCOUNT_GRANTED',
  DISCOUNT_GRANT_CREATED: 'DISCOUNT_GRANT_CREATED',
  DISCOUNT_GRANT_REVOKED: 'DISCOUNT_GRANT_REVOKED',
  INVOICE_VOIDED: 'INVOICE_VOIDED',
  CASH_SESSION_OPENED: 'CASH_SESSION_OPENED',
  CASH_SESSION_CLOSED: 'CASH_SESSION_CLOSED',
  RECONCILIATION_COMPLETED: 'RECONCILIATION_COMPLETED',
  BULK_CHARGE: 'BULK_CHARGE',
  COURSE_CREATED: 'COURSE_CREATED',
  COURSE_UPDATED: 'COURSE_UPDATED',
  COURSE_DELETED: 'COURSE_DELETED',
  COURSE_PUBLISHED: 'COURSE_PUBLISHED',
  EXAM_CREATED: 'EXAM_CREATED',
  EXAM_DELETED: 'EXAM_DELETED',
  EXAM_GRADED: 'EXAM_GRADED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  LOGS_CLEARED: 'LOGS_CLEARED',
  BACKUP_CREATED: 'BACKUP_CREATED',
  API_KEY_CREATED: 'API_KEY_CREATED',
  API_KEY_REVOKED: 'API_KEY_REVOKED',
};

export class AuditLogger {
  static async logAction(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    req: Request,
    options?: {
      resourceName?: string;
      changes?: Record<string, any>;
      details?: Record<string, any>;
      severity?: 'info' | 'warning' | 'critical';
      organizationId?: string;
    }
  ): Promise<IAuditLog> {
    const severity = this.getSeverity(action);
    return AuditLog.create({
      userId,
      action,
      resource,
      resourceId,
      organizationId: options?.organizationId,
      method: req.method,
      endpoint: req.path,
      statusCode: 200,
      changes: options?.changes,
      details: options?.details,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      severity: options?.severity || severity,
      resourceName: options?.resourceName,
      timestamp: new Date(),
    });
  }

  private static getSeverity(action: string): 'info' | 'warning' | 'critical' {
    const critical = [
      'USER_DELETED',
      'LOGS_CLEARED',
      'API_KEY_REVOKED',
      'REFUND_COMPLETED',
      'CASH_SESSION_CLOSED',
      'RECONCILIATION_COMPLETED',
    ];
    const warning = [
      'USER_DEACTIVATED',
      'PASSWORD_RESET',
      'PAYMENT_DELETED',
      'REFUND_REQUESTED',
      'DISCOUNT_GRANTED',
      'DISCOUNT_GRANT_CREATED',
      'DISCOUNT_GRANT_REVOKED',
      'INVOICE_VOIDED',
    ];
    if (critical.includes(action)) return 'critical';
    if (warning.includes(action)) return 'warning';
    return 'info';
  }

  static async getUserAuditLog(userId: string, limit = 50) {
    return AuditLog.find({ userId }).sort({ timestamp: -1 }).limit(limit);
  }

  static async getResourceAuditLog(resource: string, resourceId: string) {
    return AuditLog.find({ resource, resourceId }).sort({ timestamp: -1 });
  }

  static async getCriticalLogs(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return AuditLog.find({ severity: 'critical', timestamp: { $gte: cutoffDate } }).sort({ timestamp: -1 });
  }

  static async getOrganizationSummary(organizationId: string, days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const logs = await AuditLog.find({ organizationId, timestamp: { $gte: cutoffDate } });
    const summary = {
      total: logs.length,
      byAction: {} as Record<string, number>,
      bySeverity: { info: 0, warning: 0, critical: 0 },
      byResource: {} as Record<string, number>,
      topUsers: {} as Record<string, number>,
    };
    logs.forEach((log) => {
      summary.byAction[log.action] = (summary.byAction[log.action] || 0) + 1;
      summary.bySeverity[log.severity]++;
      summary.byResource[log.resource] = (summary.byResource[log.resource] || 0) + 1;
      summary.topUsers[log.userId] = (summary.topUsers[log.userId] || 0) + 1;
    });
    return summary;
  }

  static async exportLogs(startDate: Date, endDate: Date, organizationId?: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const query: Record<string, any> = { timestamp: { $gte: startDate, $lte: endDate } };
    if (organizationId) query.organizationId = organizationId;
    const logs = await AuditLog.find(query).sort({ timestamp: -1 });
    if (format === 'json') return JSON.stringify(logs, null, 2);
    const headers = ['Timestamp', 'User ID', 'Action', 'Resource', 'Resource ID', 'Status', 'IP Address', 'Severity'];
    const rows = logs.map((log) => [log.timestamp.toISOString(), log.userId, log.action, log.resource, log.resourceId, log.statusCode, log.ip, log.severity]);
    return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  }

  static async cleanupOldLogs(daysToKeep = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const result = await AuditLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    return result.deletedCount || 0;
  }
}

export function auditLoggingMiddleware(action: string, resource: string, resourceIdField = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (data: any) {
      const resourceId = req.params[resourceIdField] || req.body?.id || 'N/A';
      if (res.statusCode < 400) {
        AuditLogger.logAction(
          (req as any).user?.userId || 'system',
          action,
          resource,
          resourceId,
          req,
          {
            organizationId: (req as any).user?.organizationId,
            details: { body: (req as any).body, query: req.query },
          }
        ).catch((error) => console.error('Failed to log audit:', error));
      }
      return originalSend.call(this, data);
    };
    next();
  };
}

export function detectChanges(oldValues: Record<string, any>, newValues: Record<string, any>): Record<string, any> {
  const changes: Record<string, any> = {};
  Object.keys(newValues).forEach((key) => {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changes[key] = { old: oldValues[key], new: newValues[key] };
    }
  });
  return changes;
}
