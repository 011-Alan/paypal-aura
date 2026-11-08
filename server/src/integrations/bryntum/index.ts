import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  CalendarEventModel,
  MandateModel,
  GoalModel,
  TransactionModel,
  EcommerceOrderModel,
  ICalendarEvent,
  IMandate,
  IGoal,
  ITransaction,
  IEcommerceOrder,
} from '../../models';

/**
 * Sponsor 4: Bryntum — Financial Life Calendar, Gantt & Scheduler Integration
 *
 * Role: Powers AURA's Financial Life Calendar across Financial Timeline, Month, Week, Agenda,
 * and Cash Flow views, Bryntum Gantt for Financial Roadmaps (goals & structured milestones),
 * and Bryntum Scheduler for multi-resource recurring commitments.
 */
export interface BryntumResourceItem {
  id: string;
  name: string;
  eventColor: string;
  category: string;
  icon?: string;
}

export interface BryntumEventItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  resourceId: string;
  eventType: string;
  amount: number;
  currency: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  isCompleted: boolean;
  isOverdue?: boolean;
  eventColor: string;
  counterparty?: string;
  paymentMethod?: string;
  linkedMandateId?: string;
  linkedGoalId?: string;
  linkedTransactionId?: string;
  linkedOrderId?: string;
  notes?: string;
}

export interface BryntumGanttTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  percentDone: number;
  duration?: number;
  durationUnit?: string;
  category?: string;
  targetAmount?: number;
  currentAmount?: number;
  currency?: string;
  isMilestone?: boolean;
  expanded?: boolean;
  children?: BryntumGanttTask[];
  notes?: string;
  status?: string;
  cls?: string;
}

export interface BryntumGanttDependency {
  id: string;
  from: string;
  to: string;
  type: number; // 2 = Finish-to-Start
  lag?: number;
}

export const BRYNTUM_RESOURCES: BryntumResourceItem[] = [
  { id: 'salary', name: 'Salary & Primary Income', eventColor: '#10b981', category: 'Income', icon: 'dollar-sign' },
  { id: 'incoming', name: 'Incoming Transfers & Refunds', eventColor: '#059669', category: 'Income', icon: 'arrow-down-left' },
  { id: 'rent', name: 'Housing & Rent', eventColor: '#2563eb', category: 'Commitment', icon: 'home' },
  { id: 'emi', name: 'Loan EMIs & Debt Repayment', eventColor: '#7c3aed', category: 'Commitment', icon: 'credit-card' },
  { id: 'credit_card', name: 'Credit Card Due Dates', eventColor: '#f59e0b', category: 'Commitment', icon: 'credit-card' },
  { id: 'bill', name: 'Utilities & Household Bills', eventColor: '#ea580c', category: 'Commitment', icon: 'zap' },
  { id: 'electricity', name: 'Electricity & Internet', eventColor: '#f97316', category: 'Commitment', icon: 'wifi' },
  { id: 'subscription', name: 'Recurring Subscriptions', eventColor: '#db2777', category: 'Commitment', icon: 'repeat' },
  { id: 'insurance', name: 'Insurance Premiums', eventColor: '#0891b2', category: 'Commitment', icon: 'shield' },
  { id: 'education', name: 'Educational Fees', eventColor: '#4f46e5', category: 'Commitment', icon: 'book' },
  { id: 'outgoing', name: 'Outgoing Expenses', eventColor: '#ef4444', category: 'Expense', icon: 'arrow-up-right' },
  { id: 'paypal_payment', name: 'PayPal Payments & Purchases', eventColor: '#0070ba', category: 'PayPal', icon: 'paypal' },
  { id: 'commerce_delivery', name: 'AURA Commerce Deliveries', eventColor: '#8b5cf6', category: 'Commerce', icon: 'truck' },
  { id: 'planned_purchase', name: 'Planned Purchases', eventColor: '#3b82f6', category: 'Shopping', icon: 'shopping-cart' },
  { id: 'milestone', name: 'Savings Milestones', eventColor: '#14b8a6', category: 'Savings', icon: 'award' },
  { id: 'goal_deadline', name: 'Financial Goal Deadlines', eventColor: '#d97706', category: 'Goals', icon: 'target' },
  { id: 'reminder', name: 'Scheduled Reminders', eventColor: '#64748b', category: 'Reminder', icon: 'bell' },
];

export const SCHEDULER_RESOURCES = [
  { id: 'res_income', name: 'Income & Cashflow', category: 'Inflow', eventColor: '#10b981' },
  { id: 'res_housing', name: 'Housing & Rent', category: 'Fixed Commitment', eventColor: '#2563eb' },
  { id: 'res_debt', name: 'Banking & Loan EMIs', category: 'Fixed Commitment', eventColor: '#7c3aed' },
  { id: 'res_utilities', name: 'Utilities & Bills', category: 'Essential', eventColor: '#ea580c' },
  { id: 'res_subscriptions', name: 'Recurring Subscriptions', category: 'Discretionary', eventColor: '#db2777' },
  { id: 'res_commerce', name: 'AURA Commerce & PayPal', category: 'Discretionary', eventColor: '#8b5cf6' },
];

const CATEGORY_TO_EVENT_TYPE: Record<string, { eventType: ICalendarEvent['eventType']; color: string; direction: 'incoming' | 'outgoing' }> = {
  Salary: { eventType: 'salary', color: '#10b981', direction: 'incoming' },
  Rent: { eventType: 'rent', color: '#2563eb', direction: 'outgoing' },
  'Loan EMI': { eventType: 'emi', color: '#7c3aed', direction: 'outgoing' },
  Insurance: { eventType: 'insurance', color: '#0891b2', direction: 'outgoing' },
  Subscription: { eventType: 'subscription', color: '#db2777', direction: 'outgoing' },
  Electricity: { eventType: 'electricity', color: '#f97316', direction: 'outgoing' },
  Internet: { eventType: 'electricity', color: '#ea580c', direction: 'outgoing' },
  Education: { eventType: 'education', color: '#4f46e5', direction: 'outgoing' },
  Savings: { eventType: 'milestone', color: '#14b8a6', direction: 'incoming' },
  Other: { eventType: 'commitment', color: '#3b82f6', direction: 'outgoing' },
};

export class BryntumCalendarIntegrationService {
  getHealthStatus() {
    return {
      technology: 'Bryntum',
      intendedResponsibility: 'Financial Life Calendar (Timeline, Month, Week, Agenda, Cash Flow), Gantt Roadmap, and Scheduler',
      status: env.BRYNTUM_CALENDAR_ENABLED ? 'operational' : 'disabled',
      supportedViews: ['timeline', 'month', 'week', 'agenda', 'cashflow'],
      defaultView: env.BRYNTUM_DEFAULT_VIEW,
      resourceCategoriesCount: BRYNTUM_RESOURCES.length,
      schedulerResourcesCount: SCHEDULER_RESOURCES.length,
      bidirectionalMandateSync: true,
      ganttRoadmapEnabled: true,
      schedulerTimelineEnabled: true,
    };
  }

  /**
   * Synchronises confirmed Mandates, active Goals, completed Transactions,
   * and Commerce Deliveries into CalendarEvent documents.
   */
  async syncUserFinancialCalendar(userId: string): Promise<ICalendarEvent[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const mandates = await MandateModel.find({
      userId: userObjId,
      status: { $in: ['confirmed', 'inferred'] },
    });
    const goals = await GoalModel.find({ userId: userObjId, status: 'active' });
    const transactions = await TransactionModel.find({ userId: userObjId })
      .sort({ date: -1 })
      .limit(60);
    const orders = await EcommerceOrderModel.find({ userId: userObjId })
      .sort({ createdAt: -1 })
      .limit(30);

    const now = new Date();
    const monthsToProject = [
      { year: now.getFullYear(), month: now.getMonth() - 1 },
      { year: now.getFullYear(), month: now.getMonth() },
      { year: now.getFullYear(), month: now.getMonth() + 1 },
      { year: now.getFullYear(), month: now.getMonth() + 2 },
    ];

    // 1. Sync Mandates
    for (const mandate of mandates) {
      const mapping = CATEGORY_TO_EVENT_TYPE[mandate.category] || CATEGORY_TO_EVENT_TYPE.Other;

      for (const { year, month } of monthsToProject) {
        const maxDay = new Date(year, month + 1, 0).getDate();
        const dueDay = Math.min(mandate.dueDayOfMonth, maxDay);
        const startDate = new Date(year, month, dueDay, 9, 0, 0);
        const endDate = new Date(year, month, dueDay, 18, 0, 0);

        const existing = await CalendarEventModel.findOne({
          userId: userObjId,
          linkedMandateId: mandate._id,
          startDate: {
            $gte: new Date(year, month, 1),
            $lte: new Date(year, month + 1, 0, 23, 59, 59),
          },
        });

        const isPast = startDate < now;
        const isCompleted = isPast && mandate.category === 'Salary';
        const isOverdue = isPast && mandate.category !== 'Salary';

        if (!existing) {
          await CalendarEventModel.create({
            userId: userObjId,
            title: `${mandate.title} ($${mandate.amount.toLocaleString('en-US')})`,
            eventType: mapping.eventType,
            startDate,
            endDate,
            allDay: true,
            amount: mandate.amount,
            currency: 'USD',
            direction: mapping.direction,
            isCompleted,
            isOverdue,
            counterparty: mandate.merchant,
            linkedMandateId: mandate._id as mongoose.Types.ObjectId,
            status: isCompleted ? 'completed' : isOverdue ? 'overdue' : 'upcoming',
            color: mapping.color,
            notes: `${mandate.status === 'confirmed' ? 'Confirmed Mandate' : 'Inferred Commitment'} • ${mandate.merchant}`,
          });
        } else {
          existing.title = `${mandate.title} ($${mandate.amount.toLocaleString('en-US')})`;
          existing.amount = mandate.amount;
          existing.startDate = startDate;
          existing.endDate = endDate;
          existing.direction = mapping.direction;
          if (!existing.isCompleted) {
            existing.isOverdue = isOverdue;
            if (isOverdue && existing.status !== 'completed') {
              existing.status = 'overdue';
            }
          }
          await existing.save();
        }
      }
    }

    // 2. Sync Goals
    for (const goal of goals) {
      const existingGoalEvent = await CalendarEventModel.findOne({
        userId: userObjId,
        linkedGoalId: goal._id,
      });
      const deadlineDate = new Date(goal.deadline);
      const isPast = deadlineDate < now;
      const isCompleted = goal.currentAmount >= goal.targetAmount;

      if (!existingGoalEvent) {
        await CalendarEventModel.create({
          userId: userObjId,
          title: `Goal Deadline: ${goal.title} ($${goal.targetAmount.toLocaleString('en-US')})`,
          eventType: 'goal_deadline',
          startDate: deadlineDate,
          endDate: deadlineDate,
          allDay: true,
          amount: goal.targetAmount,
          currency: 'USD',
          direction: 'incoming',
          isCompleted,
          isOverdue: isPast && !isCompleted,
          linkedGoalId: goal._id as mongoose.Types.ObjectId,
          status: isCompleted ? 'completed' : isPast ? 'overdue' : 'upcoming',
          color: '#d97706',
          notes: `Progress: $${goal.currentAmount.toLocaleString('en-US')} / $${goal.targetAmount.toLocaleString('en-US')} (${Math.round(
            (goal.currentAmount / (goal.targetAmount || 1)) * 100
          )}%) • Contribution: $${goal.monthlyContribution.toLocaleString('en-US')}/mo`,
        });
      } else {
        existingGoalEvent.startDate = deadlineDate;
        existingGoalEvent.endDate = deadlineDate;
        existingGoalEvent.amount = goal.targetAmount;
        existingGoalEvent.isCompleted = isCompleted;
        existingGoalEvent.isOverdue = isPast && !isCompleted;
        await existingGoalEvent.save();
      }
    }

    // 3. Sync Completed Transactions
    for (const tx of transactions) {
      const existingTxEvent = await CalendarEventModel.findOne({
        userId: userObjId,
        linkedTransactionId: tx._id,
      });

      if (!existingTxEvent) {
        const isIncoming = tx.direction === 'incoming' || tx.type === 'income';
        const isPaypal = tx.paymentMethod === 'paypal';
        let eventType: ICalendarEvent['eventType'] = isIncoming
          ? tx.category === 'Income'
            ? 'salary'
            : 'income'
          : isPaypal
          ? 'paypal_payment'
          : 'outgoing';

        if (tx.category === 'Housing' || tx.category === 'Rent') eventType = 'rent';
        if (tx.category === 'Utilities') eventType = 'electricity';
        if (tx.category === 'Subscriptions') eventType = 'subscription';

        const color = isIncoming ? '#10b981' : isPaypal ? '#0070ba' : '#ef4444';

        await CalendarEventModel.create({
          userId: userObjId,
          title: `${tx.merchant}: ${isIncoming ? '+' : '-'}$${tx.amount.toLocaleString('en-US')}`,
          eventType,
          startDate: tx.date,
          endDate: tx.date,
          allDay: true,
          amount: tx.amount,
          currency: tx.currency || 'USD',
          direction: isIncoming ? 'incoming' : 'outgoing',
          isCompleted: true,
          isOverdue: false,
          counterparty: tx.counterparty || tx.merchant,
          paymentMethod: tx.paymentMethod,
          linkedTransactionId: tx._id as mongoose.Types.ObjectId,
          status: 'completed',
          color,
          notes: `${tx.description} • Account: ${tx.accountName}${tx.paypalCaptureId ? ` • PayPal Capture: ${tx.paypalCaptureId}` : ''}`,
        });
      }
    }

    // 4. Sync Commerce Orders
    for (const order of orders) {
      const existingOrderEvent = await CalendarEventModel.findOne({
        userId: userObjId,
        linkedOrderId: order.orderNumber,
      });

      const deliveryDate = order.shipment?.estimatedDeliveryAt
        ? new Date(order.shipment.estimatedDeliveryAt)
        : new Date(order.createdAt.getTime() + 3 * 86400000);

      const isDelivered = order.fulfillmentStatus === 'delivered';
      const statusTitle =
        order.fulfillmentStatus === 'delivered'
          ? 'Delivered'
          : order.fulfillmentStatus === 'shipped' || order.fulfillmentStatus === 'out_for_delivery'
          ? 'Out for Delivery'
          : 'Delivery Milestone';

      if (!existingOrderEvent) {
        await CalendarEventModel.create({
          userId: userObjId,
          title: `AURA Order #${order.orderNumber} ${statusTitle} ($${order.totalAmount.toLocaleString('en-US')})`,
          eventType: 'commerce_delivery',
          startDate: deliveryDate,
          endDate: deliveryDate,
          allDay: true,
          amount: order.totalAmount,
          currency: order.currency || 'USD',
          direction: 'outgoing',
          isCompleted: isDelivered,
          isOverdue: deliveryDate < now && !isDelivered,
          linkedOrderId: order.orderNumber,
          status: isDelivered ? 'completed' : 'upcoming',
          color: '#8b5cf6',
          notes: `Items: ${order.items.map((i) => i.name).join(', ')} • Tracking: ${order.shipment?.trackingNumber || 'Pending'} • Carrier: ${order.shipment?.carrier || 'Standard'}`,
        });
      } else {
        existingOrderEvent.startDate = deliveryDate;
        existingOrderEvent.endDate = deliveryDate;
        existingOrderEvent.isCompleted = isDelivered;
        existingOrderEvent.status = isDelivered ? 'completed' : 'upcoming';
        existingOrderEvent.isOverdue = deliveryDate < now && !isDelivered;
        await existingOrderEvent.save();
      }
    }

    return CalendarEventModel.find({ userId: userObjId }).sort({ startDate: 1 });
  }

  /**
   * Formats user calendar events into the Bryntum Calendar CRUD Manager payload structure
   * including 5 view modes support, detailed cash flow daily totals, and overdue insights.
   */
  async getBryntumCalendarDataset(userId: string, rangeStart?: string, rangeEnd?: string) {
    await this.syncUserFinancialCalendar(userId);
    const query: Record<string, any> = { userId: new mongoose.Types.ObjectId(userId) };
    if (rangeStart || rangeEnd) {
      query.startDate = {};
      if (rangeStart) query.startDate.$gte = new Date(rangeStart);
      if (rangeEnd) query.startDate.$lte = new Date(rangeEnd);
    }

    const events = await CalendarEventModel.find(query).sort({ startDate: 1 });
    const now = new Date();

    const bryntumEvents: BryntumEventItem[] = events.map((ev) => {
      const isPast = ev.startDate < now;
      const isCompleted = ev.isCompleted || ev.status === 'completed';
      const isOverdue = !isCompleted && isPast && ev.eventType !== 'salary';

      let resourceId: string = ev.eventType;
      if (ev.eventType === 'commitment') resourceId = 'rent';
      if (!BRYNTUM_RESOURCES.some((r) => r.id === resourceId)) {
        resourceId = ev.direction === 'incoming' ? 'incoming' : 'outgoing';
      }

      return {
        id: String(ev._id),
        name: ev.title,
        startDate: ev.startDate.toISOString(),
        endDate: ev.endDate.toISOString(),
        allDay: ev.allDay,
        resourceId,
        eventType: ev.eventType,
        amount: ev.amount || 0,
        currency: ev.currency || 'USD',
        status: isCompleted ? 'completed' : isOverdue ? 'overdue' : ev.status || 'upcoming',
        direction: ev.direction || (ev.eventType === 'salary' || ev.eventType === 'income' ? 'incoming' : 'outgoing'),
        isCompleted,
        isOverdue,
        eventColor: ev.color || '#3b82f6',
        counterparty: ev.counterparty,
        paymentMethod: ev.paymentMethod,
        linkedMandateId: ev.linkedMandateId ? String(ev.linkedMandateId) : undefined,
        linkedGoalId: ev.linkedGoalId ? String(ev.linkedGoalId) : undefined,
        linkedTransactionId: ev.linkedTransactionId ? String(ev.linkedTransactionId) : undefined,
        linkedOrderId: ev.linkedOrderId,
        notes: ev.notes,
      };
    });

    const next14Days = new Date(now.getTime() + 14 * 86400000);
    const upcomingCommitments = bryntumEvents.filter((e) => {
      const d = new Date(e.startDate);
      return !e.isCompleted && d >= now && d <= next14Days && e.direction === 'outgoing';
    });

    const overdueCommitments = bryntumEvents.filter((e) => e.isOverdue);

    // Cash flow aggregation
    const dailyMap = new Map<string, { date: string; incoming: number; outgoing: number; net: number; count: number }>();
    let totalProjectedIncome = 0;
    let totalProjectedOutgoing = 0;
    let totalActualIncome = 0;
    let totalActualOutgoing = 0;

    for (const e of bryntumEvents) {
      const dateKey = e.startDate.split('T')[0];
      const entry = dailyMap.get(dateKey) || { date: dateKey, incoming: 0, outgoing: 0, net: 0, count: 0 };
      entry.count += 1;

      if (e.direction === 'incoming') {
        entry.incoming += e.amount;
        if (e.isCompleted) totalActualIncome += e.amount;
        else totalProjectedIncome += e.amount;
      } else {
        entry.outgoing += e.amount;
        if (e.isCompleted) totalActualOutgoing += e.amount;
        else totalProjectedOutgoing += e.amount;
      }
      entry.net = entry.incoming - entry.outgoing;
      dailyMap.set(dateKey, entry);
    }

    const dailyCashFlow = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      supportedViews: ['timeline', 'month', 'week', 'agenda', 'cashflow'],
      resources: BRYNTUM_RESOURCES,
      events: bryntumEvents,
      summary: {
        totalEvents: bryntumEvents.length,
        upcoming14DaysCount: upcomingCommitments.length,
        upcoming14DaysTotalAmount: upcomingCommitments.reduce((sum, e) => sum + (e.amount || 0), 0),
        upcomingCommitments,
        overdueCount: overdueCommitments.length,
        overdueTotalAmount: overdueCommitments.reduce((sum, e) => sum + (e.amount || 0), 0),
        overdueCommitments,
        cashFlow: {
          projectedIncome: Math.round(totalProjectedIncome * 100) / 100,
          projectedOutgoing: Math.round(totalProjectedOutgoing * 100) / 100,
          netProjectedCashFlow: Math.round((totalProjectedIncome - totalProjectedOutgoing) * 100) / 100,
          actualIncome: Math.round(totalActualIncome * 100) / 100,
          actualOutgoing: Math.round(totalActualOutgoing * 100) / 100,
          netActualCashFlow: Math.round((totalActualIncome - totalActualOutgoing) * 100) / 100,
          dailyCashFlow,
        },
      },
    };
  }

  /**
   * Generates a Bryntum Gantt project dataset for the Financial Roadmap.
   * Maps long-term financial goals into hierarchical tasks, milestone tracking,
   * dependencies, and progress percentages tied directly to real account savings.
   */
  async getBryntumGanttRoadmap(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const goals = await GoalModel.find({ userId: userObjId }).sort({ priority: 1, deadline: 1 });
    const now = new Date();

    const tasks: BryntumGanttTask[] = [];
    const dependencies: BryntumGanttDependency[] = [];
    let depCounter = 1;

    // Build structured financial roadmap for each goal
    for (const goal of goals) {
      const percentDone = Math.min(100, Math.round(((goal.currentAmount || 0) / (goal.targetAmount || 1)) * 100));
      const goalStart = goal.createdAt ? new Date(goal.createdAt) : new Date(now.getTime() - 60 * 86400000);
      const goalEnd = new Date(goal.deadline);
      const totalDurationDays = Math.max(1, Math.round((goalEnd.getTime() - goalStart.getTime()) / 86400000));

      const parentTaskId = `goal_${goal._id}`;

      // Subtasks: Milestones & Savings Phases
      const phase1Duration = Math.round(totalDurationDays * 0.35);
      const phase2Duration = Math.round(totalDurationDays * 0.45);
      const phase1End = new Date(goalStart.getTime() + phase1Duration * 86400000);
      const phase2End = new Date(phase1End.getTime() + phase2Duration * 86400000);

      const subtask1Id = `${parentTaskId}_phase1`;
      const subtask2Id = `${parentTaskId}_phase2`;
      const milestone50Id = `${parentTaskId}_ms50`;
      const finalMilestoneId = `${parentTaskId}_final`;

      const subtask1Percent = percentDone >= 35 ? 100 : Math.round((percentDone / 35) * 100);
      const subtask2Percent = percentDone < 35 ? 0 : percentDone >= 85 ? 100 : Math.round(((percentDone - 35) / 50) * 100);

      const children: BryntumGanttTask[] = [
        {
          id: subtask1Id,
          name: `Phase 1: Capital Allocation & Monthly Deposit ($${goal.monthlyContribution}/mo)`,
          startDate: goalStart.toISOString(),
          endDate: phase1End.toISOString(),
          percentDone: subtask1Percent,
          duration: phase1Duration,
          durationUnit: 'd',
          status: subtask1Percent === 100 ? 'completed' : 'in_progress',
          category: goal.category,
        },
        {
          id: milestone50Id,
          name: `Milestone: 50% Target Reached ($${Math.round(goal.targetAmount * 0.5).toLocaleString('en-US')})`,
          startDate: phase1End.toISOString(),
          endDate: phase1End.toISOString(),
          percentDone: percentDone >= 50 ? 100 : 0,
          isMilestone: true,
          status: percentDone >= 50 ? 'completed' : 'planned',
          category: goal.category,
        },
        {
          id: subtask2Id,
          name: `Phase 2: Target Accumulation & Compound Yield`,
          startDate: phase1End.toISOString(),
          endDate: phase2End.toISOString(),
          percentDone: subtask2Percent,
          duration: phase2Duration,
          durationUnit: 'd',
          status: subtask2Percent === 100 ? 'completed' : subtask2Percent > 0 ? 'in_progress' : 'planned',
          category: goal.category,
        },
        {
          id: finalMilestoneId,
          name: `Goal Fulfilled: ${goal.title} ($${goal.targetAmount.toLocaleString('en-US')})`,
          startDate: goalEnd.toISOString(),
          endDate: goalEnd.toISOString(),
          percentDone: percentDone >= 100 ? 100 : 0,
          isMilestone: true,
          status: percentDone >= 100 ? 'completed' : 'planned',
          category: goal.category,
        },
      ];

      // Add finish-to-start dependencies
      dependencies.push({
        id: `dep_${depCounter++}`,
        from: subtask1Id,
        to: milestone50Id,
        type: 2,
      });
      dependencies.push({
        id: `dep_${depCounter++}`,
        from: milestone50Id,
        to: subtask2Id,
        type: 2,
      });
      dependencies.push({
        id: `dep_${depCounter++}`,
        from: subtask2Id,
        to: finalMilestoneId,
        type: 2,
      });

      tasks.push({
        id: parentTaskId,
        name: `GOAL: ${goal.title}`,
        startDate: goalStart.toISOString(),
        endDate: goalEnd.toISOString(),
        percentDone,
        category: goal.category,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        currency: 'USD',
        status: goal.status,
        expanded: true,
        children,
        notes: `Priority: ${goal.priority.toUpperCase()} • Monthly Savings: $${goal.monthlyContribution.toLocaleString('en-US')}`,
      });
    }

    // Calculate overall roadmap summary
    const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
    const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
    const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

    return {
      success: true,
      tasks,
      dependencies,
      summary: {
        totalGoals: goals.length,
        totalTargetAmount: totalTarget,
        totalSavedAmount: totalSaved,
        overallProgressPercent: overallProgress,
        activeGoalsCount: goals.filter((g) => g.status === 'active').length,
        completedGoalsCount: goals.filter((g) => g.status === 'completed' || (g.currentAmount >= g.targetAmount && g.targetAmount > 0)).length,
      },
    };
  }

  /**
   * Generates a Bryntum Scheduler multi-resource timeline dataset for recurring commitments.
   * Maps financial commitments across categories: Income, Housing, Debt, Utilities, Subscriptions, Commerce.
   */
  async getBryntumSchedulerCommitments(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
    const orders = await EcommerceOrderModel.find({ userId: userObjId }).limit(10);
    const now = new Date();

    const schedulerEvents: any[] = [];
    let eventCounter = 1;

    for (const mandate of mandates) {
      let resourceId = 'res_subscriptions';
      if (mandate.category === 'Salary') resourceId = 'res_income';
      else if (mandate.category === 'Rent') resourceId = 'res_housing';
      else if (mandate.category === 'Loan EMI' || mandate.category === 'Insurance') resourceId = 'res_debt';
      else if (mandate.category === 'Electricity' || mandate.category === 'Internet' || mandate.category === 'Education')
        resourceId = 'res_utilities';

      // Project across 3 months
      for (let offset = -1; offset <= 2; offset++) {
        const eventDate = new Date(now.getFullYear(), now.getMonth() + offset, mandate.dueDayOfMonth, 10, 0, 0);
        const endDate = new Date(now.getFullYear(), now.getMonth() + offset, mandate.dueDayOfMonth, 18, 0, 0);

        schedulerEvents.push({
          id: `sched_m_${mandate._id}_${offset}_${eventCounter++}`,
          resourceId,
          name: `${mandate.merchant}: $${mandate.amount.toLocaleString('en-US')}`,
          startDate: eventDate.toISOString(),
          endDate: endDate.toISOString(),
          amount: mandate.amount,
          frequency: mandate.frequency || 'monthly',
          category: mandate.category,
          status: eventDate < now ? 'cleared' : 'scheduled',
          autoPay: mandate.autoPayEnabled,
          counterparty: mandate.merchant,
        });
      }
    }

    for (const order of orders) {
      const orderDate = order.shipment?.estimatedDeliveryAt
        ? new Date(order.shipment.estimatedDeliveryAt)
        : new Date(order.createdAt.getTime() + 3 * 86400000);

      schedulerEvents.push({
        id: `sched_o_${order.orderNumber}_${eventCounter++}`,
        resourceId: 'res_commerce',
        name: `Order #${order.orderNumber} ($${order.totalAmount})`,
        startDate: orderDate.toISOString(),
        endDate: new Date(orderDate.getTime() + 6 * 3600 * 1000).toISOString(),
        amount: order.totalAmount,
        status: order.fulfillmentStatus,
        counterparty: 'AURA Store',
      });
    }

    return {
      success: true,
      resources: SCHEDULER_RESOURCES,
      events: schedulerEvents,
      summary: {
        totalResources: SCHEDULER_RESOURCES.length,
        totalCommitments: schedulerEvents.length,
      },
    };
  }

  /**
   * Reschedules an uncompleted commitment.
   * Safety guard: completed payments and transactions CANNOT be rescheduled.
   */
  async rescheduleCalendarEvent(
    userId: string,
    eventId: string,
    newStartDateIso: string
  ): Promise<{ event: ICalendarEvent; updatedMandate?: IMandate | null }> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const event = await CalendarEventModel.findOne({ _id: eventId, userId: userObjId });
    if (!event) {
      throw new Error('Calendar event not found or unauthorized');
    }

    if (event.isCompleted || event.status === 'completed' || event.linkedTransactionId) {
      throw new Error('Completed payments and settled transactions cannot be rescheduled. Only scheduled future commitments may be adjusted.');
    }

    const newDate = new Date(newStartDateIso);
    if (isNaN(newDate.getTime())) {
      throw new Error('Invalid date provided for rescheduling');
    }

    event.startDate = newDate;
    event.endDate = new Date(newDate.getTime() + 9 * 3600 * 1000);
    event.status = 'rescheduled';
    await event.save();

    let updatedMandate: IMandate | null = null;
    if (event.linkedMandateId) {
      updatedMandate = await MandateModel.findOne({
        _id: event.linkedMandateId,
        userId: userObjId,
      });
      if (updatedMandate) {
        updatedMandate.dueDayOfMonth = newDate.getDate();
        updatedMandate.nextDueDate = newDate;
        await updatedMandate.save();
        logger.info('BryntumIntegration', 'Synchronised rescheduled calendar event back to Mandate', {
          eventId,
          mandateId: String(updatedMandate._id),
          newDueDay: updatedMandate.dueDayOfMonth,
        });
      }
    }

    return { event, updatedMandate };
  }
}

export const bryntumIntegration = new BryntumCalendarIntegrationService();
