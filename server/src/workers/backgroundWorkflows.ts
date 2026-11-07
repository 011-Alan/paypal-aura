import { logger } from '../config/logger';
import { UserModel, MandateModel, TransactionModel } from '../models';
import { bryntumIntegration } from '../integrations/bryntum';
import { elasticIntegration } from '../integrations/elastic';
import { zapierIntegration } from '../integrations/zapier';
import { coreFinancialService } from '../services/financial/financialService';
import { pythonAnalyticsService } from '../services/analytics/analyticsService';

export interface WorkerJobRunSummary {
  jobName: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  details: Record<string, any>;
}

class RenderBackgroundWorkflowManager {
  private jobHistory: WorkerJobRunSummary[] = [];

  getHealthStatus() {
    return {
      technology: 'Render (Deployment & Background Worker Workflows)',
      intendedResponsibility: 'Hosting Frontend, Backend API & Background Workflows (Mandate checks, Elastic sync, Reminders)',
      status: 'operational',
      configuredWorkflows: [
        'daily_upcoming_commitments_and_calendar_reminders',
        'post_csv_import_analysis_and_elastic_sync',
        'post_paypal_webhook_settlement_and_summary_refresh',
        'elastic_retry_queue_synchroniser',
      ],
      recentJobRunsCount: this.jobHistory.length,
      recentJobRuns: this.jobHistory.slice(0, 10),
    };
  }

  /**
   * Workflow 1: Daily Upcoming Commitments & Bryntum Calendar Reminder Job
   */
  async runDailyCommitmentsWorkflow(targetUserId?: string): Promise<WorkerJobRunSummary> {
    const startedAt = new Date().toISOString();
    try {
      const users = targetUserId
        ? await UserModel.find({ _id: targetUserId })
        : await UserModel.find().limit(25);

      let totalCheckedMandates = 0;
      let remindersGenerated = 0;

      const now = new Date();
      for (const user of users) {
        const uid = String(user._id);
        await bryntumIntegration.syncUserFinancialCalendar(uid);

        const mandates = await MandateModel.find({
          userId: user._id,
          status: { $in: ['confirmed', 'inferred'] },
        });
        totalCheckedMandates += mandates.length;

        for (const m of mandates) {
          if (m.category === 'Salary') continue;
          const daysUntilDue = Math.ceil((new Date(m.nextDueDate).getTime() - now.getTime()) / 86400000);
          if (daysUntilDue >= 0 && daysUntilDue <= 7) {
            const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
            const trig = await zapierIntegration.triggerAutomation({
              userId: uid,
              automationType: 'upcoming_commitment_reminder',
              title: `Upcoming Commitment: ${m.title} ($${m.amount.toLocaleString('en-US')})`,
              message: `${m.title} of $${m.amount.toLocaleString('en-US')} to ${m.merchant} is due on the ${m.dueDayOfMonth}th (${daysUntilDue <= 0 ? 'today' : `in ${daysUntilDue} day(s)`}).`,
              deduplicationKey: `mandate-due-${String(m._id)}-${monthKey}`,
            });
            if (trig.triggered) remindersGenerated += 1;
          }
        }
      }

      const elasticFlush = await elasticIntegration.processRetryQueue();

      const summary: WorkerJobRunSummary = {
        jobName: 'daily_upcoming_commitments_and_calendar_reminders',
        status: 'completed',
        startedAt,
        completedAt: new Date().toISOString(),
        details: {
          usersProcessed: users.length,
          totalCheckedMandates,
          remindersGenerated,
          elasticRetryFlushed: elasticFlush.processed,
        },
      };
      this.recordRun(summary);
      return summary;
    } catch (err: any) {
      const failed: WorkerJobRunSummary = {
        jobName: 'daily_upcoming_commitments_and_calendar_reminders',
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        details: { error: err?.message },
      };
      this.recordRun(failed);
      return failed;
    }
  }

  /**
   * Workflow 2: Post-Transaction Import Analysis & Elastic Sync Pipeline
   */
  async runPostImportPipeline(userId: string): Promise<WorkerJobRunSummary> {
    const startedAt = new Date().toISOString();
    try {
      const transactions = await TransactionModel.find({ userId }).sort({ date: -1 }).limit(100);
      const user = await UserModel.findById(userId);
      const analytics = await pythonAnalyticsService.runPythonTask({
        task: 'analyze_transactions',
        monthlyIncome: user?.monthlyIncome || 95000,
        transactions,
      });

      let unsyncedSyncedCount = 0;
      for (const tx of transactions.filter((t) => !t.elasticSynced)) {
        const ok = await elasticIntegration.syncTransaction(tx);
        if (ok) unsyncedSyncedCount += 1;
      }

      const plan = await coreFinancialService.generateOrUpdateMonthlyPlan(userId);

      const summary: WorkerJobRunSummary = {
        jobName: 'post_csv_import_analysis_and_elastic_sync',
        status: 'completed',
        startedAt,
        completedAt: new Date().toISOString(),
        details: {
          analyzedTransactions: transactions.length,
          unusualDetected: analytics.unusualTransactions?.length || 0,
          unsyncedSyncedCount,
          planMonthUpdated: plan.month,
        },
      };
      this.recordRun(summary);
      return summary;
    } catch (err: any) {
      const failed: WorkerJobRunSummary = {
        jobName: 'post_csv_import_analysis_and_elastic_sync',
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        details: { error: err?.message },
      };
      this.recordRun(failed);
      return failed;
    }
  }

  private recordRun(run: WorkerJobRunSummary) {
    this.jobHistory.unshift(run);
    if (this.jobHistory.length > 40) {
      this.jobHistory.pop();
    }
    logger.info('RenderWorker', `Finished background workflow ${run.jobName} (${run.status})`, run.details);
  }
}

export const renderWorkerManager = new RenderBackgroundWorkflowManager();
