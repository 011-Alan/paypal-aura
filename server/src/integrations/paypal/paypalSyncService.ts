import mongoose from 'mongoose';
import { UserModel, AccountModel, TransactionModel, EcommerceOrderModel, ITransaction } from '../../models';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { paypalReportingService, MerchantTransactionItem } from './paypalReportingService';
import { paypalTransactionService, PayPalTransactionItem } from './paypalTransactionService';
import { paypalBalanceService } from './paypalBalanceService';
import { paypalProfileService } from './paypalProfileService';
import { bryntumIntegration } from '../bryntum';
import { elasticIntegration } from '../elastic';

export interface PayPalSyncOptions {
  forceRefresh?: boolean;
  fullHistoricalSync?: boolean;
  monthsBack?: number;
  startDate?: string;
  endDate?: string;
}

export interface PayPalSyncResult {
  success: boolean;
  userId: string;
  accountType: 'BUSINESS' | 'PERSONAL';
  syncedAt: Date;
  historicalRange: {
    startDate: string;
    endDate: string;
    monthsBack: number;
    windowsProcessed: number;
  };
  transactionsRetrieved: number;
  transactionsUpserted: number;
  duplicatesSkipped: number;
  linkedOrdersCount: number;
  reportingStatus: {
    available: boolean;
    statusMessage: string;
    details?: string;
    missingScope?: string;
    httpStatus?: number;
  };
  accountReconciliation: {
    accountName: string;
    verifiedBalance: number;
    currency: string;
    source: string;
  } | null;
}

export class PayPalSyncService {
  /**
   * Normalizes PayPal raw status and event code into strict AURA transaction status.
   * CRITICAL REQUIREMENT: Never treat authorizations or pending transactions as completed.
   */
  public normalizeTransactionStatus(
    rawStatus?: string,
    eventCode?: string,
    isAuthorization?: boolean
  ): 'completed' | 'pending' | 'flagged' | 'failed' | 'refunded' | 'reversed' {
    const raw = (rawStatus || '').toUpperCase().trim();
    const code = (eventCode || '').toUpperCase().trim();

    // 1. Authorization voids are REVERSED
    if (code === 'T0102') {
      return 'reversed'; // Void of authorization
    }

    // 2. Active authorizations are always PENDING
    if (isAuthorization || code.startsWith('T01') || code === 'T0100' || code === 'T0101') {
      return 'pending';
    }

    // 2. Pending states
    if (raw === 'P' || raw === 'PENDING' || raw === 'UNCONFIRMED' || raw === 'HELD') {
      return 'pending';
    }

    // 3. Reversals & Chargebacks
    if (raw === 'V' || raw === 'REVERSED' || raw === 'CHARGEBACK' || code === 'T1201') {
      return 'reversed';
    }

    // 4. Denied & Failed
    if (raw === 'D' || raw === 'DENIED' || raw === 'F' || raw === 'FAILED' || raw === 'CANCELED' || raw === 'CANCELLED') {
      return 'failed';
    }

    // 5. Refunds
    if (raw === 'REFUNDED' || raw === 'PARTIALLY_REFUNDED' || code === 'T1106' || code === 'T1107') {
      return 'refunded';
    }

    // 6. Success / Completed
    if (raw === 'S' || raw === 'SUCCESS' || raw === 'COMPLETED' || raw === 'CLEARED' || raw === 'PROCESSED') {
      return 'completed';
    }

    return 'completed';
  }

  /**
   * Determines direction and financial type based on gross amount and PayPal event code.
   */
  public classifyDirectionAndType(
    grossAmount: number,
    eventCode?: string
  ): { direction: 'incoming' | 'outgoing'; type: 'income' | 'expense' | 'transfer' } {
    const code = (eventCode || '').toUpperCase();

    // Bank withdrawals / transfers
    if (code.startsWith('T03') || code === 'T0300' || code === 'T0301') {
      return {
        direction: grossAmount >= 0 ? 'incoming' : 'outgoing',
        type: 'transfer',
      };
    }

    // Refunds sent
    if (code === 'T1106' || code === 'T1107') {
      return {
        direction: grossAmount < 0 ? 'outgoing' : 'incoming',
        type: grossAmount < 0 ? 'expense' : 'income',
      };
    }

    if (grossAmount >= 0) {
      return {
        direction: 'incoming',
        type: 'income',
      };
    } else {
      return {
        direction: 'outgoing',
        type: 'expense',
      };
    }
  }

  /**
   * Resolves or provisions a dedicated PayPal Account record for the user.
   */
  public async getOrCreatePayPalAccount(user: any): Promise<any> {
    const isBusiness =
      user.accountType === 'BUSINESS' || user.accountType === 'business' || user.role === 'merchant';

    let account = await AccountModel.findOne({
      userId: user._id,
      $or: [
        { institution: { $regex: /PayPal/i } },
        { name: { $regex: /PayPal/i } },
        isBusiness ? { name: { $regex: /Merchant/i } } : { type: 'checking' },
      ],
    });

    if (!account) {
      account = await AccountModel.create({
        userId: user._id,
        name: isBusiness ? 'PayPal Business Merchant Settlement' : 'Primary PayPal Linked Account',
        institution: `PayPal ${env.PAYPAL_MODE === 'live' ? 'Live' : 'Sandbox'} Account`,
        type: 'checking',
        accountNumberMasked: `•••• ${user.paypalPayerId ? user.paypalPayerId.slice(-4) : '4421'}`,
        balance: 0,
        currency: user.currency || 'USD',
        isSharedWithFamily: false,
        status: 'active',
        lastSyncedAt: new Date(),
      });
    }

    return account;
  }

  /**
   * Executes authoritative, deduplicating PayPal synchronization for a user.
   * Strictly enforces account type isolation between Personal and Business accounts.
   */
  public async syncUserPayPalData(userId: string, options?: PayPalSyncOptions): Promise<PayPalSyncResult> {
    const user = await UserModel.findById(userId).select('+paypalAccessToken +paypalRefreshToken');
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (!user.paypalAccountLinked || !user.paypalUserId) {
      throw new Error('No linked PayPal account found for this AURA user.');
    }

    const isBusiness =
      user.accountType === 'business' ||
      user.auraAccountType === 'BUSINESS' ||
      user.role === 'merchant';

    const accountType: 'BUSINESS' | 'PERSONAL' = isBusiness ? 'BUSINESS' : 'PERSONAL';
    const monthsBack = Math.max(1, Math.min(36, Number(options?.monthsBack || 3)));
    const now = new Date();
    const startDateObj = options?.startDate
      ? new Date(options.startDate)
      : new Date(Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000);
    const endDateObj = options?.endDate ? new Date(options.endDate) : now;

    const startDate = startDateObj.toISOString();
    const endDate = endDateObj.toISOString();

    const targetAccount = await this.getOrCreatePayPalAccount(user);

    let transactionsRetrieved = 0;
    let transactionsUpserted = 0;
    let duplicatesSkipped = 0;
    let linkedOrdersCount = 0;
    let reportingStatus: PayPalSyncResult['reportingStatus'];
    let verifiedBalance: number | null = null;
    let balanceSource = 'Default';
    let windowsCount = 1;

    if (isBusiness) {
      // =========================================================================
      // BUSINESS ACCOUNT SYNCHRONIZATION
      // =========================================================================
      logger.info('PayPalSyncService', 'Executing Business / Merchant PayPal Sync', {
        userId: String(user._id),
        monthsBack,
        startDate,
        endDate,
      });

      // 1. Fetch live Merchant Balances
      const balanceRes = await paypalReportingService.getMerchantBalances();
      if (balanceRes.available && balanceRes.primaryBalance !== null) {
        verifiedBalance = balanceRes.primaryBalance;
        balanceSource = 'PayPal Merchant Reporting Balances API';
      }

      // 2. Fetch Historical Merchant Transactions with 30-day chunking & full pagination
      const historyRes = await paypalReportingService.getMerchantTransactionsHistorical({
        startDate,
        endDate,
        monthsBack,
        pageSize: 100,
      });

      reportingStatus = {
        available: historyRes.available,
        statusMessage: historyRes.statusMessage,
        details: historyRes.details,
        missingScope: historyRes.available ? undefined : historyRes.details,
      };

      windowsCount = historyRes.windowsProcessed;
      transactionsRetrieved = historyRes.transactions.length;

      // 3. Upsert transactions into TransactionModel with stable paypalTransactionId
      for (const item of historyRes.transactions) {
        const stableId = item.id;
        const normalizedStatus = this.normalizeTransactionStatus(item.rawStatus, item.eventCode, item.isAuthorization);
        const { direction, type } = this.classifyDirectionAndType(item.grossAmount, item.eventCode);
        const grossAbs = Math.abs(item.grossAmount);
        const feeAbs = Math.abs(item.fee || 0);
        const netAbs = item.netAmount !== undefined ? Math.abs(item.netAmount) : Math.max(0, grossAbs - feeAbs);

        // Counterparty / Merchant info
        const counterpartyLabel = item.payerEmail || item.payerAccountId || 'PayPal Customer';
        const merchantLabel = item.payerName || (direction === 'incoming' ? 'Customer Payment' : 'PayPal Merchant Settlement');

        // Look up corresponding EcommerceOrderModel if order number or paypal IDs match
        let matchedOrder = null;
        if (item.orderNumber) {
          matchedOrder = await EcommerceOrderModel.findOne({ orderNumber: item.orderNumber });
        }
        if (!matchedOrder && item.paypalOrderId) {
          matchedOrder = await EcommerceOrderModel.findOne({ 'paymentInfo.paypalOrderId': item.paypalOrderId });
        }
        if (!matchedOrder && item.paypalCaptureId) {
          matchedOrder = await EcommerceOrderModel.findOne({ 'paymentInfo.paypalCaptureId': item.paypalCaptureId });
        }

        let associatedOrderId: string | undefined = undefined;
        let resolvedOrderNumber = item.orderNumber;

        if (matchedOrder) {
          associatedOrderId = String(matchedOrder._id);
          resolvedOrderNumber = matchedOrder.orderNumber;
          linkedOrdersCount++;

          // If transaction is completed and order payment was pending, advance order state
          if (normalizedStatus === 'completed' && matchedOrder.paymentInfo?.paymentStatus !== 'completed') {
            matchedOrder.paymentInfo.paymentStatus = 'completed';
            matchedOrder.paymentInfo.paidAt = new Date(item.date);
            matchedOrder.paymentInfo.paypalCaptureId = item.paypalCaptureId || item.id;
            matchedOrder.paymentInfo.amountPaid = grossAbs;
            if (matchedOrder.fulfillmentStatus === 'payment_completed' || !matchedOrder.fulfillmentStatus) {
              matchedOrder.fulfillmentStatus = 'order_confirmed';
            }
            await matchedOrder.save();
          }
        }

        // Upsert into TransactionModel
        const existingTx = await TransactionModel.findOne({
          userId: user._id,
          paypalTransactionId: stableId,
        });

        if (existingTx) {
          // Update existing record if status or net values evolved
          existingTx.status = normalizedStatus;
          existingTx.feeAmount = feeAbs;
          existingTx.netAmount = netAbs;
          if (associatedOrderId) existingTx.associatedOrderId = associatedOrderId;
          if (resolvedOrderNumber) existingTx.orderNumber = resolvedOrderNumber;
          if (item.description) existingTx.description = item.description;
          await existingTx.save();
          duplicatesSkipped++;
        } else {
          await TransactionModel.create({
            userId: user._id,
            accountId: targetAccount._id,
            accountName: targetAccount.name,
            date: new Date(item.date),
            merchant: merchantLabel,
            counterparty: counterpartyLabel,
            description: item.description || `PayPal Settlement: ${stableId}`,
            category: direction === 'incoming' ? 'Income' : 'Business Expense',
            type,
            direction,
            amount: grossAbs,
            feeAmount: feeAbs,
            netAmount: netAbs,
            currency: item.currency || 'USD',
            status: normalizedStatus,
            paymentMethod: 'paypal',
            paypalTransactionId: stableId,
            paypalOrderId: item.paypalOrderId,
            paypalCaptureId: item.paypalCaptureId,
            associatedOrderId,
            orderNumber: resolvedOrderNumber,
            tags: ['paypal-sync', 'merchant-reporting', 'paypal-sandbox'],
          });
          transactionsUpserted++;
        }
      }

      // Reconcile business account balance
      if (verifiedBalance !== null) {
        targetAccount.balance = verifiedBalance;
        targetAccount.currency = balanceRes.primaryCurrency || 'USD';
        targetAccount.lastSyncedAt = new Date();
        await targetAccount.save();
      }
    } else {
      // =========================================================================
      // PERSONAL ACCOUNT SYNCHRONIZATION
      // =========================================================================
      logger.info('PayPalSyncService', 'Executing Personal Consumer PayPal Sync', {
        userId: String(user._id),
      });

      // 1. Fetch personal profile and balance
      const [profile, personalBal] = await Promise.all([
        paypalProfileService.getProfile(userId, { forceRefresh: options?.forceRefresh }),
        paypalBalanceService.getBalance(userId),
      ]);

      if (personalBal.available && personalBal.balance !== null) {
        verifiedBalance = personalBal.balance;
        balanceSource = 'PayPal User Wallet Balance API';
      }

      // 2. Attempt read-only consumer transaction retrieval
      const personalTxRes = await paypalTransactionService.getTransactions(userId, {
        startDate,
        endDate,
        page: 1,
        pageSize: 100,
      });

      reportingStatus = {
        available: personalTxRes.available,
        statusMessage: personalTxRes.statusMessage,
        details: personalTxRes.details,
        httpStatus: personalTxRes.httpStatus,
      };

      if (personalTxRes.available && Array.isArray(personalTxRes.transactions)) {
        transactionsRetrieved = personalTxRes.transactions.length;

        for (const item of personalTxRes.transactions) {
          const stableId = item.id;
          const normalizedStatus = this.normalizeTransactionStatus(item.status, item.type, item.isAuthorization);
          const { direction, type } = this.classifyDirectionAndType(item.amount, item.type);
          const grossAbs = Math.abs(item.amount);
          const feeAbs = Math.abs(item.fee || 0);
          const netAbs = item.netAmount !== undefined ? Math.abs(item.netAmount) : Math.max(0, grossAbs - feeAbs);

          const existingTx = await TransactionModel.findOne({
            userId: user._id,
            paypalTransactionId: stableId,
          });

          if (existingTx) {
            existingTx.status = normalizedStatus;
            existingTx.feeAmount = feeAbs;
            existingTx.netAmount = netAbs;
            await existingTx.save();
            duplicatesSkipped++;
          } else {
            await TransactionModel.create({
              userId: user._id,
              accountId: targetAccount._id,
              accountName: targetAccount.name,
              date: new Date(item.date),
              merchant: item.senderOrRecipient || 'PayPal Transaction',
              counterparty: item.payerEmail || item.senderOrRecipient || 'PayPal Counterparty',
              description: item.description || `PayPal Payment: ${stableId}`,
              category: type === 'income' ? 'Income' : 'Shopping',
              type,
              direction,
              amount: grossAbs,
              feeAmount: feeAbs,
              netAmount: netAbs,
              currency: item.currency || 'USD',
              status: normalizedStatus,
              paymentMethod: 'paypal',
              paypalTransactionId: stableId,
              paypalOrderId: item.paypalOrderId,
              paypalCaptureId: item.paypalCaptureId,
              orderNumber: item.orderNumber,
              tags: ['paypal-sync', 'personal-wallet', 'paypal-sandbox'],
            });
            transactionsUpserted++;
          }
        }
      } else {
        // Honest personal scope notice: NEVER mix merchant transactions into personal account!
        logger.info('PayPalSyncService', 'Personal wallet reporting scope ungranted on consumer token. Maintaining personal data isolation.', {
          userId: String(user._id),
          notice: reportingStatus.statusMessage,
        });
      }

      // Reconcile personal balance without touching merchant figures
      if (verifiedBalance !== null) {
        targetAccount.balance = verifiedBalance;
        targetAccount.currency = personalBal.currency || 'USD';
        targetAccount.lastSyncedAt = new Date();
        await targetAccount.save();
      }
    }

    // Persist last sync time on user profile
    const nowSync = new Date();
    await UserModel.updateOne({ _id: user._id }, { $set: { paypalLastSyncAt: nowSync } });

    // Trigger Bryntum Calendar sync in background
    await bryntumIntegration.syncUserFinancialCalendar(String(user._id)).catch(() => {});

    return {
      success: true,
      userId: String(user._id),
      accountType,
      syncedAt: nowSync,
      historicalRange: {
        startDate,
        endDate,
        monthsBack,
        windowsProcessed: windowsCount,
      },
      transactionsRetrieved,
      transactionsUpserted,
      duplicatesSkipped,
      linkedOrdersCount,
      reportingStatus,
      accountReconciliation: verifiedBalance !== null ? {
        accountName: targetAccount.name,
        verifiedBalance,
        currency: targetAccount.currency,
        source: balanceSource,
      } : null,
    };
  }
}

export const paypalSyncService = new PayPalSyncService();
