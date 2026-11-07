import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { CalendarEventModel, MandateModel, GoalModel, ICalendarEvent, IMandate, IGoal } from '../../models';

/**
 * Sponsor 4: Bryntum — Financial Life Calendar Integration
 *
 * Role: Powers AURA's Financial Life Calendar across Month, Week, Day, and Agenda views.
 * Synchronises salary dates, rent due dates, loan EMIs, insurance premiums, subscription renewals,
 * electricity bills, educational fees, savings milestones, and goal deadlines with the core
 * financial planning engine.
 */
export interface BryntumResourceItem {
  id: string;
  name: string;
  eventColor: string;
  category: string;
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
  eventColor: string;
  linkedMandateId?: string;
  linkedGoalId?: string;
  notes?: string;
}

export const BRYNTUM_RESOURCES: BryntumResourceItem[] = [
  { id: 'salary', name: 'Income & Salary', eventColor: '#10b981', category: 'Income' },
  { id: 'rent', name: 'Housing & Rent', eventColor: '#2563eb', category: 'Commitment' },
  { id: 'emi', name: 'Loan EMIs', eventColor: '#7c3aed', category: 'Commitment' },
  { id: 'insurance', name: 'Insurance Premiums', eventColor: '#0891b2', category: 'Commitment' },
  { id: 'subscription', name: 'Subscriptions', eventColor: '#db2777', category: 'Commitment' },
  { id: 'electricity', name: 'Utilities & Bills', eventColor: '#ea580c', category: 'Commitment' },
  { id: 'education', name: 'Educational Fees', eventColor: '#4f46e5', category: 'Commitment' },
  { id: 'milestone', name: 'Savings Milestones', eventColor: '#059669', category: 'Savings' },
  { id: 'goal_deadline', name: 'Financial Goal Deadlines', eventColor: '#d97706', category: 'Goals' },
  { id: 'reminder', name: 'Scheduled Reminders', eventColor: '#64748b', category: 'Reminder' },
];

const CATEGORY_TO_EVENT_TYPE: Record<string, { eventType: ICalendarEvent['eventType']; color: string }> = {
  Salary: { eventType: 'salary', color: '#10b981' },
  Rent: { eventType: 'rent', color: '#2563eb' },
  'Loan EMI': { eventType: 'emi', color: '#7c3aed' },
  Insurance: { eventType: 'insurance', color: '#0891b2' },
  Subscription: { eventType: 'subscription', color: '#db2777' },
  Electricity: { eventType: 'electricity', color: '#ea580c' },
  Internet: { eventType: 'electricity', color: '#ea580c' },
  Education: { eventType: 'education', color: '#4f46e5' },
  Savings: { eventType: 'milestone', color: '#059669' },
  Other: { eventType: 'commitment', color: '#3b82f6' },
};

export class BryntumCalendarIntegrationService {
  getHealthStatus() {
    return {
      technology: 'Bryntum',
      intendedResponsibility: 'Financial Life Calendar (Salary, Rent, EMIs, Bills, Subscriptions, Goal Deadlines & Reminders)',
      status: env.BRYNTUM_CALENDAR_ENABLED ? 'operational' : 'disabled',
      supportedViews: ['month', 'week', 'day', 'agenda'],
      defaultView: env.BRYNTUM_DEFAULT_VIEW,
      resourceCategoriesCount: BRYNTUM_RESOURCES.length,
      bidirectionalMandateSync: true,
    };
  }

  /**
   * Synchronises confirmed Mandates and active Goals into CalendarEvent documents for the current & next month.
   */
  async syncUserFinancialCalendar(userId: string): Promise<ICalendarEvent[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const mandates = await MandateModel.find({
      userId: userObjId,
      status: { $in: ['confirmed', 'inferred'] },
    });
    const goals = await GoalModel.find({ userId: userObjId, status: 'active' });

    const now = new Date();
    const monthsToProject = [
      { year: now.getFullYear(), month: now.getMonth() },
      { year: now.getFullYear(), month: now.getMonth() + 1 },
    ];

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
            linkedMandateId: mandate._id as mongoose.Types.ObjectId,
            status: startDate < now && mandate.category !== 'Salary' ? 'completed' : 'upcoming',
            color: mapping.color,
            notes: `${mandate.status === 'confirmed' ? 'Confirmed Mandate' : 'Inferred Recurring Commitment'} • ${mandate.merchant}`,
          });
        } else {
          existing.title = `${mandate.title} ($${mandate.amount.toLocaleString('en-US')})`;
          existing.amount = mandate.amount;
          existing.startDate = startDate;
          existing.endDate = endDate;
          await existing.save();
        }
      }
    }

    for (const goal of goals) {
      const existingGoalEvent = await CalendarEventModel.findOne({
        userId: userObjId,
        linkedGoalId: goal._id,
      });
      const deadlineDate = new Date(goal.deadline);
      if (!existingGoalEvent) {
        await CalendarEventModel.create({
          userId: userObjId,
          title: `Goal Target: ${goal.title} ($${goal.targetAmount.toLocaleString('en-US')})`,
          eventType: 'goal_deadline',
          startDate: deadlineDate,
          endDate: deadlineDate,
          allDay: true,
          amount: goal.targetAmount,
          currency: 'USD',
          linkedGoalId: goal._id as mongoose.Types.ObjectId,
          status: 'upcoming',
          color: '#d97706',
          notes: `Monthly savings contribution: $${goal.monthlyContribution.toLocaleString('en-US')}`,
        });
      }
    }

    return CalendarEventModel.find({ userId: userObjId }).sort({ startDate: 1 });
  }

  /**
   * Formats user calendar events into the Bryntum Calendar CRUD Manager payload structure
   * (resources, events, summary metrics, and upcoming 7-day commitments).
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

    const bryntumEvents: BryntumEventItem[] = events.map((ev) => ({
      id: String(ev._id),
      name: ev.title,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate.toISOString(),
      allDay: ev.allDay,
      resourceId: ev.eventType === 'commitment' ? 'rent' : ev.eventType,
      eventType: ev.eventType,
      amount: ev.amount || 0,
      currency: ev.currency,
      status: ev.status,
      eventColor: ev.color,
      linkedMandateId: ev.linkedMandateId ? String(ev.linkedMandateId) : undefined,
      linkedGoalId: ev.linkedGoalId ? String(ev.linkedGoalId) : undefined,
      notes: ev.notes,
    }));

    const now = new Date();
    const next14Days = new Date(now.getTime() + 14 * 86400000);
    const upcomingCommitments = bryntumEvents.filter((e) => {
      const d = new Date(e.startDate);
      return d >= now && d <= next14Days && e.eventType !== 'salary';
    });

    const totalUpcoming14DaysAmount = upcomingCommitments.reduce((sum, e) => sum + (e.amount || 0), 0);

    return {
      success: true,
      supportedViews: ['month', 'week', 'day', 'agenda'],
      resources: BRYNTUM_RESOURCES,
      events: bryntumEvents,
      summary: {
        totalEvents: bryntumEvents.length,
        upcoming14DaysCount: upcomingCommitments.length,
        upcoming14DaysTotalAmount: totalUpcoming14DaysAmount,
        upcomingCommitments,
      },
    };
  }

  /**
   * Bidirectional update: If a user changes a due date on the Bryntum Financial Calendar,
   * both the CalendarEvent and the underlying Mandate (if linked) update consistently.
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
