import mongoose from 'mongoose';
import {
  ScheduledTaskModel,
  IScheduledTask,
  NotificationModel,
  CalendarEventModel,
  TransactionModel,
  AccountModel,
  MandateModel,
  GoalModel,
} from '../../models';
import { logger } from '../../config/logger';

export interface CreateScheduleParams {
  userId: string;
  title: string;
  message?: string;
  scheduleType: 'one_time' | 'recurring' | 'conditional_event';
  triggerType:
    | 'datetime'
    | 'transaction_threshold'
    | 'spending_threshold'
    | 'balance_threshold'
    | 'mandate_due_offset';
  targetDateTime?: Date | string;
  timezone?: string;
  recurrenceRule?: 'daily' | 'weekly' | 'monthly' | 'custom_cron';
  recurrenceDayOfWeek?: number;
  recurrenceDayOfMonth?: number;
  offsetDays?: number;
  condition?: {
    field?: 'amount' | 'spending_month' | 'balance' | 'salary';
    operator?: '>' | '<' | '>=' | '<=' | '==';
    thresholdValue?: number;
    category?: string;
    targetMandateTitle?: string;
  };
  notificationPreferences?: {
    channel: 'in_app' | 'email' | 'push';
    severity: 'info' | 'success' | 'warning' | 'urgent';
  };
  metadata?: Record<string, any>;
}

export class DurableSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly DEFAULT_TIMEZONE = 'Asia/Kolkata';

  /**
   * Start the durable background evaluation loop (runs every 30 seconds)
   */
  start(intervalMs = 30000) {
    if (this.timer) return;
    logger.info('DurableScheduler', `Starting durable scheduler loop with ${intervalMs}ms interval...`);
    this.timer = setInterval(() => {
      this.evaluateScheduledJobs().catch((err) => {
        logger.error('DurableScheduler', 'Error in scheduler loop execution', { error: err?.message });
      });
    }, intervalMs);

    // Initial check immediately on boot (delayed 3s to let DB connect)
    setTimeout(() => {
      this.evaluateScheduledJobs().catch(() => {});
    }, 3000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('DurableScheduler', 'Durable scheduler loop stopped.');
    }
  }

  /**
   * Parse natural-language date/time in the context of user timezone
   */
  parseNaturalTime(input: string, userTimezone = this.DEFAULT_TIMEZONE): {
    targetDate: Date;
    scheduleType: 'one_time' | 'recurring';
    recurrenceRule?: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: number;
    dayOfMonth?: number;
    offsetDays?: number;
    extractedTitle?: string;
  } {
    const raw = (input || '').trim().toLowerCase();
    const now = new Date();

    // Check for weekly recurring, e.g. "every sunday", "every monday"
    const weekDays: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    for (const [dayName, dayIndex] of Object.entries(weekDays)) {
      if (raw.includes(`every ${dayName}`) || raw.includes(`each ${dayName}`)) {
        const nextDate = new Date(now);
        const currentDay = nextDate.getDay();
        const diff = (dayIndex + 7 - currentDay) % 7 || 7;
        nextDate.setDate(nextDate.getDate() + diff);
        nextDate.setHours(9, 0, 0, 0);
        return {
          targetDate: nextDate,
          scheduleType: 'recurring',
          recurrenceRule: 'weekly',
          dayOfWeek: dayIndex,
        };
      }
    }

    // Check for monthly recurrence e.g. "every month", "monthly"
    if (raw.includes('every month') || raw.includes('monthly') || raw.includes('each month')) {
      const dayMatch = raw.match(/(\d+)(?:st|nd|rd|th)?/);
      const dayOfMonth = dayMatch ? parseInt(dayMatch[1], 10) : 1;
      const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dayOfMonth, 28), 9, 0, 0);
      return {
        targetDate: nextDate,
        scheduleType: 'recurring',
        recurrenceRule: 'monthly',
        dayOfMonth,
      };
    }

    // Check for offset before due e.g. "3 days before rent is due"
    const offsetMatch = raw.match(/(\d+)\s*days?\s*before/i);
    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1], 10);
      return {
        targetDate: new Date(now.getTime() + 86400000 * 3),
        scheduleType: 'recurring',
        recurrenceRule: 'monthly',
        offsetDays: offset,
      };
    }

    // Check for "tomorrow"
    if (raw.includes('tomorrow')) {
      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
      return { targetDate: target, scheduleType: 'one_time' };
    }

    // Check for explicit months: "November 15", "15 Nov", "Nov 15"
    const monthNames: Record<string, number> = {
      january: 0, jan: 0,
      february: 1, feb: 1,
      march: 2, mar: 2,
      april: 3, apr: 3,
      may: 4,
      june: 5, jun: 5,
      july: 6, jul: 6,
      august: 7, aug: 7,
      september: 8, sep: 8, sept: 8,
      october: 9, oct: 9,
      november: 10, nov: 10,
      december: 11, dec: 11,
    };

    for (const [mName, mIndex] of Object.entries(monthNames)) {
      const regex = new RegExp(`(?:${mName})\\s*(\\d{1,2})|(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:${mName})`, 'i');
      const match = raw.match(regex);
      if (match) {
        const dayStr = match[1] || match[2];
        const day = parseInt(dayStr, 10);
        let year = now.getFullYear();
        const candidate = new Date(year, mIndex, day, 9, 0, 0);
        if (candidate.getTime() < now.getTime()) {
          year += 1;
        }
        return {
          targetDate: new Date(year, mIndex, day, 9, 0, 0),
          scheduleType: 'one_time',
        };
      }
    }

    // Default fallback: 1 day in future
    const fallbackDate = new Date(now.getTime() + 86400000);
    fallbackDate.setHours(9, 0, 0, 0);
    return { targetDate: fallbackDate, scheduleType: 'one_time' };
  }

  /**
   * Create and persist a new schedule
   */
  async createSchedule(params: CreateScheduleParams): Promise<IScheduledTask> {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timezone = params.timezone || this.DEFAULT_TIMEZONE;

    let nextExecutionAt: Date | undefined;
    if (params.targetDateTime) {
      nextExecutionAt = new Date(params.targetDateTime);
    } else if (params.scheduleType === 'recurring') {
      const now = new Date();
      if (params.recurrenceRule === 'daily') {
        nextExecutionAt = new Date(now.getTime() + 86400000);
      } else if (params.recurrenceRule === 'weekly') {
        const currentDay = now.getDay();
        const targetDay = params.recurrenceDayOfWeek ?? 0;
        const diff = (targetDay + 7 - currentDay) % 7 || 7;
        nextExecutionAt = new Date(now);
        nextExecutionAt.setDate(now.getDate() + diff);
        nextExecutionAt.setHours(9, 0, 0, 0);
      } else if (params.recurrenceRule === 'monthly') {
        const targetDay = params.recurrenceDayOfMonth || 1;
        nextExecutionAt = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, 9, 0, 0);
      } else {
        nextExecutionAt = new Date(now.getTime() + 86400000);
      }
    } else if (params.scheduleType === 'conditional_event') {
      nextExecutionAt = new Date(); // Evaluate immediately upon rule activation
    }

    const task = await ScheduledTaskModel.create({
      userId: userObjId,
      scheduleId,
      title: params.title,
      message: params.message || params.title,
      scheduleType: params.scheduleType,
      triggerType: params.triggerType,
      targetDateTime: params.targetDateTime ? new Date(params.targetDateTime) : nextExecutionAt,
      timezone,
      recurrenceRule: params.recurrenceRule,
      recurrenceDayOfWeek: params.recurrenceDayOfWeek,
      recurrenceDayOfMonth: params.recurrenceDayOfMonth,
      offsetDays: params.offsetDays,
      condition: params.condition,
      notificationPreferences: params.notificationPreferences || {
        channel: 'in_app',
        severity: 'info',
      },
      status: 'active',
      nextExecutionAt,
      executionCount: 0,
      metadata: params.metadata || {},
    });

    // Also link with CalendarEventModel if it is a reminder or calendar event
    if (params.scheduleType === 'one_time' || params.scheduleType === 'recurring') {
      try {
        await CalendarEventModel.create({
          userId: userObjId,
          title: params.title,
          eventType: 'reminder',
          startDate: task.targetDateTime || new Date(),
          endDate: task.targetDateTime || new Date(),
          allDay: true,
          status: 'upcoming',
          color: '#2563eb',
          notes: `Scheduled via Ask AURA. Schedule ID: ${scheduleId}`,
        });
      } catch (calErr: any) {
        logger.warn('DurableScheduler', 'Could not create linked calendar event', { error: calErr?.message });
      }
    }

    logger.info('DurableScheduler', 'Created scheduled task', {
      scheduleId,
      userId: params.userId,
      title: params.title,
      nextExecutionAt,
    });

    return task;
  }

  /**
   * List schedules for an authenticated user
   */
  async listSchedules(userId: string, filter?: { status?: string }): Promise<IScheduledTask[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const query: any = { userId: userObjId };
    if (filter?.status) {
      query.status = filter.status;
    }
    return ScheduledTaskModel.find(query).sort({ nextExecutionAt: 1, createdAt: -1 });
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    userId: string,
    scheduleId: string,
    updates: Partial<IScheduledTask>
  ): Promise<IScheduledTask | null> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const task = await ScheduledTaskModel.findOne({
      $or: [{ scheduleId }, { _id: mongoose.isValidObjectId(scheduleId) ? scheduleId : null }],
      userId: userObjId,
    });

    if (!task) return null;

    if (updates.title) task.title = updates.title;
    if (updates.message) task.message = updates.message;
    if (updates.targetDateTime) {
      task.targetDateTime = new Date(updates.targetDateTime);
      task.nextExecutionAt = new Date(updates.targetDateTime);
    }
    if (updates.status) task.status = updates.status;
    if (updates.recurrenceRule) task.recurrenceRule = updates.recurrenceRule;

    await task.save();
    return task;
  }

  /**
   * Cancel an existing schedule
   */
  async cancelSchedule(userId: string, scheduleId: string): Promise<boolean> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const task = await ScheduledTaskModel.findOne({
      $or: [{ scheduleId }, { _id: mongoose.isValidObjectId(scheduleId) ? scheduleId : null }],
      userId: userObjId,
    });

    if (!task) return false;

    task.status = 'cancelled';
    await task.save();

    logger.info('DurableScheduler', 'Cancelled schedule', { scheduleId, userId });
    return true;
  }

  /**
   * The core background evaluation engine: evaluates datetime jobs and conditional rules
   */
  async evaluateScheduledJobs(): Promise<{
    processedCount: number;
    notificationsCreated: number;
  }> {
    if (this.isProcessing) return { processedCount: 0, notificationsCreated: 0 };
    this.isProcessing = true;

    let processedCount = 0;
    let notificationsCreated = 0;
    const now = new Date();

    try {
      // 1. Process due Datetime & Recurring jobs
      const dueTasks = await ScheduledTaskModel.find({
        status: 'active',
        nextExecutionAt: { $lte: now },
        triggerType: { $in: ['datetime', 'mandate_due_offset'] },
      }).limit(50);

      for (const task of dueTasks) {
        try {
          // Deliver notification
          await NotificationModel.create({
            userId: task.userId,
            type: 'commitment_reminder',
            title: task.title,
            message: task.message || `Scheduled Reminder: ${task.title}`,
            severity: task.notificationPreferences?.severity || 'info',
            isRead: false,
            deduplicationKey: `sched-exec-${task.scheduleId}-${now.toISOString().substring(0, 10)}`,
            metadata: {
              scheduleId: task.scheduleId,
              scheduleType: task.scheduleType,
              executedAt: now.toISOString(),
            },
          });
          notificationsCreated += 1;
          processedCount += 1;

          task.lastExecutedAt = now;
          task.executionCount += 1;

          if (task.scheduleType === 'one_time') {
            task.status = 'completed';
            task.nextExecutionAt = undefined;
          } else if (task.scheduleType === 'recurring') {
            // Compute next execution
            if (task.recurrenceRule === 'daily') {
              task.nextExecutionAt = new Date(now.getTime() + 86400000);
            } else if (task.recurrenceRule === 'weekly') {
              task.nextExecutionAt = new Date(now.getTime() + 7 * 86400000);
            } else if (task.recurrenceRule === 'monthly') {
              const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, task.recurrenceDayOfMonth || 1, 9, 0, 0);
              task.nextExecutionAt = nextMonth;
            } else {
              task.nextExecutionAt = new Date(now.getTime() + 86400000);
            }
          }
          await task.save();
        } catch (taskErr: any) {
          logger.error('DurableScheduler', 'Error executing due task', {
            scheduleId: task.scheduleId,
            error: taskErr?.message,
          });
        }
      }

      // 2. Process Conditional Event Rules
      const conditionalTasks = await ScheduledTaskModel.find({
        status: 'active',
        scheduleType: 'conditional_event',
      }).limit(50);

      for (const task of conditionalTasks) {
        try {
          const triggered = await this.evaluateCondition(task);
          if (triggered) {
            await NotificationModel.create({
              userId: task.userId,
              type: 'spending_warning',
              title: task.title,
              message: task.message || `Triggered alert: ${task.title}`,
              severity: task.notificationPreferences?.severity || 'warning',
              isRead: false,
              deduplicationKey: `sched-cond-${task.scheduleId}-${now.toISOString().substring(0, 10)}`,
              metadata: {
                scheduleId: task.scheduleId,
                triggerType: task.triggerType,
                condition: task.condition,
                triggeredAt: now.toISOString(),
              },
            });
            notificationsCreated += 1;
            processedCount += 1;

            task.lastExecutedAt = now;
            task.executionCount += 1;
            await task.save();
          }
        } catch (condErr: any) {
          logger.error('DurableScheduler', 'Error evaluating conditional task', {
            scheduleId: task.scheduleId,
            error: condErr?.message,
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processedCount, notificationsCreated };
  }

  /**
   * Evaluate a specific conditional rule against real database records
   */
  private async evaluateCondition(task: IScheduledTask): Promise<boolean> {
    const userObjId = task.userId;
    const cond = task.condition || {};
    const threshold = cond.thresholdValue || 0;

    switch (task.triggerType) {
      case 'transaction_threshold': {
        // Find expense or payment transactions matching criteria since last check
        const query: any = {
          userId: userObjId,
          createdAt: { $gte: task.lastExecutedAt || new Date(Date.now() - 3600000) },
        };
        if (cond.field === 'salary' || cond.category === 'Salary') {
          query.category = 'Salary';
        } else if (cond.operator === '>' || cond.operator === '>=') {
          query.amount = { $gte: threshold };
        }
        const tx = await TransactionModel.findOne(query);
        return Boolean(tx);
      }

      case 'spending_threshold': {
        // Calculate spending in current month
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const query: any = {
          userId: userObjId,
          type: 'expense',
          date: { $gte: startOfMonth },
        };
        if (cond.category) {
          query.category = new RegExp(cond.category, 'i');
        }
        const txs = await TransactionModel.find(query);
        const total = txs.reduce((sum, t) => sum + (t.amount || 0), 0);
        return total >= threshold;
      }

      case 'balance_threshold': {
        // Check liquid balances
        const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
        const totalBalance = accounts
          .filter((a) => a.type === 'checking' || a.type === 'savings')
          .reduce((sum, a) => sum + (a.balance || 0), 0);

        if (cond.operator === '<' || cond.operator === '<=') {
          return totalBalance <= threshold;
        } else if (cond.operator === '>' || cond.operator === '>=') {
          return totalBalance >= threshold;
        }
        return false;
      }

      case 'mandate_due_offset': {
        // Check if any mandate is due within offset days
        const offset = task.offsetDays || 3;
        const now = new Date();
        const mandates = await MandateModel.find({
          userId: userObjId,
          status: { $in: ['confirmed', 'inferred'] },
        });

        for (const m of mandates) {
          if (cond.targetMandateTitle && !m.title.toLowerCase().includes(cond.targetMandateTitle.toLowerCase())) {
            continue;
          }
          const daysUntilDue = Math.ceil((new Date(m.nextDueDate).getTime() - now.getTime()) / 86400000);
          if (daysUntilDue >= 0 && daysUntilDue <= offset) {
            return true;
          }
        }
        return false;
      }

      default:
        return false;
    }
  }
}

export const durableSchedulerService = new DurableSchedulerService();
