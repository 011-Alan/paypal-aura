export interface Channel3MerchantOffer {
  retailerName: string;
  offerPriceUsd: number;
  currency: string;
  inStock: boolean;
  purchaseUrl: string;
  deliveryTimeframe?: string;
  condition?: string;
  isLowestPrice?: boolean;
  affiliateAttributionUrl?: string;
}

export interface EcommerceProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  priceUsd?: number;
  demoPriceUsd: number;
  retailPriceRefUsd: number;
  currency: string;
  imageUrl: string;
  images?: string[];
  variants: string[];
  availability: 'in_stock' | 'limited_stock' | 'out_of_stock';
  retailerName: string;
  purchaseUrl: string;
  supportsPayPalSandboxCheckout: boolean;
  source: 'channel3_live_api' | 'reference_catalog_fallback';
  specifications?: Record<string, string>;
  features?: string[];
  rating?: number;
  reviewCount?: number;
  merchantOffers?: Channel3MerchantOffer[];
  lowestPriceUsd?: number;
  highestPriceUsd?: number;
  merchantOfferCount?: number;
}

export interface EcommerceCartItem {
  productId: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  retailerName: string;
  purchaseUrl: string;
  originalPrice: number;
  demoPrice: number;
  currency: string;
  selectedVariant: string;
  quantity: number;
  availableVariants: string[];
}

export interface EcommerceCart {
  items: EcommerceCartItem[];
  subtotal: number;
  shippingFee: number;
  tax: number;
  totalAmount: number;
  itemCount: number;
}

export type FulfillmentStatus =
  | 'payment_completed'
  | 'order_confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface EcommerceShippingAddress {
  fullName: string;
  streetAddress: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface EcommerceStatusHistory {
  status: FulfillmentStatus;
  timestamp: string;
  notes?: string;
  carrier?: string;
  trackingNumber?: string;
  updatedBy?: string;
}

export interface EcommerceOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
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
  currency: string;
  subtotal: number;
  shippingFee: number;
  tax: number;
  totalAmount: number;
  shippingAddress: EcommerceShippingAddress;
  paymentInfo: {
    paypalOrderId?: string;
    paypalCaptureId?: string;
    paymentStatus: 'pending' | 'completed' | 'failed' | 'cancelled';
    paidAt?: string;
    amountPaid?: number;
    currency?: string;
    payerEmail?: string;
    payerId?: string;
    payerName?: string;
  };
  fulfillmentStatus: FulfillmentStatus;
  shipment: {
    carrier?: string;
    trackingNumber?: string;
    shippedAt?: string;
    estimatedDeliveryAt?: string;
    notes?: string;
    isSimulated: boolean;
    paypalTrackerId?: string;
    trackingSyncStatus?: 'not_synced' | 'synced' | 'failed';
    trackingSyncError?: string;
  };
  statusHistory: EcommerceStatusHistory[];
  isSimulatedStore: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantOverview {
  totalOrders: number;
  paidOrders: number;
  awaitingProcessing: number;
  packedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  totalRevenue: number;
}
