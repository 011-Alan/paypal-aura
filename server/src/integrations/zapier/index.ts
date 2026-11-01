import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AutomationRuleModel, NotificationModel, IAutomationRule } from '../../models';
import { recordAuditLog } from '../../middleware/security';

/**
 * Sponsor 10: Zapier MCP — Financial Workflow Automation ("AURA Automation Centre")
 *
 * Role: Connects AURA's Notification & Event Engine to user-authorised external channels
 * via Zapier MCP / Webhooks for the 5 core non-payment automations:
 * 1. Upcoming commitment reminder
 * 2. Financial milestone recognition
 * 3. Monthly financial summary
 * 4. Verified PayPal payment status notification
 * 5. Financial calendar reminder
 *
 * Critical Security Rule:
 * Zapier must NEVER bypass AURA's Financial Guardian or execute financial transactions.
 * Payloads are sanitised to omit sensitive account numbers, PINs, or credentials.
 */
export interface ZapierExecutionRecord {
  executionId: string;
  ruleId: string;
  automationType: IAutomationRule['automationType'];
  channel: string;
  targetDestination: string;
  liveZapierDispatched: boolean;
  status: 'delivered_external' | 'recorded_in_app_fallback' | 'blocked_by_guardian';
  sanitizedPayloadSummary: string;
  timestamp: string;
}

export class ZapierAutomationIntegrationService {
  private executionLogs: ZapierExecutionRecord[] = [];

  getHealthStatus() {
    const liveConfigured = Boolean(env.ZAPIER_API_KEY || env.ZAPIER_WEBHOOK_URL);
    return {
      technology: 'Zapier MCP',
      intendedResponsibility: 'External workflow automation for reminders, milestones, summaries & payment notifications',
      status: liveConfigured ? 'live_zapier_mcp_connected' : 'in_app_automation_engine_ready (Configure ZAPIER_API_KEY / ZAPIER_WEBHOOK_URL for external dispatch)',
      liveZapierConfigured: liveConfigured,
      mcpEndpoint: env.ZAPIER_MCP_URL,
      supportedAutomations: [
        'upcoming_commitment_reminder',
        'financial_milestone',
        'monthly_financial_summary',
        'payment_status_notification',
        'financial_calendar_reminder',
      ],
      securityPolicy: 'Strictly non-payment notifications; Financial Guardian blocks any payment execution trigger from external automations.',
      recentExecutionsCount: this.executionLogs.length,
    };
  }

  getExecutionLogs(limit = 20): ZapierExecutionRecord[] {
    return this.executionLogs.slice(0, limit);
  }

  /**
   * Ensures a user has the 5 default configurable automation rules initialized.
   */
  async ensureDefaultAutomationRules(userId: string, userEmail = 'alex@aura-demo.finance'): Promise<IAutomationRule[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const existing = await AutomationRuleModel.find({ userId: userObjId });
    if (existing.length > 0) {
      return existing;
    }

    const defaults: Partial<IAutomationRule>[] = [
      {
        userId: userObjId,
        automationType: 'upcoming_commitment_reminder',
        name: 'Automation 1: Upcoming Commitment Reminder',
        description: 'Sends a reminder 3 days before a confirmed mandate (Rent, Insurance, Internet, EMI) is due.',
        triggerDescription: 'Confirmed financial commitment is approaching within 72 hours',
        actionDescription: 'Deliver reminder via authorised Zapier MCP notification channel',
        channel: 'zapier_mcp',
        targetDestination: userEmail,
        enabled: true,
      },
      {
        userId: userObjId,
        automationType: 'financial_milestone',
        name: 'Automation 2: Financial Milestone Celebration',
        description: 'Sends a congratulatory note when you reach 25%, 50%, 75%, or 100% of a savings goal.',
        triggerDescription: 'User reaches or confirms a financial savings milestone',
        actionDescription: 'Send milestone celebration message via Zapier MCP',
        channel: 'email',
        targetDestination: userEmail,
        enabled: true,
      },
      {
        userId: userObjId,
        automationType: 'monthly_financial_summary',
        name: 'Automation 3: Monthly Financial Summary Digest',
        description: 'Delivers a privacy-safe monthly income, expense, and savings digest at month end.',
        triggerDescription: 'End of month or plan completion',
        actionDescription: 'Send structured monthly digest via Zapier MCP',
        channel: 'email',
        targetDestination: userEmail,
        enabled: true,
      },
      {
        userId: userObjId,
        automationType: 'payment_status_notification',
        name: 'Automation 4: PayPal Payment Status Alert',
        description: 'Sends an immediate receipt summary whenever a PayPal Sandbox payment is captured and verified.',
        triggerDescription: 'Verified PayPal payment status changes to CAPTURED/COMPLETED',
        actionDescription: 'Send payment verification receipt via Zapier MCP / Slack',
        channel: 'slack',
        targetDestination: '#aura-personal-finance-alerts',
        enabled: true,
      },
      {
        userId: userObjId,
        automationType: 'financial_calendar_reminder',
        name: 'Automation 5: Financial Calendar Event Sync',
        description: 'Dispatches an external reminder when a Bryntum Financial Life Calendar event is approaching.',
        triggerDescription: 'Bryntum Calendar event scheduled within 24 hours',
        actionDescription: 'Sync reminder to external calendar / notification channel via Zapier MCP',
        channel: 'google_calendar',
        targetDestination: userEmail,
        enabled: true,
      },
    ];

    await AutomationRuleModel.insertMany(defaults);
    return AutomationRuleModel.find({ userId: userObjId });
  }

  /**
   * Triggers a user-configured automation rule, deduplicating notifications so users never receive
   * duplicate reminders, and stripping any sensitive PII/credentials before external dispatch.
   */
  async triggerAutomation(params: {
    userId: string;
    automationType: IAutomationRule['automationType'];
    title: string;
    message: string;
    deduplicationKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    triggered: boolean;
    liveZapierDispatched: boolean;
    status: string;
    executionRecord?: ZapierExecutionRecord;
  }> {
    const userObjId = new mongoose.Types.ObjectId(params.userId);

    // Deduplication check
    if (params.deduplicationKey) {
      const existingNotif = await NotificationModel.findOne({
        userId: userObjId,
        deduplicationKey: params.deduplicationKey,
      });
      if (existingNotif) {
        return {
          triggered: false,
          liveZapierDispatched: existingNotif.zapierDispatched,
          status: 'skipped_duplicate_reminder',
        };
      }
    }

    const rule = await AutomationRuleModel.findOne({
      userId: userObjId,
      automationType: params.automationType,
    });

    // Always create an in-app notification so graceful degradation works even if external automation is disabled/offline
    const notif = await NotificationModel.create({
      userId: userObjId,
      type:
        params.automationType === 'upcoming_commitment_reminder'
          ? 'commitment_reminder'
          : params.automationType === 'financial_milestone'
          ? 'milestone'
          : params.automationType === 'monthly_financial_summary'
          ? 'monthly_summary'
          : params.automationType === 'payment_status_notification'
          ? 'payment_status'
          : 'calendar_reminder',
      title: params.title,
      message: params.message,
      severity: params.automationType === 'payment_status_notification' ? 'success' : 'info',
      isRead: false,
      zapierDispatched: false,
      deduplicationKey: params.deduplicationKey,
      metadata: params.metadata || {},
    });

    if (!rule || !rule.enabled) {
      return {
        triggered: true,
        liveZapierDispatched: false,
        status: 'in_app_only_rule_disabled',
      };
    }

    // Construct privacy-safe payload (never include raw account numbers, PIN hashes, or tokens)
    const safeExternalPayload = {
      source: 'AURA Financial Companion',
      automationType: rule.automationType,
      channel: rule.channel,
      destination: rule.targetDestination,
      title: params.title,
      message: params.message,
      timestamp: new Date().toISOString(),
    };

    let liveDispatched = false;
    const targetUrl = env.ZAPIER_WEBHOOK_URL || (env.ZAPIER_API_KEY ? `${env.ZAPIER_MCP_URL}/execute` : '');

    if (targetUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (env.ZAPIER_API_KEY) {
          headers.Authorization = `Bearer ${env.ZAPIER_API_KEY}`;
        }

        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(safeExternalPayload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          liveDispatched = true;
        }
      } catch (err: any) {
        logger.warn('ZapierIntegration', 'External Zapier endpoint unreachable; retained in-app notification', {
          error: err?.message,
        });
      }
    }

    notif.zapierDispatched = liveDispatched;
    await notif.save();

    rule.lastTriggeredAt = new Date();
    rule.executionCount += 1;
    rule.lastStatus = liveDispatched ? 'delivered' : 'queued_local';
    await rule.save();

    const record: ZapierExecutionRecord = {
      executionId: `zap-exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ruleId: String(rule._id),
      automationType: rule.automationType,
      channel: rule.channel,
      targetDestination: rule.targetDestination,
      liveZapierDispatched: liveDispatched,
      status: liveDispatched ? 'delivered_external' : 'recorded_in_app_fallback',
      sanitizedPayloadSummary: `${params.title} -> ${rule.channel} (${rule.targetDestination})`,
      timestamp: new Date().toISOString(),
    };

    this.executionLogs.unshift(record);
    if (this.executionLogs.length > 50) {
      this.executionLogs.pop();
    }

    await recordAuditLog({
      userId: params.userId,
      actor: 'system_worker',
      action: 'zapier_automation_triggered',
      resourceType: 'automation_rule',
      resourceId: String(rule._id),
      status: 'success',
      details: {
        automationType: rule.automationType,
        liveZapierDispatched: liveDispatched,
      },
    });

    return {
      triggered: true,
      liveZapierDispatched: liveDispatched,
      status: record.status,
      executionRecord: record,
    };
  }
}

export const zapierIntegration = new ZapierAutomationIntegrationService();
