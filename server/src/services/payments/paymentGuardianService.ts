import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../../config/env';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  PaymentRequestModel,
  IPaymentRequest,
  IUser,
} from '../../models';
import {
  verifySecretArgon2id,
  issuePaymentApprovalToken,
  verifyPaymentApprovalToken,
  recordAuditLog,
} from '../../middleware/security';
import { paypalIntegration } from '../../integrations/paypal';
import { elasticIntegration } from '../../integrations/elastic';
import { bryntumIntegration } from '../../integrations/bryntum';
import { zapierIntegration } from '../../integrations/zapier';
import { coreFinancialService } from '../financial/financialService';

export class PaymentGuardianService {
  /**
   * Step 1-7: Prepares a payment request and runs the Financial Guardian policy evaluation.
   * Never executes a payment automatically.
   */
  async preparePaymentRequest(params: {
    userId: string;
    accountId?: string;
    recipientName: string;
    recipientEmail?: string;
    merchantCategory?: string;
    description: string;
    amountInr: number;
    idempotencyKey?: string;
  }): Promise<IPaymentRequest> {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const amountInr = Math.round(Number(params.amountInr) * 100) / 100;
    if (isNaN(amountInr) || amountInr <= 0) {
      throw new Error('Payment amount must be a positive number.');
    }

    const idempotencyKey =
      params.idempotencyKey ||
      `aura-pay-${params.userId.slice(-6)}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const existing = await PaymentRequestModel.findOne({ idempotencyKey, userId: userObjId });
    if (existing) {
      return existing;
    }

    const account = params.accountId
      ? await AccountModel.findOne({ _id: params.accountId, userId: userObjId })
      : await AccountModel.findOne({ userId: userObjId, status: 'active' }).sort({ balance: -1 });

    // Calculate today's spending for daily limit enforcement
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTx = await TransactionModel.find({
      userId: userObjId,
      type: 'expense',
      date: { $gte: startOfToday },
    });
    const spentToday = todayTx.reduce((s, t) => s + t.amount, 0);

    const policy = user.financialPolicy;
    const category = params.merchantCategory || 'General';

    const checkSingleLimit = amountInr <= policy.singleTransactionLimit;
    const checkDailyLimit = spentToday + amountInr <= policy.dailySpendingLimit;
    const checkCategoryAllowed = !policy.blockedCategories.includes(category);
    const checkSufficientBalance = account ? account.balance >= amountInr : true;

    const policyChecks = [
      {
        rule: 'Single Transaction Limit',
        passed: checkSingleLimit,
        detail: checkSingleLimit
          ? `₹${amountInr.toLocaleString('en-IN')} is within your ₹${policy.singleTransactionLimit.toLocaleString('en-IN')} single transaction limit.`
          : `₹${amountInr.toLocaleString('en-IN')} exceeds your ₹${policy.singleTransactionLimit.toLocaleString('en-IN')} single transaction limit.`,
      },
      {
        rule: 'Daily Spending Cap',
        passed: checkDailyLimit,
        detail: checkDailyLimit
          ? `Projected daily total ₹${(spentToday + amountInr).toLocaleString('en-IN')} is within your ₹${policy.dailySpendingLimit.toLocaleString('en-IN')} daily cap.`
          : `Projected daily total ₹${(spentToday + amountInr).toLocaleString('en-IN')} exceeds your ₹${policy.dailySpendingLimit.toLocaleString('en-IN')} daily cap.`,
      },
      {
        rule: 'Category Permission Check',
        passed: checkCategoryAllowed,
        detail: checkCategoryAllowed
          ? `Category "${category}" is authorised under your Financial Permission Policy.`
          : `Category "${category}" is restricted by your Financial Permission Policy.`,
      },
      {
        rule: 'Account Liquidity Check',
        passed: checkSufficientBalance,
        detail: checkSufficientBalance
          ? `Selected account (${account?.name || 'Primary'}) has sufficient funds (₹${(account?.balance || 0).toLocaleString('en-IN')}).`
          : `Selected account balance (₹${(account?.balance || 0).toLocaleString('en-IN')}) is lower than ₹${amountInr.toLocaleString('en-IN')}.`,
      },
    ];

    const passedAllHardRules =
      checkSingleLimit && checkDailyLimit && checkCategoryAllowed && checkSufficientBalance;
    const requiresPin = true; // Always require PIN verification or above threshold

    const amountUsd = Math.max(1.0, Math.round(amountInr * env.INR_TO_USD_RATE * 100) / 100);

    const paymentReq = await PaymentRequestModel.create({
      userId: userObjId,
      accountId: account?._id,
      idempotencyKey,
      recipientName: params.recipientName.trim(),
      recipientEmail: params.recipientEmail?.trim() || 'merchant-sandbox@paypal.com',
      merchantCategory: category,
      description: params.description.trim(),
      amountInr,
      amountUsd,
      currency: 'INR',
      status: passedAllHardRules ? 'guardian_approved' : 'guardian_blocked',
      guardianEvaluation: {
        passed: passedAllHardRules,
        requiresPin,
        policyChecks,
        evaluatedAt: new Date(),
      },
    });

    await recordAuditLog({
      userId: params.userId,
      actor: 'financial_guardian',
      action: passedAllHardRules ? 'payment_request_prepared' : 'payment_request_blocked_by_policy',
      resourceType: 'payment_request',
      resourceId: String(paymentReq._id),
      status: passedAllHardRules ? 'success' : 'blocked',
      details: {
        amountInr,
        amountUsd,
        recipientName: params.recipientName,
        passedAllHardRules,
      },
    });

    return paymentReq;
  }

  /**
   * Step 8: Verifies the user's Argon2id PIN and issues a short-lived approval token.
   */
  async verifyPinForPayment(params: {
    userId: string;
    paymentRequestId: string;
    pin: string;
  }): Promise<{
    paymentRequest: IPaymentRequest;
    approvalToken: string;
    expiresAt: string;
  }> {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const paymentReq = await PaymentRequestModel.findOne({
      _id: params.paymentRequestId,
      userId: userObjId,
    });
    if (!paymentReq) {
      throw new Error('Payment request not found.');
    }

    if (!paymentReq.guardianEvaluation.passed || paymentReq.status === 'guardian_blocked') {
      throw new Error('Financial Guardian blocked this payment request due to policy limits.');
    }

    const pinValid = await verifySecretArgon2id(user.pinHash, String(params.pin || ''));
    if (!pinValid) {
      await recordAuditLog({
        userId: params.userId,
        actor: 'user',
        action: 'payment_pin_verification_failed',
        resourceType: 'payment_request',
        resourceId: String(paymentReq._id),
        status: 'blocked',
        details: { reason: 'Invalid Argon2id PIN supplied' },
      });
      throw new Error('Invalid security PIN. Payment authorisation denied.');
    }

    const { token, tokenHash, expiresAt } = issuePaymentApprovalToken({
      userId: params.userId,
      paymentRequestId: String(paymentReq._id),
      amountInr: paymentReq.amountInr,
    });

    paymentReq.status = 'pin_verified';
    paymentReq.pinVerifiedAt = new Date();
    paymentReq.approvalTokenHash = tokenHash;
    paymentReq.approvalTokenExpiresAt = expiresAt;
    await paymentReq.save();

    await recordAuditLog({
      userId: params.userId,
      actor: 'user',
      action: 'payment_pin_verified_approval_token_issued',
      resourceType: 'payment_request',
      resourceId: String(paymentReq._id),
      status: 'success',
      details: {
        amountInr: paymentReq.amountInr,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      paymentRequest: paymentReq,
      approvalToken: token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Step 9: Initiates PayPal Sandbox Order v2 creation after validating the short-lived approval token.
   */
  async createPayPalOrderForApprovedRequest(params: {
    userId: string;
    paymentRequestId: string;
    approvalToken: string;
  }) {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const paymentReq = await PaymentRequestModel.findOne({
      _id: params.paymentRequestId,
      userId: userObjId,
    });
    if (!paymentReq) {
      throw new Error('Payment request not found.');
    }

    if (paymentReq.status !== 'pin_verified' && paymentReq.status !== 'paypal_order_created') {
      throw new Error('PIN verification and explicit user approval are required before creating a PayPal Order.');
    }

    const tokenCheck = verifyPaymentApprovalToken(params.approvalToken, {
      userId: params.userId,
      paymentRequestId: String(paymentReq._id),
      amountInr: paymentReq.amountInr,
      storedHash: paymentReq.approvalTokenHash,
    });

    if (!tokenCheck.valid) {
      await recordAuditLog({
        userId: params.userId,
        actor: 'financial_guardian',
        action: 'paypal_order_creation_blocked_invalid_token',
        resourceType: 'payment_request',
        resourceId: String(paymentReq._id),
        status: 'blocked',
        details: { reason: tokenCheck.reason },
      });
      throw new Error(`Financial Guardian blocked order creation: ${tokenCheck.reason}`);
    }

    const orderResult = await paypalIntegration.createOrder({
      idempotencyKey: paymentReq.idempotencyKey,
      amountUsd: paymentReq.amountUsd,
      amountInr: paymentReq.amountInr,
      description: paymentReq.description,
      recipientName: paymentReq.recipientName,
    });

    paymentReq.paypalOrderId = orderResult.orderId;
    paymentReq.paypalStatus = orderResult.status;
    paymentReq.paypalApprovalUrl = orderResult.approvalUrl;
    paymentReq.status = 'paypal_order_created';
    await paymentReq.save();

    await recordAuditLog({
      userId: params.userId,
      actor: 'user',
      action: 'paypal_sandbox_order_created',
      resourceType: 'payment_request',
      resourceId: String(paymentReq._id),
      status: 'success',
      details: {
        paypalOrderId: orderResult.orderId,
        mode: orderResult.mode,
        apimaticContractValid: orderResult.apimaticValidation.valid,
      },
    });

    return {
      paymentRequest: paymentReq,
      paypalOrder: orderResult,
    };
  }

  /**
   * Step 10-14: Captures the approved PayPal Order, updates MongoDB account & transaction records,
   * synchronises to Elasticsearch, updates Bryntum Calendar, refreshes plans, and triggers Zapier.
   */
  async capturePayPalOrder(params: {
    userId: string;
    paymentRequestId?: string;
    paypalOrderId?: string;
  }) {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const query: Record<string, any> = { userId: userObjId };
    if (params.paymentRequestId) {
      query._id = params.paymentRequestId;
    } else if (params.paypalOrderId) {
      query.paypalOrderId = params.paypalOrderId;
    } else {
      throw new Error('Either paymentRequestId or paypalOrderId is required to capture.');
    }

    const paymentReq = await PaymentRequestModel.findOne(query);
    if (!paymentReq) {
      throw new Error('Payment request not found for capture.');
    }

    // Idempotency guard: if already captured, return existing state without double-charging
    if (
      (paymentReq.status === 'captured' || paymentReq.status === 'webhook_verified') &&
      paymentReq.linkedTransactionId
    ) {
      const existingTx = await TransactionModel.findById(paymentReq.linkedTransactionId);
      return {
        alreadyCaptured: true,
        paymentRequest: paymentReq,
        transaction: existingTx,
      };
    }

    if (!paymentReq.pinVerifiedAt) {
      throw new Error('Financial Guardian violation: Cannot capture an order that has not passed PIN verification.');
    }

    const orderIdToCapture = paymentReq.paypalOrderId || `PAYPAL-SBX-${Date.now()}`;
    const captureResult = await paypalIntegration.captureOrder({
      orderId: orderIdToCapture,
      idempotencyKey: paymentReq.idempotencyKey,
    });

    paymentReq.paypalOrderId = captureResult.orderId;
    paymentReq.paypalCaptureId = captureResult.captureId;
    paymentReq.paypalStatus = captureResult.status;
    paymentReq.status = 'captured';

    // Update Account balance & create Transaction in MongoDB
    const account = paymentReq.accountId
      ? await AccountModel.findOne({ _id: paymentReq.accountId, userId: userObjId })
      : await AccountModel.findOne({ userId: userObjId, status: 'active' }).sort({ balance: -1 });

    if (account) {
      account.balance = Math.max(0, Math.round((account.balance - paymentReq.amountInr) * 100) / 100);
      account.lastSyncedAt = new Date();
      await account.save();
    }

    const transaction = await TransactionModel.create({
      userId: userObjId,
      accountId: account?._id || new mongoose.Types.ObjectId(),
      accountName: account?.name || 'PayPal Linked Checking',
      date: new Date(),
      merchant: paymentReq.recipientName,
      description: `${paymentReq.description} (PayPal Order ${captureResult.orderId})`,
      category: paymentReq.merchantCategory || 'General',
      type: 'expense',
      amount: paymentReq.amountInr,
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'paypal',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['paypal-sandbox', 'verified-capture', paymentReq.merchantCategory.toLowerCase()],
      paypalOrderId: captureResult.orderId,
    });

    paymentReq.linkedTransactionId = transaction._id as mongoose.Types.ObjectId;
    await paymentReq.save();

    // Synchronise transaction to Elasticsearch
    await elasticIntegration.syncTransaction(transaction);

    // Refresh monthly financial plan & summaries
    await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);

    // Synchronise Bryntum calendar if applicable
    await bryntumIntegration.syncUserFinancialCalendar(params.userId);

    // Trigger Zapier Payment Status Automation
    const zapierResult = await zapierIntegration.triggerAutomation({
      userId: params.userId,
      automationType: 'payment_status_notification',
      title: `PayPal Payment Captured: ₹${paymentReq.amountInr.toLocaleString('en-IN')}`,
      message: `Your payment of ₹${paymentReq.amountInr.toLocaleString('en-IN')} ($${paymentReq.amountUsd.toFixed(2)} USD) to ${paymentReq.recipientName} was captured via PayPal Sandbox (Capture ID: ${captureResult.captureId}).`,
      deduplicationKey: `paypal-cap-${captureResult.captureId}`,
      metadata: {
        paypalOrderId: captureResult.orderId,
        paypalCaptureId: captureResult.captureId,
        amountInr: paymentReq.amountInr,
      },
    });

    await recordAuditLog({
      userId: params.userId,
      actor: 'user',
      action: 'paypal_order_captured_and_settled',
      resourceType: 'payment_request',
      resourceId: String(paymentReq._id),
      status: 'success',
      details: {
        paypalOrderId: captureResult.orderId,
        paypalCaptureId: captureResult.captureId,
        transactionId: String(transaction._id),
        amountInr: paymentReq.amountInr,
      },
    });

    return {
      alreadyCaptured: false,
      paymentRequest: paymentReq,
      captureResult,
      transaction,
      zapierNotification: zapierResult,
    };
  }

  /**
   * Verifies and processes an incoming PayPal Webhook event idempotently.
   */
  async handlePayPalWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    webhookEvent: Record<string, any>;
  }) {
    const verification = await paypalIntegration.verifyWebhookSignature(params);
    if (!verification.verified) {
      await recordAuditLog({
        actor: 'paypal_webhook',
        action: 'paypal_webhook_signature_rejected',
        resourceType: 'webhook',
        status: 'blocked',
        details: { errors: verification.apimaticCheck.errors },
      });
      throw new Error('PayPal Webhook signature verification failed.');
    }

    const eventId = String(params.webhookEvent.id || `WH-EVT-${Date.now()}`);
    const eventType = String(params.webhookEvent.event_type || 'PAYMENT.CAPTURE.COMPLETED');
    const resource = params.webhookEvent.resource || {};
    const orderId =
      resource?.supplementary_data?.related_ids?.order_id ||
      resource?.id ||
      params.webhookEvent.paypalOrderId;

    let paymentReq = orderId ? await PaymentRequestModel.findOne({ paypalOrderId: orderId }) : null;
    if (!paymentReq && params.webhookEvent.paymentRequestId) {
      paymentReq = await PaymentRequestModel.findById(params.webhookEvent.paymentRequestId);
    }

    if (paymentReq) {
      paymentReq.webhookVerified = true;
      paymentReq.webhookEventId = eventId;
      if (paymentReq.status === 'captured') {
        paymentReq.status = 'webhook_verified';
      }
      await paymentReq.save();

      await recordAuditLog({
        userId: String(paymentReq.userId),
        actor: 'paypal_webhook',
        action: 'paypal_webhook_verified',
        resourceType: 'payment_request',
        resourceId: String(paymentReq._id),
        status: 'success',
        details: { eventId, eventType, orderId },
      });
    }

    return {
      verified: true,
      eventId,
      eventType,
      orderId,
      paymentRequestUpdated: Boolean(paymentReq),
      paymentRequestStatus: paymentReq?.status || 'no_matching_local_order',
      verificationMode: verification.mode,
    };
  }
}

export const paymentGuardianService = new PaymentGuardianService();
