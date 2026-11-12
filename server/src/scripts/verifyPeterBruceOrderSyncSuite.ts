import mongoose from 'mongoose';
import { UserModel, AccountModel, TransactionModel, EcommerceOrderModel, NotificationModel } from '../models';
import { ecommerceService } from '../services/ecommerce/ecommerceService';
import { paymentGuardianService } from '../services/payments/paymentGuardianService';

interface StepResult {
  step: string;
  passed: boolean;
  details?: any;
}

const results: StepResult[] = [];

function assert(cond: boolean, step: string, details?: any) {
  if (cond) {
    results.push({ step, passed: true, details });
    console.log(`[PASS] ${step}`);
  } else {
    results.push({ step, passed: false, details });
    console.error(`[FAIL] ${step}`, details);
  }
}

async function runEndToEndVerification() {
  console.log('========================================================================');
  console.log('  AURA E-COMMERCE END-TO-END VERIFICATION: PETER (BUYER) -> BRUCE (MERCHANT)');
  console.log('========================================================================\n');

  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aura_fintech';
  await mongoose.connect(MONGO_URI);

  try {
    // -------------------------------------------------------------------------
    // 1. VERIFY ACCOUNTS: PETER (BUYER) & BRUCE (MERCHANT)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Account Discovery & Role Verification ---');

    const peter = await UserModel.findOne({
      $or: [{ email: 'peter@aura-demo.finance' }, { email: 'peter.parker@example.com' }],
    });
    assert(!!peter, 'Peter Parker (Buyer) user exists in database', { email: peter?.email, id: peter?._id });

    const bruce = await UserModel.findOne({ email: 'bruce_wayne@business.example.com' });
    assert(!!bruce, 'Bruce Wayne (Merchant) user exists in database', { email: bruce?.email, id: bruce?._id });
    assert(bruce?.role === 'merchant' || bruce?.auraAccountType === 'BUSINESS', 'Bruce has verified merchant credentials', { role: bruce?.role, auraAccountType: bruce?.auraAccountType });

    // -------------------------------------------------------------------------
    // 2. SIMULATE END-TO-END CHECKOUT & PAYPAL CAPTURE
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Order Creation & PayPal Routing Verification ---');

    const simulatedOrderNumber = `AURA-ORD-VERIFY-${Date.now().toString().slice(-4)}`;
    const simulatedPayPalOrderId = `58P${Date.now().toString().slice(-10)}TEST`;
    const simulatedCaptureId = `93E${Date.now().toString().slice(-10)}CAP`;

    // Create an order simulating Peter purchasing a product
    const createdOrder = await EcommerceOrderModel.create({
      orderNumber: simulatedOrderNumber,
      userId: peter!._id,
      merchantId: bruce!._id,
      merchantEmail: bruce!.email,
      customerName: peter!.name,
      customerEmail: peter!.email,
      items: [
        {
          productId: 'prod-smart-display-01',
          name: 'Quantum 4K QLED Smart TV',
          brand: 'VIZIO',
          category: 'Electronics',
          imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1',
          retailerName: 'BestBuy',
          purchaseUrl: 'https://example.com/item',
          originalPrice: 249.99,
          demoPrice: 208.00,
          selectedVariant: 'Standard',
          quantity: 1,
          totalPrice: 208.00,
        },
      ],
      currency: 'USD',
      subtotal: 208.00,
      shippingFee: 0,
      tax: 0,
      totalAmount: 208.00,
      shippingAddress: {
        fullName: 'Peter Parker',
        streetAddress: '2211 North First Street',
        locality: 'San Jose',
        region: 'CA',
        postalCode: '95131',
        country: 'US',
      },
      paymentInfo: {
        paypalOrderId: simulatedPayPalOrderId,
        paymentStatus: 'pending',
        currency: 'USD',
        amountPaid: 208.00,
        idempotencyKey: `idem-${Date.now()}`,
      },
      fulfillmentStatus: 'payment_completed',
      shipment: {
        isSimulated: true,
        trackingSyncStatus: 'not_synced',
      },
      statusHistory: [
        {
          status: 'payment_completed',
          timestamp: new Date(),
          notes: 'Checkout initiated. Awaiting PayPal Sandbox payment authorization.',
          updatedBy: 'Customer',
        },
      ],
      isSimulatedStore: true,
    });

    assert(!!createdOrder, 'Created pending order for Peter with Bruce as designated merchant', { orderNumber: createdOrder.orderNumber });

    // -------------------------------------------------------------------------
    // 3. CAPTURE SETTLEMENT & IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Verified Capture & Idempotent Ledger Settlement ---');

    // Transition order to confirmed upon payment capture
    createdOrder.paymentInfo.paymentStatus = 'completed';
    createdOrder.paymentInfo.paypalCaptureId = simulatedCaptureId;
    createdOrder.paymentInfo.paidAt = new Date();
    createdOrder.fulfillmentStatus = 'order_confirmed';
    createdOrder.statusHistory.push({
      status: 'order_confirmed',
      timestamp: new Date(),
      notes: `Payment verified and captured via PayPal Sandbox. Capture ID: ${simulatedCaptureId}`,
      updatedBy: 'PayPal System',
    });
    await createdOrder.save();

    // Call settleCompletedOrder
    await ecommerceService.settleCompletedOrder({
      order: createdOrder,
      captureId: simulatedCaptureId,
      payerName: peter!.name,
      actor: 'customer',
    });

    // Verify Bruce received the incoming transaction
    const bruceTx = await TransactionModel.findOne({
      userId: bruce!._id,
      orderNumber: simulatedOrderNumber,
      direction: 'incoming',
    });
    assert(!!bruceTx, 'Bruce received incoming transaction record with correct orderNumber', {
      txId: bruceTx?._id,
      amount: bruceTx?.amount,
      direction: bruceTx?.direction,
      counterparty: bruceTx?.counterparty,
    });
    assert(bruceTx?.amount === 208.00, 'Transaction gross amount matches order total ($208.00)');
    assert(bruceTx?.paypalCaptureId === simulatedCaptureId, 'Transaction stores correct PayPal capture ID');

    // Test Idempotency: re-running settlement should NOT create duplicate transactions
    const txCountBefore = await TransactionModel.countDocuments({
      userId: bruce!._id,
      orderNumber: simulatedOrderNumber,
    });
    await ecommerceService.settleCompletedOrder({
      order: createdOrder,
      captureId: simulatedCaptureId,
      payerName: peter!.name,
      actor: 'customer',
    });
    const txCountAfter = await TransactionModel.countDocuments({
      userId: bruce!._id,
      orderNumber: simulatedOrderNumber,
    });
    assert(txCountBefore === txCountAfter, 'Idempotent execution: duplicate settlement invocation did NOT insert duplicate transactions', { count: txCountAfter });

    // -------------------------------------------------------------------------
    // 4. MERCHANT HUB VISIBILITY FOR BRUCE
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Bruce Merchant Hub Visibility ---');

    const merchantOrders = await ecommerceService.getMerchantOrders({
      merchantUserId: String(bruce!._id),
    });
    const foundInMerchantList = merchantOrders.orders.find((o) => o.orderNumber === simulatedOrderNumber);
    assert(!!foundInMerchantList, 'Simulated Peter order is immediately visible in Bruce Merchant Hub order list', {
      orderNumber: foundInMerchantList?.orderNumber,
      totalAmount: foundInMerchantList?.totalAmount,
      fulfillmentStatus: foundInMerchantList?.fulfillmentStatus,
    });

    const overview = await ecommerceService.getMerchantOverview(String(bruce!._id));
    assert(overview.totalOrders >= 1 && overview.paidOrders >= 1, 'Merchant KPIs reflect incoming paid order', overview);

    // -------------------------------------------------------------------------
    // 5. BRUCE UPDATES FULFILLMENT -> PETER LIVE TRACKING
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Merchant Fulfillment Update -> Buyer Tracking Synchronization ---');

    // Bruce marks order as shipped
    const shippedOrder = await ecommerceService.updateOrderFulfillment({
      orderId: String(createdOrder._id),
      merchantUserId: String(bruce!._id),
      fulfillmentStatus: 'shipped',
      carrier: 'FedEx Express',
      trackingNumber: 'FDX-9988776655',
      notes: 'Dispatched from San Jose fulfillment depot via FedEx Priority.',
      adminName: 'Bruce Wayne (Wayne Enterprises)',
    });

    assert(shippedOrder.fulfillmentStatus === 'shipped', 'Order fulfillment status updated to shipped');
    assert(shippedOrder.shipment.carrier === 'FedEx Express', 'Shipping carrier recorded properly');
    assert(shippedOrder.shipment.trackingNumber === 'FDX-9988776655', 'Tracking number recorded properly');

    // Peter retrieves orders in Customer Order Tracking
    const peterOrders = await ecommerceService.getCustomerOrders(String(peter!._id));
    const peterFoundOrder = peterOrders.find((o) => o.orderNumber === simulatedOrderNumber);
    assert(!!peterFoundOrder, 'Peter views order in customer purchases / tracking', { orderNumber: peterFoundOrder?.orderNumber });
    assert(peterFoundOrder?.fulfillmentStatus === 'shipped', 'Peter sees live updated status "shipped"', { status: peterFoundOrder?.fulfillmentStatus });
    assert(peterFoundOrder?.shipment?.trackingNumber === 'FDX-9988776655', 'Peter sees live carrier tracking number', { tracking: peterFoundOrder?.shipment?.trackingNumber });

    // Verify Notification dispatch to Peter
    const peterNotif = await NotificationModel.findOne({
      userId: peter!._id,
      'metadata.orderNumber': simulatedOrderNumber,
      'metadata.fulfillmentStatus': 'shipped',
    });
    assert(!!peterNotif, 'Peter received notification for order status update to shipped', { title: peterNotif?.title, message: peterNotif?.message });

    // Clean up temporary simulation record
    await EcommerceOrderModel.deleteOne({ _id: createdOrder._id });
    await TransactionModel.deleteMany({ orderNumber: simulatedOrderNumber });
    await NotificationModel.deleteMany({ 'metadata.orderNumber': simulatedOrderNumber });
    console.log('\n[INFO] Cleaned up temporary test order artifacts.');

    // -------------------------------------------------------------------------
    // 6. SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
  }
}

runEndToEndVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
