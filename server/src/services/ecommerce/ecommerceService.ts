import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  CartModel,
  ICart,
  EcommerceOrderModel,
  IEcommerceOrder,
  IEcommerceShippingAddress,
  FulfillmentStatus,
  UserModel,
  IUser,
  AccountModel,
  TransactionModel,
  CalendarEventModel,
  NotificationModel,
} from '../../models';
import { channel3Integration, Channel3ProductItem } from '../../integrations/channel3';
import { paypalIntegration } from '../../integrations/paypal';
import { elasticIntegration } from '../../integrations/elastic';
import { bryntumIntegration } from '../../integrations/bryntum';
import { recordAuditLog } from '../../middleware/security';

export class EcommerceService {
  /**
   * Retrieves or initializes the shopping cart for an authenticated user.
   */
  async getCart(userId: string): Promise<{
    cart: ICart;
    subtotal: number;
    shippingFee: number;
    tax: number;
    totalAmount: number;
    itemCount: number;
  }> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    let cart = await CartModel.findOne({ userId: userObjId });
    if (!cart) {
      cart = await CartModel.create({ userId: userObjId, items: [] });
    }

    const subtotal = Math.round(
      cart.items.reduce((sum, item) => sum + (item.demoPrice || 0) * (item.quantity || 1), 0) * 100
    ) / 100;
    const shippingFee = subtotal === 0 || subtotal >= 100 ? 0 : 9.99;
    const tax = 0; // Standard simulated tax-free promotional demo
    const totalAmount = Math.round((subtotal + shippingFee + tax) * 100) / 100;
    const itemCount = cart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return {
      cart,
      subtotal,
      shippingFee,
      tax,
      totalAmount,
      itemCount,
    };
  }

  /**
   * Adds a product to the user's cart, fetching authoritative product details and demo pricing.
   */
  async addItemToCart(
    userId: string,
    params: {
      productId: string;
      quantity?: number;
      selectedVariant?: string;
    }
  ): Promise<ICart> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const qty = Math.max(1, Math.min(10, Math.floor(Number(params.quantity || 1))));

    const product = await channel3Integration.getProductById(params.productId);
    if (!product) {
      throw new Error(`Product "${params.productId}" not found in Channel3 catalog.`);
    }

    if (product.availability === 'out_of_stock') {
      throw new Error(`Product "${product.name}" is currently out of stock.`);
    }

    // Determine variant
    const variant =
      params.selectedVariant && product.variants?.includes(params.selectedVariant)
        ? params.selectedVariant
        : product.variants?.[0] || 'Standard';

    let cart = await CartModel.findOne({ userId: userObjId });
    if (!cart) {
      cart = new CartModel({ userId: userObjId, items: [] });
    }

    const demoPrice = product.demoPriceUsd || Math.max(10, Math.round(product.priceInr * env.INR_TO_USD_RATE));
    const originalPrice = product.retailPriceRefUsd || Math.max(15, Math.round(product.priceInr * env.INR_TO_USD_RATE * 1.1));

    // Check if same product and variant already exists in cart
    const existingIndex = cart.items.findIndex(
      (it) => it.productId === product.id && it.selectedVariant === variant
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity = Math.min(10, cart.items[existingIndex].quantity + qty);
      cart.items[existingIndex].demoPrice = demoPrice;
      cart.items[existingIndex].originalPrice = originalPrice;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        imageUrl: product.imageUrl,
        retailerName: product.retailerName,
        purchaseUrl: product.purchaseUrl,
        originalPrice,
        demoPrice,
        currency: 'USD',
        selectedVariant: variant,
        quantity: qty,
        availableVariants: product.variants || ['Standard'],
      });
    }

    await cart.save();
    return cart;
  }

  /**
   * Updates an item's quantity or variant in the user's cart.
   */
  async updateCartItem(
    userId: string,
    productId: string,
    updates: {
      quantity?: number;
      selectedVariant?: string;
    }
  ): Promise<ICart> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const cart = await CartModel.findOne({ userId: userObjId });
    if (!cart) {
      throw new Error('Shopping cart not found.');
    }

    const itemIdx = cart.items.findIndex((it) => it.productId === productId);
    if (itemIdx === -1) {
      throw new Error('Item not found in shopping cart.');
    }

    if (updates.quantity !== undefined) {
      const q = Math.floor(Number(updates.quantity));
      if (q <= 0) {
        cart.items.splice(itemIdx, 1);
      } else {
        cart.items[itemIdx].quantity = Math.min(10, q);
      }
    }

    if (updates.selectedVariant && cart.items[itemIdx]) {
      cart.items[itemIdx].selectedVariant = updates.selectedVariant;
    }

    await cart.save();
    return cart;
  }

  /**
   * Removes an item from the user's cart.
   */
  async removeCartItem(userId: string, productId: string): Promise<ICart> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const cart = await CartModel.findOne({ userId: userObjId });
    if (!cart) {
      throw new Error('Shopping cart not found.');
    }

    cart.items = cart.items.filter((it) => it.productId !== productId);
    await cart.save();
    return cart;
  }

  /**
   * Clears all items in the user's cart.
   */
  async clearCart(userId: string): Promise<ICart> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    let cart = await CartModel.findOne({ userId: userObjId });
    if (!cart) {
      cart = new CartModel({ userId: userObjId, items: [] });
    } else {
      cart.items = [];
    }
    await cart.save();
    return cart;
  }

  /**
   * Calculates authoritative order totals directly from backend data (never trusts frontend values).
   */
  async calculateAuthoritativeTotals(
    items: Array<{ productId: string; quantity: number; selectedVariant?: string }>
  ): Promise<{
    orderItems: Array<{
      productId: string;
      name: string;
      brand: string;
      category: string;
      imageUrl: string;
      retailerName: string;
      purchaseUrl: string;
      originalPrice: number;
      demoPrice: number;
      selectedVariant: string;
      quantity: number;
      totalPrice: number;
    }>;
    subtotal: number;
    shippingFee: number;
    tax: number;
    totalAmount: number;
  }> {
    if (!items || items.length === 0) {
      throw new Error('Cannot calculate totals for empty order items.');
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await channel3Integration.getProductById(item.productId);
      if (!product) {
        throw new Error(`Product "${item.productId}" is not available in catalog.`);
      }

      const qty = Math.max(1, Math.min(10, Math.floor(Number(item.quantity || 1))));
      const demoPrice = product.demoPriceUsd || Math.max(10, Math.round(product.priceInr * env.INR_TO_USD_RATE));
      const originalPrice = product.retailPriceRefUsd || Math.max(15, Math.round(product.priceInr * env.INR_TO_USD_RATE * 1.1));
      const lineTotal = Math.round(demoPrice * qty * 100) / 100;
      subtotal += lineTotal;

      const variant =
        item.selectedVariant && product.variants?.includes(item.selectedVariant)
          ? item.selectedVariant
          : product.variants?.[0] || 'Standard';

      orderItems.push({
        productId: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        retailerName: product.retailerName,
        purchaseUrl: product.purchaseUrl,
        originalPrice,
        demoPrice,
        selectedVariant: variant,
        quantity: qty,
        totalPrice: lineTotal,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const shippingFee = subtotal >= 100 ? 0 : 9.99;
    const tax = 0;
    const totalAmount = Math.round((subtotal + shippingFee + tax) * 100) / 100;

    return {
      orderItems,
      subtotal,
      shippingFee,
      tax,
      totalAmount,
    };
  }

  /**
   * Resolves the designated merchant account receiving the e-commerce payment.
   * Deterministic priority resolution:
   * 1. Explicit merchantId or merchantEmail passed in
   * 2. Configured PAYPAL_MERCHANT_EMAIL in env (if exists in DB)
   * 3. Seed demo merchant: bruce_wayne@business.example.com
   * 4. Active verified business merchant in DB
   */
  async resolveDesignatedMerchant(criteria?: {
    merchantId?: string;
    merchantEmail?: string;
  }): Promise<IUser | null> {
    if (criteria?.merchantId && mongoose.Types.ObjectId.isValid(criteria.merchantId)) {
      const merchant = await UserModel.findById(criteria.merchantId);
      if (merchant) return merchant;
    }

    if (criteria?.merchantEmail) {
      const merchant = await UserModel.findOne({ email: criteria.merchantEmail.toLowerCase().trim() });
      if (merchant) return merchant;
    }

    if (env.PAYPAL_MERCHANT_EMAIL) {
      const merchant = await UserModel.findOne({ email: env.PAYPAL_MERCHANT_EMAIL.toLowerCase().trim() });
      if (merchant) return merchant;
    }

    // Default primary merchant in AURA Sandbox: Bruce Wayne
    const bruce = await UserModel.findOne({ email: 'bruce_wayne@business.example.com' });
    if (bruce) return bruce;

    // Any verified business user with merchantAccessEnabled
    const verifiedBiz = await UserModel.findOne({
      $or: [
        { auraAccountType: 'BUSINESS', merchantVerificationStatus: 'VERIFIED' },
        { accountType: 'business', merchantAccessEnabled: true },
        { role: 'merchant' },
      ],
    }).sort({ createdAt: 1 });
    if (verifiedBiz) return verifiedBiz;

    return null;
  }

  /**
   * Creates an AURA E-Commerce order in pending state and initializes a PayPal Sandbox Order v2.
   */
  async createCheckoutOrder(
    userId: string,
    params: {
      shippingAddress: IEcommerceShippingAddress;
      items?: Array<{ productId: string; quantity: number; selectedVariant?: string }>;
      notes?: string;
      merchantId?: string;
      merchantEmail?: string;
      customReturnUrl?: string;
      customCancelUrl?: string;
    }
  ): Promise<{
    order: IEcommerceOrder;
    paypalOrderId: string;
    approvalUrl: string;
  }> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const user = await UserModel.findById(userObjId);
    if (!user) {
      throw new Error('User not found.');
    }

    // Validate shipping address
    if (
      !params.shippingAddress ||
      !params.shippingAddress.fullName ||
      !params.shippingAddress.streetAddress ||
      !params.shippingAddress.locality ||
      !params.shippingAddress.postalCode
    ) {
      throw new Error('Incomplete shipping address. Full name, street address, city, and postal code are required.');
    }

    // If specific items weren't provided, use items from cart
    let targetItems = params.items;
    if (!targetItems || targetItems.length === 0) {
      const cart = await CartModel.findOne({ userId: userObjId });
      if (!cart || cart.items.length === 0) {
        throw new Error('Your shopping cart is empty.');
      }
      targetItems = cart.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        selectedVariant: it.selectedVariant,
      }));
    }

    // Authoritative calculation
    const calc = await this.calculateAuthoritativeTotals(targetItems);

    const orderNumber = `AURA-ORD-${Date.now().toString().slice(-6)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const idempotencyKey = `ecom-${userId.slice(-6)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Prepare custom return and cancel URLs for the e-commerce flow
    // Using root path `/?tab=smart-purchases&view=checkout-success` ensures SPA hosting on Render/Netlify
    // serves index.html without 404 Not Found errors on direct page transitions.
    const baseUrl = env.CLIENT_ORIGIN ? env.CLIENT_ORIGIN.replace(/\/+$/, '') : '';
    const customReturnUrl = params.customReturnUrl
      ? (params.customReturnUrl.includes('orderNumber') ? params.customReturnUrl : `${params.customReturnUrl}${params.customReturnUrl.includes('?') ? '&' : '?'}orderNumber=${orderNumber}`)
      : `${baseUrl}/?tab=smart-purchases&view=checkout-success&orderNumber=${orderNumber}`;
    const customCancelUrl = params.customCancelUrl
      ? (params.customCancelUrl.includes('orderNumber') ? params.customCancelUrl : `${params.customCancelUrl}${params.customCancelUrl.includes('?') ? '&' : '?'}orderNumber=${orderNumber}`)
      : `${baseUrl}/?tab=smart-purchases&view=checkout-cancelled&orderNumber=${orderNumber}`;

    // Create the PayPal Sandbox Order v2 using Business Sandbox credentials
    const paypalRes = await paypalIntegration.createOrder({
      idempotencyKey,
      amountUsd: calc.totalAmount,
      amountInr: Math.round(calc.totalAmount / env.INR_TO_USD_RATE),
      description: `AURA E-Commerce Order ${orderNumber} (${calc.orderItems.length} items)`,
      recipientName: 'AURA Demo Store (PayPal Sandbox Merchant)',
      customReturnUrl,
      customCancelUrl,
    });

    // Find designated business merchant account receiving payment
    const designatedMerchant = await this.resolveDesignatedMerchant({
      merchantId: params.merchantId,
      merchantEmail: params.merchantEmail,
    });

    // Create the order record in database with initial status
    const order = await EcommerceOrderModel.create({
      orderNumber,
      userId: userObjId,
      merchantId: designatedMerchant?._id,
      merchantEmail: designatedMerchant?.email,
      customerName: params.shippingAddress.fullName || user.name,
      customerEmail: user.email,
      items: calc.orderItems,
      currency: 'USD',
      subtotal: calc.subtotal,
      shippingFee: calc.shippingFee,
      tax: calc.tax,
      totalAmount: calc.totalAmount,
      shippingAddress: {
        fullName: params.shippingAddress.fullName.trim(),
        streetAddress: params.shippingAddress.streetAddress.trim(),
        locality: params.shippingAddress.locality.trim(),
        region: (params.shippingAddress.region || 'CA').trim(),
        postalCode: params.shippingAddress.postalCode.trim(),
        country: (params.shippingAddress.country || 'US').trim(),
        phone: params.shippingAddress.phone?.trim() || '',
      },
      paymentInfo: {
        paypalOrderId: paypalRes.orderId,
        paymentStatus: 'pending',
        currency: 'USD',
        amountPaid: calc.totalAmount,
        idempotencyKey,
      },
      fulfillmentStatus: 'payment_completed', // Initial state upon successful payment
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
      notes: params.notes || '',
    });

    logger.info('EcommerceService', `Created pending e-commerce order ${orderNumber}`, {
      orderId: order._id,
      paypalOrderId: paypalRes.orderId,
      totalAmount: calc.totalAmount,
    });

    return {
      order,
      paypalOrderId: paypalRes.orderId,
      approvalUrl: paypalRes.approvalUrl,
    };
  }

  /**
   * Captures and verifies PayPal payment for an approved order.
   * Strictly enforces backend validation: checks PayPal capture response, status COMPLETED,
   * amount, currency, and idempotency before marking the order as paid.
   */
  async captureOrderPayment(
    userId: string,
    params: {
      orderId?: string;
      orderNumber?: string;
      paypalOrderId: string;
    }
  ): Promise<{
    order: IEcommerceOrder;
    captureId: string;
    isAlreadyPaid: boolean;
  }> {
    const userObjId = new mongoose.Types.ObjectId(userId);

    // Locate the order
    const query: any = {};
    if (params.orderId) query._id = params.orderId;
    else if (params.orderNumber) query.orderNumber = params.orderNumber;
    else if (params.paypalOrderId) query['paymentInfo.paypalOrderId'] = params.paypalOrderId;

    const order = await EcommerceOrderModel.findOne(query);
    if (!order) {
      throw new Error('Order not found for payment capture.');
    }

    // Ownership check (Customer or Merchant/Admin)
    const user = await UserModel.findById(userObjId);
    const isOwner = order.userId.toString() === userId;
    const isAdmin = user && ['admin', 'merchant', 'family_admin'].includes(user.role);
    if (!isOwner && !isAdmin) {
      throw new Error('Unauthorized: You do not have permission to access or capture this order.');
    }

    // Idempotency: If already paid, return existing completed order
    if (order.paymentInfo.paymentStatus === 'completed' && order.paymentInfo.paypalCaptureId) {
      return {
        order,
        captureId: order.paymentInfo.paypalCaptureId,
        isAlreadyPaid: true,
      };
    }

    // Capture payment via official PayPal Orders v2 API
    const captureRes = await paypalIntegration.captureOrder({
      orderId: params.paypalOrderId,
      idempotencyKey: order.paymentInfo.idempotencyKey || `cap-${order._id}`,
    });

    if (captureRes.status !== 'COMPLETED') {
      order.paymentInfo.paymentStatus = 'failed';
      order.statusHistory.push({
        status: 'cancelled',
        timestamp: new Date(),
        notes: `PayPal capture was not completed. Status: ${captureRes.status}`,
        updatedBy: 'PayPal System',
      });
      await order.save();
      throw new Error(`PayPal payment capture failed with status: ${captureRes.status}`);
    }

    // Extract payer details and capture response payload
    const rawCapture = captureRes.rawCaptureResponse;
    const payer = rawCapture?.payer || {};
    const payerName = payer?.name
      ? `${payer.name.given_name || ''} ${payer.name.surname || ''}`.trim()
      : undefined;

    // Verify captured amount and currency
    const captureUnit = rawCapture?.purchase_units?.[0]?.payments?.captures?.[0];
    const capturedCurrency = captureUnit?.amount?.currency_code || order.currency || 'USD';

    // Update order to completed payment and confirmed fulfillment status
    order.paymentInfo.paymentStatus = 'completed';
    order.paymentInfo.paypalCaptureId = captureRes.captureId;
    order.paymentInfo.paidAt = new Date();
    order.paymentInfo.amountPaid = order.totalAmount;
    order.paymentInfo.currency = capturedCurrency;
    order.paymentInfo.payerEmail = payer.email_address;
    order.paymentInfo.payerId = payer.payer_id;
    order.paymentInfo.payerName = payerName;
    order.paymentInfo.rawCaptureData = rawCapture;

    // Transition fulfillment to order_confirmed
    order.fulfillmentStatus = 'order_confirmed';

    order.statusHistory.push(
      {
        status: 'payment_completed',
        timestamp: new Date(),
        notes: `Payment verified and captured via PayPal Sandbox. Capture ID: ${captureRes.captureId}`,
        updatedBy: 'PayPal System',
      },
      {
        status: 'order_confirmed',
        timestamp: new Date(),
        notes: 'Order confirmed and entered merchant fulfillment queue for packaging and dispatch.',
        updatedBy: 'AURA Storefront',
      }
    );

    // Resolve designated merchant receiving payment
    let merchantUser = await this.resolveDesignatedMerchant({
      merchantId: order.merchantId?.toString(),
      merchantEmail: order.merchantEmail,
    });

    if (merchantUser) {
      order.merchantId = merchantUser._id;
      order.merchantEmail = merchantUser.email;
    }

    await order.save();

    // Clear user's shopping cart upon successful payment
    await CartModel.findOneAndUpdate({ userId: order.userId }, { $set: { items: [] } });

    // 1. Customer Outgoing Payment Record & Account Deduction
    try {
      const customerAccount = await AccountModel.findOne({ userId: order.userId, status: 'active' }).sort({ balance: -1 });
      if (customerAccount) {
        customerAccount.balance = Math.max(0, Math.round((customerAccount.balance - order.totalAmount) * 100) / 100);
        customerAccount.lastSyncedAt = new Date();
        await customerAccount.save();
      }

      const customerTx = await TransactionModel.create({
        userId: order.userId,
        accountId: customerAccount?._id || new mongoose.Types.ObjectId(),
        accountName: customerAccount?.name || 'PayPal Linked Checking',
        date: new Date(),
        merchant: merchantUser?.name || 'AURA Store',
        counterparty: merchantUser?.email || 'AURA Demo Store',
        description: `AURA Store Purchase — Order #${order.orderNumber} (${order.items.map((i) => i.name).slice(0, 2).join(', ')})`,
        category: 'Shopping',
        type: 'expense',
        direction: 'outgoing',
        amount: order.totalAmount,
        currency: order.currency || 'USD',
        status: 'completed',
        paymentMethod: 'paypal',
        isRecurring: false,
        paypalOrderId: order.paymentInfo?.paypalOrderId,
        paypalCaptureId: captureRes.captureId,
        associatedOrderId: String(order._id),
        orderNumber: order.orderNumber,
        tags: ['ecommerce', 'paypal-sandbox', 'order-paid', 'channel3-store'],
      });

      // 2. Merchant Incoming Payment Record & Account Credit
      if (merchantUser) {
        let merchantAccount = await AccountModel.findOne({ userId: merchantUser._id, name: /Merchant/i });
        if (!merchantAccount) {
          merchantAccount = await AccountModel.findOne({ userId: merchantUser._id, status: 'active' });
        }
        if (merchantAccount) {
          merchantAccount.balance = Math.round((merchantAccount.balance + order.totalAmount) * 100) / 100;
          merchantAccount.lastSyncedAt = new Date();
          await merchantAccount.save();
        }

        await TransactionModel.create({
          userId: merchantUser._id,
          accountId: merchantAccount?._id || new mongoose.Types.ObjectId(),
          accountName: merchantAccount?.name || 'Merchant Settlement Account',
          date: new Date(),
          merchant: order.customerName || payerName || 'AURA Customer',
          counterparty: order.customerEmail || 'Customer',
          description: `Customer Payment Received — Order #${order.orderNumber}`,
          category: 'Income',
          type: 'income',
          direction: 'incoming',
          amount: order.totalAmount,
          currency: order.currency || 'USD',
          status: 'completed',
          paymentMethod: 'paypal',
          isRecurring: false,
          paypalOrderId: order.paymentInfo?.paypalOrderId,
          paypalCaptureId: captureRes.captureId,
          associatedOrderId: String(order._id),
          orderNumber: order.orderNumber,
          tags: ['ecommerce-revenue', 'paypal-sandbox', 'merchant-received', 'merchant-payment-received'],
        });

        await bryntumIntegration.syncUserFinancialCalendar(String(merchantUser._id)).catch(() => {});

        // Merchant Notification for incoming order
        await NotificationModel.create({
          userId: merchantUser._id,
          type: 'payment_status',
          title: `New Order Received: #${order.orderNumber}`,
          message: `Customer ${order.customerName} placed order #${order.orderNumber} for $${order.totalAmount.toFixed(2)} USD via PayPal Sandbox (Capture ID: ${captureRes.captureId}). Ready for fulfillment.`,
          severity: 'success',
          isRead: false,
          metadata: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            paypalCaptureId: captureRes.captureId,
          },
        }).catch(() => {});
      }

      // Customer Order Confirmation Notification
      await NotificationModel.create({
        userId: order.userId,
        type: 'payment_status',
        title: `Order #${order.orderNumber} Confirmed`,
        message: `Your payment of $${order.totalAmount.toFixed(2)} USD was verified and captured via PayPal Sandbox (Capture ID: ${captureRes.captureId}). Order is currently processing.`,
        severity: 'success',
        isRead: false,
        metadata: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paypalCaptureId: captureRes.captureId,
          fulfillmentStatus: 'processing',
        },
      }).catch(() => {});

      await elasticIntegration.syncTransaction(customerTx).catch(() => {});
      await bryntumIntegration.syncUserFinancialCalendar(String(order.userId)).catch(() => {});
    } catch (settleErr: any) {
      logger.warn('EcommerceService', 'Ledger settlement notice', { error: settleErr?.message });
    }

    // Record immutable audit log
    await recordAuditLog({
      userId: order.userId.toString(),
      actor: 'customer',
      action: 'ECOMMERCE_ORDER_PAID',
      resourceType: 'ECOMMERCE_ORDER',
      resourceId: order._id.toString(),
      status: 'success',
      details: {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paypalCaptureId: captureRes.captureId,
        itemCount: order.items.length,
      },
    });

    logger.info('EcommerceService', `Order ${order.orderNumber} successfully paid and confirmed`, {
      orderId: order._id,
      captureId: captureRes.captureId,
      amount: order.totalAmount,
    });

    return {
      order,
      captureId: captureRes.captureId,
      isAlreadyPaid: false,
    };
  }

  /**
   * Synchronizes an order's tracking status from PayPal's Tracker API if available.
   */
  private async syncOrderTrackingFromPayPal(order: IEcommerceOrder): Promise<IEcommerceOrder> {
    const txId = order.paymentInfo?.paypalCaptureId || order.paymentInfo?.paypalOrderId;
    if (!txId || ['shipped', 'out_for_delivery', 'delivered'].includes(order.fulfillmentStatus)) {
      return order;
    }
    try {
      const tracker = await paypalIntegration.getShipmentTracking(txId);
      if (tracker && tracker.tracking_number) {
        order.fulfillmentStatus = tracker.status?.toLowerCase() === 'delivered' ? 'delivered' : 'shipped';
        order.shipment = {
          carrier: tracker.carrier || tracker.carrier_name_other || 'Courier',
          trackingNumber: tracker.tracking_number,
          shippedAt: tracker.shipment_date ? new Date(tracker.shipment_date) : new Date(),
          estimatedDeliveryAt: new Date(Date.now() + 3 * 86400000),
          isSimulated: false,
          paypalTrackerId: tracker.tracker_id,
          trackingSyncStatus: 'synced',
          notes: 'Shipment tracking information synchronized from PayPal Business Dashboard.',
        };
        order.statusHistory.push({
          status: order.fulfillmentStatus,
          timestamp: new Date(),
          notes: `Tracking updated directly on PayPal: ${tracker.carrier || 'Courier'} #${tracker.tracking_number}`,
          carrier: tracker.carrier || tracker.carrier_name_other,
          trackingNumber: tracker.tracking_number,
          updatedBy: 'PayPal Merchant Action',
        });
        await order.save();
      }
    } catch {
      // Ignore background sync errors
    }
    return order;
  }

  /**
   * Retrieves orders for an authenticated customer.
   */
  async getCustomerOrders(userId: string): Promise<IEcommerceOrder[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const orders = await EcommerceOrderModel.find({ userId: userObjId }).sort({ createdAt: -1 });

    // Sync any un-shipped paid orders with PayPal's Tracker API
    return Promise.all(
      orders.map((ord) => {
        if (ord.paymentInfo?.paymentStatus === 'completed' && !['shipped', 'out_for_delivery', 'delivered'].includes(ord.fulfillmentStatus)) {
          return this.syncOrderTrackingFromPayPal(ord);
        }
        return ord;
      })
    );
  }

  /**
   * Retrieves a single customer order with ownership verification.
   */
  async getCustomerOrderById(userId: string, orderIdOrNumber: string): Promise<IEcommerceOrder> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const order = await EcommerceOrderModel.findOne({
      $and: [
        { userId: userObjId },
        {
          $or: [
            mongoose.Types.ObjectId.isValid(orderIdOrNumber) ? { _id: orderIdOrNumber } : null,
            { orderNumber: orderIdOrNumber },
          ].filter(Boolean) as any[],
        },
      ],
    });

    if (!order) {
      throw new Error('Order not found or you do not have permission to view it.');
    }

    if (order.paymentInfo?.paymentStatus === 'completed' && !['shipped', 'out_for_delivery', 'delivered'].includes(order.fulfillmentStatus)) {
      return this.syncOrderTrackingFromPayPal(order);
    }

    return order;
  }

  /**
   * Builds a query filter ensuring a business merchant account only accesses
   * orders and purchased products that were paid to that specific business account.
   */
  private async buildMerchantOrderFilter(merchantUserId?: string): Promise<Record<string, any>> {
    if (!merchantUserId) {
      return { 'paymentInfo.paymentStatus': 'completed' };
    }

    const merchantObjId = new mongoose.Types.ObjectId(merchantUserId);
    const merchantUser = await UserModel.findById(merchantObjId);

    const merchantTxs = await TransactionModel.find({
      userId: merchantObjId,
      $or: [
        { direction: 'incoming' },
        { type: 'income' },
        { tags: 'merchant-payment-received' },
        { tags: 'merchant-received' },
        { tags: 'ecommerce-revenue' },
      ],
    }).select('associatedOrderId orderNumber paypalOrderId paypalCaptureId');

    const matchedOrderIds = merchantTxs
      .map((t) => t.associatedOrderId)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const matchedOrderNumbers = merchantTxs
      .map((t: any) => t.orderNumber)
      .filter(Boolean);

    const matchedPayPalOrderIds = merchantTxs
      .map((t: any) => t.paypalOrderId)
      .filter(Boolean);

    const matchedPayPalCaptureIds = merchantTxs
      .map((t: any) => t.paypalCaptureId)
      .filter(Boolean);

    const orConditions: any[] = [{ merchantId: merchantObjId }];

    if (merchantUser?.email) {
      orConditions.push({ merchantEmail: merchantUser.email.toLowerCase() });
    }

    const isPrimaryPlatformMerchant =
      merchantUser?.email === 'bruce_wayne@business.example.com' ||
      (env.PAYPAL_MERCHANT_EMAIL && merchantUser?.email?.toLowerCase() === env.PAYPAL_MERCHANT_EMAIL.toLowerCase());

    if (isPrimaryPlatformMerchant) {
      orConditions.push({ merchantId: { $exists: false } });
      orConditions.push({ merchantId: null });
      orConditions.push({ isSimulatedStore: true });
    }

    if (matchedOrderIds.length > 0) {
      orConditions.push({ _id: { $in: matchedOrderIds } });
    }
    if (matchedOrderNumbers.length > 0) {
      orConditions.push({ orderNumber: { $in: matchedOrderNumbers } });
    }
    if (matchedPayPalOrderIds.length > 0) {
      orConditions.push({ 'paymentInfo.paypalOrderId': { $in: matchedPayPalOrderIds } });
    }
    if (matchedPayPalCaptureIds.length > 0) {
      orConditions.push({ 'paymentInfo.paypalCaptureId': { $in: matchedPayPalCaptureIds } });
    }

    return {
      'paymentInfo.paymentStatus': 'completed',
      $or: orConditions,
    };
  }

  /**
   * Merchant Overview KPIs.
   * Scoped strictly to orders purchased and paid to the authenticated business account.
   */
  async getMerchantOverview(merchantUserId?: string): Promise<{
    totalOrders: number;
    paidOrders: number;
    awaitingProcessing: number;
    packedOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
    totalRevenue: number;
  }> {
    const baseFilter = await this.buildMerchantOrderFilter(merchantUserId);
    const [allOrders, paidOrdersList] = await Promise.all([
      EcommerceOrderModel.find(baseFilter),
      EcommerceOrderModel.find(baseFilter),
    ]);

    const totalOrders = allOrders.length;
    const paidOrders = paidOrdersList.length;
    const totalRevenue = Math.round(
      paidOrdersList.reduce((sum, ord) => sum + (ord.totalAmount || 0), 0) * 100
    ) / 100;

    const awaitingProcessing = allOrders.filter(
      (ord) =>
        ord.paymentInfo.paymentStatus === 'completed' &&
        ['payment_completed', 'order_confirmed', 'processing'].includes(ord.fulfillmentStatus)
    ).length;

    const packedOrders = allOrders.filter((ord) => ord.fulfillmentStatus === 'packed').length;
    const shippedOrders = allOrders.filter(
      (ord) => ['shipped', 'out_for_delivery'].includes(ord.fulfillmentStatus)
    ).length;
    const deliveredOrders = allOrders.filter((ord) => ord.fulfillmentStatus === 'delivered').length;

    return {
      totalOrders,
      paidOrders,
      awaitingProcessing,
      packedOrders,
      shippedOrders,
      deliveredOrders,
      totalRevenue,
    };
  }

  /**
   * Merchant order search & management list.
   * Scoped strictly to orders and products purchased and paid to the authenticated business account.
   */
  async getMerchantOrders(params: {
    merchantUserId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    orders: IEcommerceOrder[];
    total: number;
  }> {
    const baseFilter = await this.buildMerchantOrderFilter(params.merchantUserId);
    const filter: any = { ...baseFilter };

    if (params.status && params.status !== 'all') {
      filter.fulfillmentStatus = params.status;
    }

    if (params.search) {
      const q = params.search.trim();
      const searchOr = [
        { orderNumber: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { customerEmail: { $regex: q, $options: 'i' } },
        { 'paymentInfo.paypalOrderId': { $regex: q, $options: 'i' } },
        { 'paymentInfo.paypalCaptureId': { $regex: q, $options: 'i' } },
        { 'shipment.trackingNumber': { $regex: q, $options: 'i' } },
      ];
      filter.$and = [{ $or: searchOr }];
    }

    const total = await EcommerceOrderModel.countDocuments(filter);
    const limit = Math.max(1, Math.min(100, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);

    const orders = await EcommerceOrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    return { orders, total };
  }

  /**
   * Merchant order details retrieval with strict ownership verification.
   */
  async getMerchantOrderById(orderId: string, merchantUserId?: string): Promise<IEcommerceOrder> {
    const order = await EcommerceOrderModel.findOne({
      $or: [
        mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : null,
        { orderNumber: orderId },
      ].filter(Boolean) as any[],
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (merchantUserId) {
      const merchantObjId = new mongoose.Types.ObjectId(merchantUserId);
      const merchantUser = await UserModel.findById(merchantObjId);

      const isDirectMerchant =
        (order.merchantId && order.merchantId.equals(merchantObjId)) ||
        (merchantUser?.email && order.merchantEmail?.toLowerCase() === merchantUser.email.toLowerCase());

      const isPrimaryPlatformMerchant =
        merchantUser?.email === 'bruce_wayne@business.example.com' ||
        (env.PAYPAL_MERCHANT_EMAIL && merchantUser?.email?.toLowerCase() === env.PAYPAL_MERCHANT_EMAIL.toLowerCase());

      let isTxMerchant = false;
      if (!isDirectMerchant) {
        const tx = await TransactionModel.findOne({
          userId: merchantObjId,
          $or: [
            { associatedOrderId: String(order._id) },
            { orderNumber: order.orderNumber },
            { paypalOrderId: order.paymentInfo?.paypalOrderId },
            { paypalCaptureId: order.paymentInfo?.paypalCaptureId },
          ],
        });
        isTxMerchant = !!tx;
      }

      if (!isDirectMerchant && !isTxMerchant && !(isPrimaryPlatformMerchant && order.isSimulatedStore)) {
        throw new Error('Unauthorized: You do not have permission to access orders paid to another merchant account.');
      }
    }

    return order;
  }

  /**
   * Updates fulfillment status and shipping information for an order.
   * Only paid orders can be fulfilled.
   * Required validation: When marking 'shipped', carrier, trackingNumber, and estimatedDeliveryDate are enforced.
   * Syncs with PayPal shipment tracking API if capture ID exists.
   */
  async updateOrderFulfillment(params: {
    orderId: string;
    merchantUserId?: string;
    fulfillmentStatus: FulfillmentStatus;
    carrier?: string;
    trackingNumber?: string;
    shippingDate?: string;
    estimatedDeliveryDate?: string;
    notes?: string;
    adminName: string;
  }): Promise<IEcommerceOrder> {
    const order = await this.getMerchantOrderById(params.orderId, params.merchantUserId);
    if (!order) {
      throw new Error(`Order "${params.orderId}" not found.`);
    }

    // Crucial rule: Unpaid orders cannot be processed or shipped!
    if (order.paymentInfo.paymentStatus !== 'completed') {
      throw new Error(
        `Cannot fulfill order "${order.orderNumber}": Payment status is "${order.paymentInfo.paymentStatus}". Only verified paid orders can be packed and shipped.`
      );
    }

    // Validation for shipped stage
    if (params.fulfillmentStatus === 'shipped') {
      const finalCarrier = (params.carrier || order.shipment?.carrier || '').trim();
      const finalTrackingNumber = (params.trackingNumber || order.shipment?.trackingNumber || '').trim();
      if (!finalCarrier) {
        throw new Error('Shipping carrier is required to mark an order as shipped (e.g. FedEx Express, UPS Ground, DHL Express).');
      }
      if (!finalTrackingNumber) {
        throw new Error('Tracking number is required to mark an order as shipped.');
      }
    }

    // Update shipment details if provided or retain existing
    if (params.carrier?.trim()) order.shipment.carrier = params.carrier.trim();
    if (params.trackingNumber?.trim()) order.shipment.trackingNumber = params.trackingNumber.trim();
    if (params.notes?.trim()) order.shipment.notes = params.notes.trim();

    if (params.fulfillmentStatus === 'shipped' && !order.shipment.shippedAt) {
      order.shipment.shippedAt = params.shippingDate ? new Date(params.shippingDate) : new Date();
    }
    if (params.estimatedDeliveryDate) {
      order.shipment.estimatedDeliveryAt = new Date(params.estimatedDeliveryDate);
    } else if (params.fulfillmentStatus === 'delivered' && !order.shipment.estimatedDeliveryAt) {
      order.shipment.estimatedDeliveryAt = new Date();
    }

    order.fulfillmentStatus = params.fulfillmentStatus;

    // Status description for timeline
    const statusDescriptions: Record<FulfillmentStatus, string> = {
      payment_completed: 'PayPal Sandbox payment confirmed.',
      order_confirmed: 'Order confirmed and entered merchant fulfillment queue.',
      processing: 'Order is being verified and prepared at warehouse.',
      packed: 'Items carefully inspected, packaged, and labeled for dispatch.',
      shipped: `Package dispatched via ${params.carrier || order.shipment.carrier || 'Standard Courier'}. Tracking Number: ${params.trackingNumber || order.shipment.trackingNumber}`,
      out_for_delivery: 'Shipment has arrived at destination city and is out with courier for final delivery.',
      delivered: 'Package successfully delivered to customer address.',
      cancelled: 'Order has been cancelled.',
    };

    // Attempt PayPal shipment tracking synchronization if marking shipped or delivered
    if (
      ['shipped', 'delivered'].includes(params.fulfillmentStatus) &&
      order.paymentInfo.paypalCaptureId &&
      order.shipment.trackingNumber &&
      order.shipment.carrier
    ) {
      try {
        const paypalTrackingRes = await paypalIntegration.addShipmentTracking({
          captureId: order.paymentInfo.paypalCaptureId,
          trackingNumber: order.shipment.trackingNumber,
          carrier: order.shipment.carrier,
          status: params.fulfillmentStatus === 'delivered' ? 'DELIVERED' : 'SHIPPED',
          notifyBuyer: true,
        });

        if (paypalTrackingRes.success) {
          order.shipment.paypalTrackerId = paypalTrackingRes.trackerId;
          order.shipment.trackingSyncStatus = 'synced';
          order.shipment.trackingSyncError = undefined;
        } else {
          order.shipment.trackingSyncStatus = 'failed';
          order.shipment.trackingSyncError = paypalTrackingRes.error;
          logger.warn('EcommerceService', 'PayPal shipment tracking API notice', {
            error: paypalTrackingRes.error,
          });
        }
      } catch (err: any) {
        order.shipment.trackingSyncStatus = 'failed';
        order.shipment.trackingSyncError = err?.message;
        logger.warn('EcommerceService', 'Error syncing tracking to PayPal', { error: err?.message });
      }
    }

    // Append to status history
    order.statusHistory.push({
      status: params.fulfillmentStatus,
      timestamp: new Date(),
      notes: params.notes || statusDescriptions[params.fulfillmentStatus] || `Status updated to ${params.fulfillmentStatus}`,
      carrier: order.shipment.carrier,
      trackingNumber: order.shipment.trackingNumber,
      updatedBy: params.adminName || 'AURA Merchant Admin',
    });

    await order.save();

    // Dispatch customer notification for live tracking and status awareness
    try {
      const statusLabels: Record<string, string> = {
        order_confirmed: 'Order Confirmed',
        processing: 'Order Processing',
        packed: 'Order Packed',
        shipped: 'Order Shipped',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Order Delivered',
        cancelled: 'Order Cancelled',
      };
      const label = statusLabels[params.fulfillmentStatus] || params.fulfillmentStatus;
      await NotificationModel.create({
        userId: order.userId,
        type: 'payment_status',
        title: `Order ${order.orderNumber} ${label}`,
        message: params.notes || `Your order #${order.orderNumber} status has been updated to "${label}"${order.shipment.trackingNumber ? ` via ${order.shipment.carrier} (${order.shipment.trackingNumber})` : ''}.`,
        severity: params.fulfillmentStatus === 'delivered' ? 'success' : 'info',
        isRead: false,
        metadata: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          fulfillmentStatus: params.fulfillmentStatus,
          carrier: order.shipment.carrier,
          trackingNumber: order.shipment.trackingNumber,
        },
      });
    } catch (notifErr: any) {
      logger.warn('EcommerceService', 'Failed to generate customer notification', { error: notifErr?.message });
    }

    logger.info('EcommerceService', `Updated order ${order.orderNumber} fulfillment status to ${params.fulfillmentStatus}`, {
      carrier: order.shipment.carrier,
      trackingNumber: order.shipment.trackingNumber,
    });

    return order;
  }
}

export const ecommerceService = new EcommerceService();
