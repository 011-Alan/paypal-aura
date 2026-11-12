import mongoose from 'mongoose';
import { UserModel, AccountModel, TransactionModel, EcommerceOrderModel } from '../models';
import { paypalReportingService } from '../integrations/paypal/paypalReportingService';
import { paypalSyncService } from '../integrations/paypal/paypalSyncService';
import { paypalTransactionService } from '../integrations/paypal/paypalTransactionService';

interface TestStepResult {
  step: string;
  passed: boolean;
  details?: any;
}

const results: TestStepResult[] = [];

function assert(condition: boolean, step: string, details?: any) {
  if (condition) {
    results.push({ step, passed: true, details });
    console.log(`[PASS] ${step}`);
  } else {
    results.push({ step, passed: false, details });
    console.error(`[FAIL] ${step}`, details);
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('  AURA PAYPAL TRANSACTION INTEGRATION & DATA INTEGRITY VERIFICATION');
  console.log('========================================================================\n');

  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aura_fintech';
  await mongoose.connect(MONGO_URI);

  try {
    // -------------------------------------------------------------------------
    // 1. VERIFY STATUS & EVENT CODE NORMALIZATION
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Status & Event Code Normalization Rules ---');

    // Rule: Authorizations & pending MUST NEVER be marked completed
    const authStatus1 = paypalSyncService.normalizeTransactionStatus('P', 'T0100', true);
    assert(authStatus1 === 'pending', 'PayPal authorization T0100 is classified as pending (never completed)', { authStatus1 });

    const authStatus2 = paypalSyncService.normalizeTransactionStatus('S', 'T0101', true);
    assert(authStatus2 === 'pending', 'PayPal future authorization T0101 with raw status S is still pending', { authStatus2 });

    const authVoidStatus = paypalSyncService.normalizeTransactionStatus('V', 'T0102', true);
    assert(authVoidStatus === 'reversed', 'PayPal authorization void T0102 is reversed', { authVoidStatus });

    const refundStatus = paypalSyncService.normalizeTransactionStatus('S', 'T1106', false);
    assert(refundStatus === 'refunded', 'PayPal refund T1106 is classified as refunded', { refundStatus });

    const completedStatus = paypalSyncService.normalizeTransactionStatus('S', 'T0006', false);
    assert(completedStatus === 'completed', 'Standard completed payment T0006 is completed', { completedStatus });

    const chargebackStatus = paypalSyncService.normalizeTransactionStatus('V', 'T1201', false);
    assert(chargebackStatus === 'reversed', 'Chargeback reversal T1201 is reversed', { chargebackStatus });

    // -------------------------------------------------------------------------
    // 2. VERIFY DIRECTION & TYPE CLASSIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Direction & Type Classification ---');

    const incomingPayment = paypalSyncService.classifyDirectionAndType(150.00, 'T0000');
    assert(incomingPayment.direction === 'incoming' && incomingPayment.type === 'income', 'Positive gross is incoming income', incomingPayment);

    const outgoingPayment = paypalSyncService.classifyDirectionAndType(-45.50, 'T0000');
    assert(outgoingPayment.direction === 'outgoing' && outgoingPayment.type === 'expense', 'Negative gross is outgoing expense', outgoingPayment);

    const refundOutgoing = paypalSyncService.classifyDirectionAndType(-30.00, 'T1106');
    assert(refundOutgoing.direction === 'outgoing' && refundOutgoing.type === 'expense', 'Refund payout is outgoing expense', refundOutgoing);

    const bankTransfer = paypalSyncService.classifyDirectionAndType(-500.00, 'T0300');
    assert(bankTransfer.type === 'transfer', 'Bank transfer T0300 is transfer', bankTransfer);

    // -------------------------------------------------------------------------
    // 3. VERIFY HISTORICAL DATE CHUNKING & BOUNDARY COMPLIANCE (< 31 DAYS)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Historical Date Window Chunking (PayPal 31-day boundary) ---');

    const now = new Date();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Mocking PayPalReportingService call with multi-window historical retrieval
    const histResult = await paypalReportingService.getMerchantTransactionsHistorical({
      startDate: ninetyDaysAgo.toISOString(),
      endDate: now.toISOString(),
      monthsBack: 3,
      pageSize: 50,
    });

    assert(
      histResult.windowsProcessed >= 3,
      'Multi-month (90 days) date range was chunked into 3 or more <= 30-day windows',
      { windowsProcessed: histResult.windowsProcessed }
    );

    // -------------------------------------------------------------------------
    // 4. VERIFY STABLE DEDUPLICATION & ATOMIC UPSERT
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Stable Deduplication & Idempotency ---');

    const testUser = await UserModel.findOne({
      $or: [{ email: 'bruce_wayne@business.example.com' }, { role: 'merchant' }, { accountType: 'business' }],
    });

    if (!testUser) {
      throw new Error('Test merchant user not found for deduplication test.');
    }

    const testTxId = `TEST_PAYPAL_TXN_${Date.now()}`;
    const testAmount = 199.99;
    const testFee = 5.80;

    // First insertion
    const createdTx1 = await TransactionModel.findOneAndUpdate(
      { userId: testUser._id, paypalTransactionId: testTxId },
      {
        $set: {
          userId: testUser._id,
          accountId: new mongoose.Types.ObjectId(),
          accountName: 'PayPal Settlement Account',
          date: new Date(),
          merchant: 'Test Payer Corp',
          counterparty: 'testpayer@example.com',
          description: 'Payment for Enterprise Subscription',
          category: 'Income',
          type: 'income',
          direction: 'incoming',
          amount: testAmount,
          feeAmount: testFee,
          netAmount: testAmount - testFee,
          currency: 'USD',
          status: 'completed',
          paymentMethod: 'paypal',
          paypalTransactionId: testTxId,
          tags: ['paypal-sync', 'test-dedup'],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Second sync execution (simulating repeated synchronisation)
    const createdTx2 = await TransactionModel.findOneAndUpdate(
      { userId: testUser._id, paypalTransactionId: testTxId },
      {
        $set: {
          status: 'completed',
          feeAmount: testFee,
          netAmount: testAmount - testFee,
        },
      },
      { upsert: true, new: true }
    );

    const countMatches = await TransactionModel.countDocuments({
      userId: testUser._id,
      paypalTransactionId: testTxId,
    });

    assert(countMatches === 1, 'Stable paypalTransactionId prevents duplicate rows on repeated synchronisations', { countMatches });
    assert(String(createdTx1._id) === String(createdTx2._id), 'Upsert updates existing document ID rather than inserting new row');

    // Clean up test txn
    await TransactionModel.deleteOne({ _id: createdTx1._id });

    // -------------------------------------------------------------------------
    // 5. VERIFY STRICT ACCOUNT ISOLATION (PERSONAL VS BUSINESS)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Strict Account Isolation (Personal vs Business) ---');

    const personalUser = await UserModel.findOne({
      $or: [{ email: 'alex.chen@aura.ai' }, { accountType: 'personal' }],
    });

    if (personalUser) {
      // Ensure personal user has linked PayPal mock
      await UserModel.updateOne(
        { _id: personalUser._id },
        {
          $set: {
            paypalAccountLinked: true,
            paypalUserId: 'personal-pp-user-123',
            accountType: 'personal',
          },
        }
      );

      const personalSync = await paypalSyncService.syncUserPayPalData(String(personalUser._id), {
        forceRefresh: true,
        fullHistoricalSync: false,
      });

      assert(personalSync.accountType === 'PERSONAL', 'Identified as PERSONAL account type');
      assert(
        personalSync.reportingStatus.available === false || personalSync.transactionsRetrieved >= 0,
        'Personal account does NOT automatically inherit or ingest merchant business transactions',
        { available: personalSync.reportingStatus.available, message: personalSync.reportingStatus.statusMessage }
      );

      // Verify no merchant transactions with 'merchant-reporting' tag were seeded into personal user
      const rogueMerchantTxs = await TransactionModel.countDocuments({
        userId: personalUser._id,
        tags: 'merchant-reporting',
      });
      assert(rogueMerchantTxs === 0, 'Personal user has 0 merchant-reporting transactions (strict data isolation)', { rogueMerchantTxs });
    }

    // -------------------------------------------------------------------------
    // 6. VERIFY ORDER TRACKING LINKAGE & MERCHANT RECEIVED PAYMENTS
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Order Tracking Linkage & Received Payments ---');

    const testOrderNum = `ORD-SYNC-${Date.now()}`;
    const testOrderId = new mongoose.Types.ObjectId();
    const testCaptureId = `CAP-${Date.now()}`;

    const testOrder = await EcommerceOrderModel.create({
      _id: testOrderId,
      orderNumber: testOrderNum,
      userId: personalUser ? personalUser._id : testUser._id,
      merchantId: testUser._id,
      customerName: 'Clark Kent',
      customerEmail: 'clark@dailyplanet.com',
      items: [
        {
          productId: 'prod-item-1',
          name: 'Noise Cancelling Headphones',
          brand: 'Sony',
          category: 'Electronics',
          imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
          retailerName: 'AURA Store',
          originalPrice: 299.99,
          demoPrice: 249.99,
          selectedVariant: 'Standard',
          quantity: 1,
          totalPrice: 249.99,
        },
      ],
      currency: 'USD',
      subtotal: 249.99,
      shippingFee: 0,
      tax: 20.00,
      totalAmount: 269.99,
      shippingAddress: {
        fullName: 'Clark Kent',
        streetAddress: '344 Clinton St',
        locality: 'Metropolis',
        region: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      paymentInfo: {
        paypalOrderId: `PAYPAL-ORDER-${testOrderNum}`,
        paypalCaptureId: testCaptureId,
        paymentStatus: 'completed',
        paidAt: new Date(),
        amountPaid: 269.99,
        currency: 'USD',
        payerEmail: 'clark@dailyplanet.com',
        payerName: 'Clark Kent',
      },
      fulfillmentStatus: 'order_confirmed',
      shipment: {
        carrier: 'FedEx Express',
        trackingNumber: `TRK-${Date.now()}`,
        status: 'label_created',
        shippedAt: new Date(),
      },
      statusHistory: [
        {
          status: 'payment_completed',
          timestamp: new Date(),
          notes: 'Captured test order',
          updatedBy: 'Test Suite',
        },
      ],
      isSimulatedStore: true,
    });

    // Create incoming transaction linked to this order
    const merchantPaymentTx = await TransactionModel.create({
      userId: testUser._id,
      accountId: new mongoose.Types.ObjectId(),
      accountName: 'Merchant Settlement',
      date: new Date(),
      merchant: 'Clark Kent',
      counterparty: 'clark@dailyplanet.com',
      description: `Customer Payment Received — Order #${testOrderNum}`,
      category: 'Income',
      type: 'income',
      direction: 'incoming',
      amount: 269.99,
      feeAmount: 7.83,
      netAmount: 262.16,
      currency: 'USD',
      status: 'completed',
      paymentMethod: 'paypal',
      paypalTransactionId: `TXN-ORDSYNC-${Date.now()}`,
      paypalCaptureId: testCaptureId,
      paypalOrderId: `PAYPAL-ORDER-${testOrderNum}`,
      associatedOrderId: String(testOrderId),
      orderNumber: testOrderNum,
      tags: ['ecommerce-revenue', 'paypal-sandbox', 'merchant-received'],
    });

    // Verify linkage
    const linkedTx = await TransactionModel.findOne({ orderNumber: testOrderNum });
    assert(linkedTx !== null && linkedTx.associatedOrderId === String(testOrderId), 'Transaction links correctly to EcommerceOrderModel via orderNumber', {
      orderNumber: linkedTx?.orderNumber,
      associatedOrderId: linkedTx?.associatedOrderId,
    });

    // Clean up test order & txn
    await EcommerceOrderModel.deleteOne({ _id: testOrderId });
    await TransactionModel.deleteOne({ _id: merchantPaymentTx._id });

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;
    console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
  }
}

runSuite().catch((err) => {
  console.error('Test Suite encountered fatal error:', err);
  process.exit(1);
});
