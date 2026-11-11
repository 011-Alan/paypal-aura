import mongoose from 'mongoose';
import {
  TransactionModel,
  EcommerceOrderModel,
  MandateModel,
  GoalModel,
  UserModel,
  ITransaction,
  IEcommerceOrder,
  IMandate,
  IGoal,
} from '../../models';
import { logger } from '../../config/logger';

export type GridDataSource = 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget';

export interface GridSelectionPayload {
  source: GridDataSource;
  selectionMode?: 'explicit' | 'filtered' | 'all';
  selectedIds: string[];
  gridId: string;
  filterContext?: Record<string, any>;
  conversationId?: string;
}

export interface SanitizedSelectionContext {
  source: GridDataSource;
  gridId: string;
  totalSelected: number;
  records: any[];
  summary: {
    totalAmount: number;
    currency: string;
    itemCount: number;
    dateRange?: { earliest: string; latest: string };
    categories?: Record<string, number>;
    merchants?: Record<string, number>;
    recurringCount?: number;
    unusualCount?: number;
    averageAmount?: number;
    statuses?: Record<string, number>;
  };
}

export class GridSelectionService {
  /**
   * Authoritatively fetches and validates ownership of selected records.
   * Never trusts complete records sent from the client.
   * Strips sensitive private tokens while preserving rich financial attributes for AI analysis.
   */
  async getAuthorizedSelectionContext(
    userId: string,
    payload: GridSelectionPayload
  ): Promise<SanitizedSelectionContext> {
    const { source, selectedIds, gridId } = payload;

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return {
        source,
        gridId,
        totalSelected: 0,
        records: [],
        summary: { totalAmount: 0, currency: 'USD', itemCount: 0 },
      };
    }

    // Filter valid ObjectIds
    const validObjectIds = selectedIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await UserModel.findById(userId);

    let sanitizedRecords: any[] = [];
    let currency = user?.currency || 'USD';

    switch (source) {
      case 'transactions': {
        const query: any = {
          _id: { $in: validObjectIds },
          userId: userObjectId,
        };
        const txs = await TransactionModel.find(query).sort({ date: -1 });

        sanitizedRecords = txs.map((t: ITransaction) => ({
          id: String(t._id),
          date: new Date(t.date).toISOString().split('T')[0],
          merchant: t.merchant,
          description: t.description,
          category: t.category,
          amount: t.amount,
          type: t.type,
          currency: t.currency || currency,
          status: t.status,
          accountName: t.accountName,
          isRecurring: Boolean(t.isRecurring),
          isUnusual: Boolean(t.isUnusual),
          unusualReason: t.unusualReason || '',
        }));
        if (sanitizedRecords.length > 0) {
          currency = sanitizedRecords[0].currency;
        }
        break;
      }

      case 'orders': {
        // Enforce strict merchant vs customer isolation
        const isMerchant =
          user?.merchantAccessEnabled === true &&
          user?.auraAccountType === 'BUSINESS' &&
          user?.merchantVerificationStatus === 'VERIFIED';

        const query: any = {
          _id: { $in: validObjectIds },
        };

        if (isMerchant) {
          query.$or = [{ merchantId: userObjectId }, { merchantEmail: user?.email }];
        } else {
          query.userId = userObjectId;
        }

        const orders = await EcommerceOrderModel.find(query).sort({ createdAt: -1 });

        sanitizedRecords = orders.map((o: IEcommerceOrder) => ({
          id: String(o._id),
          orderNumber: o.orderNumber,
          date: new Date(o.createdAt).toISOString().split('T')[0],
          customerName: o.customerName,
          totalAmount: o.totalAmount,
          currency: o.currency || currency,
          fulfillmentStatus: o.fulfillmentStatus,
          paymentStatus: o.paymentInfo?.paymentStatus || 'pending',
          items: o.items.map((i) => ({
            name: i.name,
            brand: i.brand,
            category: i.category,
            quantity: i.quantity,
            totalPrice: i.totalPrice,
          })),
        }));
        if (sanitizedRecords.length > 0) {
          currency = sanitizedRecords[0].currency;
        }
        break;
      }

      case 'commitments': {
        const mandates = await MandateModel.find({
          _id: { $in: validObjectIds },
          userId: userObjectId,
        }).sort({ nextDueDate: 1 });

        sanitizedRecords = mandates.map((m: IMandate) => ({
          id: String(m._id),
          billerName: m.merchant || m.title,
          category: m.category,
          amount: m.amount,
          currency: m.currency || currency,
          frequency: m.frequency,
          status: m.status,
          nextBillingDate: m.nextDueDate ? new Date(m.nextDueDate).toISOString().split('T')[0] : '',
        }));
        if (sanitizedRecords.length > 0) {
          currency = sanitizedRecords[0].currency;
        }
        break;
      }

      case 'goals': {
        const goals = await GoalModel.find({
          _id: { $in: validObjectIds },
          userId: userObjectId,
        }).sort({ deadline: 1 });

        sanitizedRecords = goals.map((g: IGoal) => ({
          id: String(g._id),
          title: g.title,
          category: g.category,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          progressPercent: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
          deadline: g.deadline ? new Date(g.deadline).toISOString().split('T')[0] : '',
          priority: g.priority,
        }));
        break;
      }
    }

    // Compute statistical summary from the authorized subset
    const totalAmount = sanitizedRecords.reduce((sum, r) => sum + (Number(r.amount || r.totalAmount || r.targetAmount) || 0), 0);
    const roundedTotal = Math.round(totalAmount * 100) / 100;
    const averageAmount = sanitizedRecords.length > 0 ? Math.round((totalAmount / sanitizedRecords.length) * 100) / 100 : 0;

    const categories: Record<string, number> = {};
    const merchants: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    let recurringCount = 0;
    let unusualCount = 0;
    let earliest = '';
    let latest = '';

    for (const r of sanitizedRecords) {
      if (r.category) {
        categories[r.category] = (categories[r.category] || 0) + (Number(r.amount || r.totalAmount) || 1);
      }
      if (r.merchant || r.billerName || r.customerName) {
        const entity = r.merchant || r.billerName || r.customerName;
        merchants[entity] = (merchants[entity] || 0) + (Number(r.amount || r.totalAmount) || 1);
      }
      if (r.status || r.fulfillmentStatus) {
        const st = r.status || r.fulfillmentStatus;
        statuses[st] = (statuses[st] || 0) + 1;
      }
      if (r.isRecurring) recurringCount++;
      if (r.isUnusual) unusualCount++;

      if (r.date) {
        if (!earliest || r.date < earliest) earliest = r.date;
        if (!latest || r.date > latest) latest = r.date;
      }
    }

    logger.info('GridSelectionService', 'Authorized selection context built', {
      userId,
      source,
      requestedCount: selectedIds.length,
      authorizedCount: sanitizedRecords.length,
      roundedTotal,
    });

    return {
      source,
      gridId,
      totalSelected: sanitizedRecords.length,
      records: sanitizedRecords,
      summary: {
        totalAmount: roundedTotal,
        currency,
        itemCount: sanitizedRecords.length,
        averageAmount,
        dateRange: earliest ? { earliest, latest } : undefined,
        categories,
        merchants,
        recurringCount,
        unusualCount,
        statuses,
      },
    };
  }
}

export const gridSelectionService = new GridSelectionService();
