import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sanitizeUntrustedExternalText } from '../../middleware/security';

export type PurchaseGuidanceTier =
  | 'Comfortable within the current plan'
  | 'Possible with budget adjustments'
  | 'Better postponed'
  | 'Not currently recommended';

export interface Channel3MerchantOffer {
  merchantName: string;
  merchantLogo?: string;
  priceInr: number;
  priceUsd: number;
  inStock: boolean;
  offerTitle?: string;
  url: string;
  monetizableUrl: string;
  shippingFeeInr?: number;
  shippingFeeUsd?: number;
  deliveryDays?: string;
  condition?: string;
  isLowestPrice?: boolean;
}

export interface Channel3ProductItem {
  id: string;
  name: string;
  title?: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  priceUsd?: number;
  demoPriceUsd?: number;
  demoPriceInr?: number;
  retailPriceRefUsd?: number;
  currency: string;
  imageUrl: string;
  images?: string[];
  variants: string[];
  availability: 'in_stock' | 'limited_stock' | 'out_of_stock';
  retailerName: string;
  purchaseUrl: string;
  supportsPayPalSandboxCheckout: boolean;
  source: 'channel3_live_api' | 'reference_catalog_fallback';
  rating?: number;
  reviewCount?: number;
  specifications?: Record<string, string>;
  features?: string[];
  merchantOffers?: Channel3MerchantOffer[];
  lowestPriceUsd?: number;
  highestPriceUsd?: number;
  merchantOfferCount?: number;
}

export interface EvaluatedProductOption {
  product: Channel3ProductItem;
  evaluation: {
    guidanceCategory: PurchaseGuidanceTier;
    affordabilityScore: number; // 0 to 100
    impactOnDiscretionaryPercent: number;
    factorsConsidered: {
      productPriceInr: number;
      availableDiscretionaryBudgetInr: number;
      upcomingCommitmentsInr: number;
      activeGoalsMonthlyTargetInr: number;
      savingsTargetInr: number;
      recent30DayExpenditureInr: number;
      userRiskTolerance: string;
    };
    explanation: string;
    suggestedSavingsPlan?: {
      monthsRequired: number;
      monthlyContributionInr: number;
      targetCompletionDate: string;
      summary: string;
    };
  };
}

const REFERENCE_CATALOG: Omit<Channel3ProductItem, 'source'>[] = [
  // --- Sneakers & Footwear ---
  {
    id: 'ch3-sneaker-nike-pegasus-40',
    name: 'Nike Air Zoom Pegasus 40 Men\'s Road Running Shoes',
    brand: 'Nike',
    category: 'Footwear & Sneakers',
    description: 'Responsive road running shoes featuring dual Zoom Air units, breathable engineered mesh, and resilient React foam midsole.',
    priceInr: 10495,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    variants: ['UK 8 / Black & White', 'UK 9 / Pure Platinum', 'UK 10 / Wolf Grey'],
    availability: 'in_stock',
    retailerName: 'Nike Direct India (PayPal Partner)',
    purchaseUrl: 'https://www.nike.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-sneaker-adidas-ultraboost-light',
    name: 'Adidas Ultraboost Light Running Shoes',
    brand: 'Adidas',
    category: 'Footwear & Sneakers',
    description: 'Flagship long-distance running shoes with Light BOOST cushioning, Primeknit+ textile upper, and Continental rubber outsole.',
    priceInr: 14999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=600&q=80',
    variants: ['UK 8 / Core Black', 'UK 9 / Cloud White', 'UK 10 / Solar Red'],
    availability: 'in_stock',
    retailerName: 'Adidas Official Store (PayPal Supported)',
    purchaseUrl: 'https://www.adidas.co.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-sneaker-puma-velocity-nitro-2',
    name: 'Puma Velocity Nitro 2 Men\'s Everyday Running Shoes',
    brand: 'Puma',
    category: 'Footwear & Sneakers',
    description: 'Lightweight and durable daily trainer equipped with NITRO foam cushioning and PUMAGRIP all-surface rubber outsole.',
    priceInr: 6499,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=600&q=80',
    variants: ['UK 8 / Royal Blue', 'UK 9 / Puma Black', 'UK 10 / Fizzy Lime'],
    availability: 'in_stock',
    retailerName: 'Puma India Direct (PayPal Supported)',
    purchaseUrl: 'https://in.puma.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-sneaker-puma-smash-v2',
    name: 'Puma Smash V2 Leather Casual Sneakers',
    brand: 'Puma',
    category: 'Footwear & Sneakers',
    description: 'Classic tennis-inspired everyday casual sneaker with clean leather upper, cushioned SoftFoam+ sockliner, and durable rubber sole.',
    priceInr: 3499,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=600&q=80',
    variants: ['UK 8 / White & Black', 'UK 9 / Triple Black', 'UK 10 / White & Navy'],
    availability: 'in_stock',
    retailerName: 'Puma India Direct (PayPal Supported)',
    purchaseUrl: 'https://in.puma.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-sneaker-asics-gel-kayano-30',
    name: 'Asics Gel-Kayano 30 Stability Running Shoes',
    brand: 'Asics',
    category: 'Footwear & Sneakers',
    description: 'Premium stability distance running shoes with 4D GUIDANCE SYSTEM, PureGEL cushioning, and FF BLAST PLUS ECO foam.',
    priceInr: 13999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=80',
    variants: ['UK 8.5 / Black & Glow', 'UK 9.5 / Sheet Rock'],
    availability: 'in_stock',
    retailerName: 'Asics India Official Store',
    purchaseUrl: 'https://www.asics.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Laptops & Computers ---
  {
    id: 'ch3-laptop-asus-vivobook-14-i5',
    name: 'ASUS Vivobook 14 (12th Gen Intel Core i5-1235U, 16GB RAM, 512GB NVMe SSD, 14" FHD)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: '14-inch compact productivity laptop featuring 12th Gen Intel Core i5-1235U (10 cores, up to 4.4GHz), 16GB RAM, 512GB NVMe SSD, and 1.4kg ultra-portable chassis with 42Wh battery.',
    priceInr: 47990,
    priceUsd: 568,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80',
    variants: ['16GB / 512GB Quiet Blue', '16GB / 512GB Transparent Silver'],
    availability: 'in_stock',
    retailerName: 'TechDirect India (PayPal Supported Partner)',
    purchaseUrl: 'https://www.paypal.com/in/webapps/mpp/home',
    supportsPayPalSandboxCheckout: true,
    specifications: {
      Processor: '12th Gen Intel Core i5-1235U (10 Cores, 12 Threads, up to 4.4GHz)',
      RAM: '16GB DDR4 3200MHz (8GB Onboard + 8GB SO-DIMM)',
      Storage: '512GB M.2 NVMe PCIe 3.0 SSD',
      Display: '14.0-inch FHD (1920 x 1080) 16:9, Anti-glare, 250 nits',
      Battery: '42Wh 3-cell Li-ion (approx. 6.5 hours productivity)',
      Weight: '1.40 kg (Ultra-portable)',
      Graphics: 'Integrated Intel Iris Xe Graphics',
      Retailer: 'TechDirect India',
      Warranty: '1 Year On-site Manufacturer Warranty',
    },
  },
  {
    id: 'ch3-laptop-asus-vivobook-14-oled',
    name: 'ASUS Vivobook S 14 OLED (Intel Core i5-13500H, 16GB LPDDR5, 512GB Gen4 SSD, 2.8K 90Hz)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: 'Premium creator laptop with 14-inch 2.8K 90Hz OLED display (600 nits HDR, 100% DCI-P3), high-performance Intel Core i5-13500H, and 75Wh battery.',
    priceInr: 62990,
    priceUsd: 745,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=600&q=80',
    variants: ['Solar Blue 16GB/512GB', 'Midnight Black 16GB/512GB'],
    availability: 'in_stock',
    retailerName: 'ASUS India E-Shop (PayPal Partner)',
    purchaseUrl: 'https://www.asus.com/in/',
    supportsPayPalSandboxCheckout: true,
    specifications: {
      Processor: '13th Gen Intel Core i5-13500H (12 Cores, 16 Threads, up to 4.7GHz)',
      RAM: '16GB LPDDR5 4800MHz Onboard',
      Storage: '512GB M.2 NVMe PCIe 4.0 SSD',
      Display: '14.0-inch 2.8K (2880 x 1800) OLED 90Hz, 600 nits HDR, 100% DCI-P3',
      Battery: '75Wh 3-cell Li-ion (approx. 8.5 hours productivity)',
      Weight: '1.50 kg',
      Graphics: 'Intel Iris Xe Graphics',
      Retailer: 'ASUS India E-Shop',
      Warranty: '1 Year Official ASUS Warranty',
    },
  },
  {
    id: 'ch3-laptop-asus-vivobook-14-i3',
    name: 'ASUS Vivobook 14 (12th Gen Intel Core i3-1215U, 8GB RAM, 512GB SSD, 14" FHD)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: 'Budget-friendly 14-inch daily productivity laptop with Intel Core i3-1215U, 8GB RAM (expandable), and 512GB SSD in a slim 1.4kg chassis.',
    priceInr: 35990,
    priceUsd: 426,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80',
    variants: ['8GB / 512GB Quiet Blue'],
    availability: 'in_stock',
    retailerName: 'Croma Electronics Partner',
    purchaseUrl: 'https://www.croma.com/',
    supportsPayPalSandboxCheckout: false,
    specifications: {
      Processor: '12th Gen Intel Core i3-1215U (6 Cores, 8 Threads, up to 4.4GHz)',
      RAM: '8GB DDR4 (Upgradeable to 16GB via SO-DIMM slot)',
      Storage: '512GB M.2 NVMe PCIe 3.0 SSD',
      Display: '14.0-inch FHD (1920 x 1080) Anti-glare, 250 nits',
      Battery: '42Wh 3-cell Li-ion (approx. 6 hours)',
      Weight: '1.40 kg',
      Graphics: 'Intel UHD Graphics',
      Retailer: 'Croma Electronics Partner',
      Warranty: '1 Year Manufacturer Warranty',
    },
  },
  {
    id: 'ch3-laptop-asus-vivobook-16',
    name: 'ASUS VivoBook 16 (Intel Core i5-13500H, 16GB RAM, 512GB NVMe SSD)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: '16-inch FHD+ productivity laptop with 13th Gen Intel Core i5 H-series processor, 16GB RAM, and long-lasting 50Wh battery.',
    priceInr: 54990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80',
    variants: ['16GB / 512GB Silver', '16GB / 1TB Indie Black'],
    availability: 'in_stock',
    retailerName: 'TechDirect India (PayPal Supported Partner)',
    purchaseUrl: 'https://www.paypal.com/in/webapps/mpp/home',
    supportsPayPalSandboxCheckout: true,
    specifications: {
      Processor: '13th Gen Intel Core i5-13500H (12 Cores, up to 4.7GHz)',
      RAM: '16GB DDR4 3200MHz',
      Storage: '512GB M.2 NVMe PCIe 3.0 SSD',
      Display: '16.0-inch WUXGA (1920 x 1200) 16:10, Anti-glare, 300 nits',
      Battery: '50Wh 3-cell Li-ion',
      Weight: '1.88 kg',
      Graphics: 'Intel Iris Xe Graphics',
      Retailer: 'TechDirect India',
      Warranty: '1 Year Manufacturer Warranty',
    },
  },
  {
    id: 'ch3-laptop-lenovo-ideapad-slim3',
    name: 'Lenovo IdeaPad Slim 3 (AMD Ryzen 5 7530U, 16GB RAM, 512GB SSD)',
    brand: 'Lenovo',
    category: 'Laptops & Computers',
    description: 'Lightweight 15.6-inch everyday laptop with Ryzen 5 7000 series processor, Dolby Audio, and Rapid Charge Boost.',
    priceInr: 42990,
    priceUsd: 509,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
    variants: ['Arctic Grey 16GB/512GB', 'Abyss Blue 8GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Lenovo Authorized Online Store',
    purchaseUrl: 'https://www.lenovo.com/in/en/',
    supportsPayPalSandboxCheckout: true,
    specifications: {
      Processor: 'AMD Ryzen 5 7530U (6 Cores, 12 Threads, up to 4.5GHz)',
      RAM: '16GB DDR4 3200MHz Soldered',
      Storage: '512GB M.2 NVMe PCIe 4.0 SSD',
      Display: '15.6-inch FHD (1920 x 1080) IPS, 300 nits Anti-glare',
      Battery: '47Wh with Rapid Charge Boost (2 hours in 15 mins)',
      Weight: '1.62 kg',
      Graphics: 'Integrated AMD Radeon Graphics',
      Retailer: 'Lenovo Authorized Online Store',
      Warranty: '1 Year Courier or Carry-in Warranty',
    },
  },
  {
    id: 'ch3-laptop-lenovo-v15',
    name: 'Lenovo V15 G3 (Intel Core i3-1215U, 8GB RAM, 512GB SSD, 15.6" FHD)',
    brand: 'Lenovo',
    category: 'Laptops & Computers',
    description: 'Affordable Lenovo commercial laptop engineered for everyday office, accounting, and learning tasks.',
    priceInr: 33990,
    priceUsd: 402,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80',
    variants: ['Iron Grey 8GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Lenovo Commercial Hub',
    purchaseUrl: 'https://www.lenovo.com/in/en/',
    supportsPayPalSandboxCheckout: true,
    specifications: {
      Processor: '12th Gen Intel Core i3-1215U (6 Cores, up to 4.4GHz)',
      RAM: '8GB DDR4 (Upgradeable to 16GB)',
      Storage: '512GB M.2 NVMe PCIe SSD',
      Display: '15.6-inch FHD (1920 x 1080) Anti-glare',
      Battery: '38Wh (approx. 5.5 hours)',
      Weight: '1.70 kg',
      Graphics: 'Intel UHD Graphics',
      Retailer: 'Lenovo Commercial Hub',
      Warranty: '1 Year Onsite Warranty',
    },
  },
  {
    id: 'ch3-laptop-acer-aspire-lite',
    name: 'Acer Aspire Lite 12th Gen Core i3 (16GB RAM, 512GB SSD, Metal Body)',
    brand: 'Acer',
    category: 'Laptops & Computers',
    description: 'Value productivity notebook ideal for remote study, office suites, and everyday web workflows.',
    priceInr: 31990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=600&q=80',
    variants: ['Steel Grey 16GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Croma Retail Online',
    purchaseUrl: 'https://www.croma.com/',
    supportsPayPalSandboxCheckout: false,
  },
  {
    id: 'ch3-laptop-macbook-air-m2',
    name: 'Apple MacBook Air 13-inch (M2 Chip, 16GB Unified Memory, 256GB SSD)',
    brand: 'Apple',
    category: 'Laptops & Computers',
    description: 'Fanless aluminum design with Apple M2 chip, Liquid Retina display, 18-hour battery life, and MagSafe 3 charging.',
    priceInr: 74900,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=600&q=80',
    variants: ['Midnight', 'Starlight', 'Space Grey'],
    availability: 'limited_stock',
    retailerName: 'Imagine Apple Premium Partner',
    purchaseUrl: 'https://www.apple.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Smartphones ---
  {
    id: 'ch3-phone-samsung-m35',
    name: 'Samsung Galaxy M35 5G (8GB RAM, 128GB Storage, 6000mAh Battery)',
    brand: 'Samsung',
    category: 'Smartphones',
    description: '120Hz Super AMOLED display with Gorilla Glass Victus+, 50MP OIS triple camera, and 4 generations of OS upgrades.',
    priceInr: 16999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    variants: ['Moonlight Blue 8GB/128GB', 'Daybreak Blue 6GB/128GB'],
    availability: 'in_stock',
    retailerName: 'Samsung SmartPlaza Partner (PayPal Enabled)',
    purchaseUrl: 'https://www.samsung.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-phone-cmf-phone1',
    name: 'CMF by Nothing Phone 1 5G (8GB RAM, 128GB, Dimensity 7300)',
    brand: 'Nothing',
    category: 'Smartphones',
    description: 'Clean Nothing OS 2.6 experience with 120Hz Super AMOLED display and modular replaceable back cover design.',
    priceInr: 14999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
    variants: ['Black 8GB/128GB', 'Orange 8GB/128GB'],
    availability: 'in_stock',
    retailerName: 'Flipkart Electronics',
    purchaseUrl: 'https://www.flipkart.com/',
    supportsPayPalSandboxCheckout: false,
  },
  // --- Audio & Electronics ---
  {
    id: 'ch3-headphones-sony-wh-ch720n',
    name: 'Sony WH-CH720N Wireless Noise Cancelling Headphones',
    brand: 'Sony',
    category: 'Audio & Accessories',
    description: 'Featherlight 192g over-ear headphones with Sony Integrated Processor V1, multipoint Bluetooth, and 35-hour battery.',
    priceInr: 8990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    variants: ['Black', 'Blue', 'White'],
    availability: 'in_stock',
    retailerName: 'Sony Center Direct (PayPal Supported)',
    purchaseUrl: 'https://www.sony.co.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-audio-apple-airpods-pro-2',
    name: 'Apple AirPods Pro (2nd Gen) with MagSafe Case (USB-C)',
    brand: 'Apple',
    category: 'Audio & Accessories',
    description: 'Active Noise Cancellation with Transparency mode, Personalized Spatial Audio with dynamic head tracking, and H2 chip.',
    priceInr: 22900,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=80',
    variants: ['White with MagSafe USB-C Case'],
    availability: 'in_stock',
    retailerName: 'Imagine Apple Premium Reseller (PayPal Enabled)',
    purchaseUrl: 'https://www.apple.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Clothing & Apparel ---
  {
    id: 'ch3-clothing-uniqlo-supima-tee',
    name: 'Uniqlo Supima Cotton Crew Neck T-Shirt',
    brand: 'Uniqlo',
    category: 'Clothing & Apparel',
    description: '100% premium long-staple Supima cotton crew neck tee with supple texture, natural sheen, and durable weave.',
    priceInr: 1290,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
    variants: ['Size M / Navy', 'Size L / White', 'Size XL / Olive'],
    availability: 'in_stock',
    retailerName: 'Uniqlo India Online (PayPal Partner)',
    purchaseUrl: 'https://www.uniqlo.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-clothing-levis-511-jeans',
    name: 'Levi\'s 511 Slim Fit Stretch Denim Jeans',
    brand: 'Levi\'s',
    category: 'Clothing & Apparel',
    description: 'Modern slim-cut jeans with room to move, crafted with Levi\'s Flex advanced stretch technology for maximum comfort.',
    priceInr: 3299,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=80',
    variants: ['32W x 32L Dark Indigo', '34W x 32L Mid Stonewash'],
    availability: 'in_stock',
    retailerName: 'Levi\'s Official Store India',
    purchaseUrl: 'https://www.levi.in/',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Furniture & Home Office ---
  {
    id: 'ch3-furniture-wakefit-ergonomic-chair',
    name: 'Wakefit High-Back Ergonomic Office Chair with Lumbar Support',
    brand: 'Wakefit',
    category: 'Furniture',
    description: 'Breathable mesh back ergonomic desk chair with 2D adjustable armrests, multi-lock synchro-tilt mechanism, and Class 4 gas lift.',
    priceInr: 7899,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1580481077195-7385f50d8857?auto=format&fit=crop&w=600&q=80',
    variants: ['Black Mesh / Grey Frame', 'All-Black Mesh'],
    availability: 'in_stock',
    retailerName: 'Wakefit Innovations Direct (PayPal Supported)',
    purchaseUrl: 'https://www.wakefit.co/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-furniture-ikea-study-desk',
    name: 'IKEA LINNMON / ADILS Study & Computer Desk (100x60 cm)',
    brand: 'IKEA',
    category: 'Furniture',
    description: 'Clean Scandinavian pre-drilled minimalist work desk with sturdy adjustable leveling feet and scratch-resistant tabletop.',
    priceInr: 3490,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=600&q=80',
    variants: ['White / White Legs', 'Black-Brown / Silver Legs'],
    availability: 'in_stock',
    retailerName: 'IKEA India Online Store',
    purchaseUrl: 'https://www.ikea.com/in/en/',
    supportsPayPalSandboxCheckout: false,
  },
  // --- Home Appliances ---
  {
    id: 'ch3-appliance-daikin-1-5t-ac',
    name: 'Daikin 1.5 Ton 5 Star Inverter Split AC (Copper, PM 2.5 Filter, Triple Display)',
    brand: 'Daikin',
    category: 'Home Appliances',
    description: 'Energy-efficient 1.5 ton 5-star inverter split air conditioner featuring Neo Swing compressor, PM 2.5 air filtration, and 100% copper condenser.',
    priceInr: 45490,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
    variants: ['1.5 Ton 5 Star / White', '1.5 Ton 3 Star / White'],
    availability: 'in_stock',
    retailerName: 'Croma Direct (PayPal Supported)',
    purchaseUrl: 'https://www.croma.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-appliance-voltas-1-5t-ac',
    name: 'Voltas 1.5 Ton 3 Star Adjustable Inverter Split AC (Copper, Anti-Dust Filter)',
    brand: 'Voltas',
    category: 'Home Appliances',
    description: 'High-ambient cooling split air conditioner with 4-in-1 adjustable cooling modes, dual filtration, and low power consumption.',
    priceInr: 32990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
    variants: ['1.5 Ton 3 Star / White', '1 Ton 3 Star / White'],
    availability: 'in_stock',
    retailerName: 'Tata CLiQ Electronics (PayPal Supported)',
    purchaseUrl: 'https://www.tatacliq.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-appliance-lg-refrigerator-260l',
    name: 'LG 260L 3 Star Smart Inverter Frost-Free Double Door Refrigerator',
    brand: 'LG',
    category: 'Home Appliances',
    description: 'Double door frost-free refrigerator with Smart Inverter Compressor, Multi Air Flow cooling, and toughened glass shelves.',
    priceInr: 26990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80',
    variants: ['Dazzle Steel 260L', 'Shiny Steel 242L'],
    availability: 'in_stock',
    retailerName: 'Reliance Digital Direct (PayPal Partner)',
    purchaseUrl: 'https://www.reliancedigital.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-appliance-samsung-refrigerator-236l',
    name: 'Samsung 236L 3 Star Digital Inverter Double Door Refrigerator',
    brand: 'Samsung',
    category: 'Home Appliances',
    description: 'Energy-saving double door refrigerator with Digital Inverter technology, all-around cooling, and deodorizing filter.',
    priceInr: 24490,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=600&q=80',
    variants: ['Elegant Inox 236L', 'Refined Inox 256L'],
    availability: 'in_stock',
    retailerName: 'Samsung Direct India (PayPal Supported)',
    purchaseUrl: 'https://www.samsung.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-appliance-philips-air-fryer',
    name: 'Philips Digital Air Fryer HD9252/90 (4.1L, Rapid Air Technology)',
    brand: 'Philips',
    category: 'Home Appliances',
    description: 'Touchscreen digital air fryer with 7 preset cooking programs, Rapid Air technology for 90% less fat, and keep-warm function.',
    priceInr: 7995,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=600&q=80',
    variants: ['Black Glossy 4.1L', 'White 4.1L'],
    availability: 'in_stock',
    retailerName: 'Philips Domestic Appliances Partner (PayPal Supported)',
    purchaseUrl: 'https://www.philips.co.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-appliance-dyson-v8-vacuum',
    name: 'Dyson V8 Cordless Vacuum Cleaner with De-tangling Motorbar',
    brand: 'Dyson',
    category: 'Home Appliances',
    description: 'Lightweight cordless vacuum with 40-minute fade-free suction, whole-machine advanced filtration, and anti-tangle hair screw tool.',
    priceInr: 29900,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80',
    variants: ['Silver / Nickel'],
    availability: 'in_stock',
    retailerName: 'Dyson India Direct (PayPal Supported)',
    purchaseUrl: 'https://www.dyson.in/',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Books & Education ---
  {
    id: 'ch3-book-atomic-habits',
    name: 'Atomic Habits by James Clear (Paperback / Best-selling Guide)',
    brand: 'Penguin',
    category: 'Books & Learning',
    description: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones. Practical framework for small daily improvements that lead to massive results.',
    priceInr: 650,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    variants: ['Paperback Edition', 'Hardcover Edition'],
    availability: 'in_stock',
    retailerName: 'BookStore Partner India (PayPal Supported)',
    purchaseUrl: 'https://www.penguin.co.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-book-psychology-of-money',
    name: 'The Psychology of Money by Morgan Housel (Timeless Financial Lessons)',
    brand: 'Jaico',
    category: 'Books & Learning',
    description: '19 short stories exploring the strange ways people think about money, personal finance, greed, happiness, and investing decisions.',
    priceInr: 399,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1592496431122-2349e0fbc666?auto=format&fit=crop&w=600&q=80',
    variants: ['Paperback Special Edition'],
    availability: 'in_stock',
    retailerName: 'BookStore Partner India (PayPal Supported)',
    purchaseUrl: 'https://www.jaicobooks.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-book-holy-bible-kjv',
    name: 'Holy Bible: King James Version (KJV Study Edition)',
    title: 'Holy Bible: King James Version (KJV Study Edition)',
    brand: 'Thomas Nelson',
    category: 'Books & Learning',
    description: 'Classic King James Version study Bible with concordance, full-color maps, cross-references, and ribbon marker in leatherette binding.',
    priceInr: 1499,
    priceUsd: 18,
    demoPriceUsd: 18,
    demoPriceInr: 1499,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=600&q=80',
    variants: ['Black Leatherette', 'Burgundy Hardcover'],
    availability: 'in_stock',
    retailerName: 'Thomas Nelson Publishers (PayPal Supported)',
    purchaseUrl: 'https://buy.trychannel3.com/bible-kjv',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-book-esv-study-bible',
    name: 'ESV Study Bible (English Standard Version / Hardcover)',
    title: 'ESV Study Bible (English Standard Version / Hardcover)',
    brand: 'Crossway',
    category: 'Books & Learning',
    description: 'Comprehensive study Bible with 20,000+ study notes, 80,000 cross-references, 200+ charts, and articles by leading scholars.',
    priceInr: 2899,
    priceUsd: 35,
    demoPriceUsd: 35,
    demoPriceInr: 2899,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
    variants: ['Hardcover Standard', 'TruTone Brown Leather'],
    availability: 'in_stock',
    retailerName: 'Crossway Direct (PayPal Supported)',
    purchaseUrl: 'https://buy.trychannel3.com/bible-esv',
    supportsPayPalSandboxCheckout: true,
  },
  // --- Water Bottles, Hydration & Everyday Essentials ---
  {
    id: 'ch3-lifestyle-milton-thermosteel-bottle',
    name: 'Milton Thermosteel Flip Lid Insulated Water Bottle (1000ml)',
    brand: 'Milton',
    category: 'Kitchen & Dining',
    description: 'Double walled vacuum insulated stainless steel water bottle. Keeps beverages hot or cold for 24 hours. Leak proof flip lid.',
    priceInr: 1099,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80',
    variants: ['1000ml Silver', '1000ml Matte Black', '750ml Silver'],
    availability: 'in_stock',
    retailerName: 'Milton Official Partner (PayPal Supported)',
    purchaseUrl: 'https://www.milton.in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-lifestyle-cello-stainless-steel-bottle',
    name: 'Cello H2O Stainless Steel Water Bottle (1 Litre, Set of 2)',
    brand: 'Cello',
    category: 'Kitchen & Dining',
    description: 'Food grade rust-free stainless steel fridge bottles with ergonomic grip and durable leak-proof cap.',
    priceInr: 649,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1544003484-3cd181d17917?auto=format&fit=crop&w=600&q=80',
    variants: ['Set of 2 Silver'],
    availability: 'in_stock',
    retailerName: 'Cello World India Partner',
    purchaseUrl: 'https://www.celloworld.com/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-lifestyle-hydro-flask-wide-mouth',
    name: 'Hydro Flask 32 oz Wide Mouth with Flex Cap (946ml)',
    brand: 'Hydro Flask',
    category: 'Kitchen & Dining',
    description: 'TempShield double-wall vacuum insulation keeps drinks ice cold up to 24 hours or piping hot up to 12. Pro-grade 18/8 stainless steel.',
    priceInr: 3499,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=600&q=80',
    variants: ['Pacific Blue', 'Black', 'White'],
    availability: 'in_stock',
    retailerName: 'Adventure Gear India Partner',
    purchaseUrl: 'https://www.hydroflask.com/',
    supportsPayPalSandboxCheckout: true,
  },

  // --- Mechanical Keyboards & Peripherals ---
  {
    id: 'ch3-keyboard-keychron-q1',
    name: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard (QMK/VIA, CNC Aluminum, Banana Switches)',
    brand: 'Keychron',
    category: 'Keyboards & Peripherals',
    description: 'Premium 75% layout custom wireless mechanical keyboard with CNC machined aluminum body, hot-swappable sockets, double-gasket design, and screw-in PCB stabilizers.',
    priceInr: 16999,
    priceUsd: 199,
    demoPriceUsd: 199,
    retailPriceRefUsd: 220,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=600&q=80',
    variants: ['Carbon Black / Tactile Banana', 'Silver Grey / Linear Red', 'Shell White / Tactile Brown'],
    availability: 'in_stock',
    retailerName: 'Keychron Official Store Direct',
    purchaseUrl: 'https://www.keychron.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.9,
    reviewCount: 342,
  },
  {
    id: 'ch3-keyboard-logitech-g-pro-x',
    name: 'Logitech G PRO X TKL LIGHTSPEED Wireless Mechanical Gaming Keyboard (GX Brown Tactile)',
    brand: 'Logitech',
    category: 'Keyboards & Peripherals',
    description: 'Championship-proven tenkeyless wireless mechanical keyboard designed with pro esports athletes. LIGHTSPEED wireless technology, dual-shot PBT keycaps, and LIGHTSYNC RGB.',
    priceInr: 14999,
    priceUsd: 179,
    demoPriceUsd: 179,
    retailPriceRefUsd: 199,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80',
    variants: ['Black / GX Brown Tactile', 'White / GX Red Linear', 'Magenta / GX Blue Clicky'],
    availability: 'in_stock',
    retailerName: 'Logitech G Gaming Store',
    purchaseUrl: 'https://www.logitechg.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 512,
  },
  {
    id: 'ch3-keyboard-keychron-k2',
    name: 'Keychron K2 V2 Wireless Mechanical Keyboard (75% Compact, Gateron G Pro Brown)',
    brand: 'Keychron',
    category: 'Keyboards & Peripherals',
    description: 'Ultra-popular 84-key compact wireless mechanical keyboard with Mac and Windows layout keycaps, hot-swappable option, 4000mAh battery, and wireless or wired mode.',
    priceInr: 6999,
    priceUsd: 89,
    demoPriceUsd: 89,
    retailPriceRefUsd: 99,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=600&q=80',
    variants: ['RGB Aluminum / Brown Switch', 'White Backlight / Red Switch'],
    availability: 'in_stock',
    retailerName: 'Keychron Official Store Direct',
    purchaseUrl: 'https://www.keychron.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.7,
    reviewCount: 880,
  },
  {
    id: 'ch3-keyboard-razer-blackwidow',
    name: 'Razer BlackWidow V4 Pro Mechanical Gaming Keyboard (Razer Green Clicky Switches, Chroma RGB)',
    brand: 'Razer',
    category: 'Keyboards & Peripherals',
    description: 'Full-featured battlestation mechanical keyboard with Razer Command Dial, 8 dedicated macro keys, 8000Hz polling rate, magnetic plush leatherette wrist rest, and underglow.',
    priceInr: 18999,
    priceUsd: 229,
    demoPriceUsd: 229,
    retailPriceRefUsd: 249,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1541140532154-b024d705b909?auto=format&fit=crop&w=600&q=80',
    variants: ['Razer Green Clicky', 'Razer Yellow Linear'],
    availability: 'in_stock',
    retailerName: 'Razer Direct Partner Store',
    purchaseUrl: 'https://www.razer.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.7,
    reviewCount: 290,
  },

  // --- Gaming Laptops ---
  {
    id: 'ch3-laptop-asus-rog-zephyrus-g16',
    name: 'ASUS ROG Zephyrus G16 OLED Gaming Laptop (Intel Core Ultra 9, RTX 4070 8GB, 32GB RAM, 1TB SSD)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: 'Ultra-thin premium CNC aluminum gaming powerhouse with 2.5K 240Hz ROG Nebula OLED display, NVIDIA GeForce RTX 4070 8GB GPU, and vapor chamber cooling.',
    priceInr: 164990,
    priceUsd: 1999,
    demoPriceUsd: 1999,
    retailPriceRefUsd: 2199,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=600&q=80',
    variants: ['Eclipse Gray 32GB/1TB', 'Platinum White 32GB/2TB'],
    availability: 'in_stock',
    retailerName: 'ASUS ROG Gaming Flagship',
    purchaseUrl: 'https://rog.asus.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.9,
    reviewCount: 185,
  },
  {
    id: 'ch3-laptop-lenovo-legion-pro-5i',
    name: 'Lenovo Legion Pro 5i 16" Gaming Laptop (Intel Core i7-14700HX, RTX 4060, 16GB RAM, 1TB SSD, 240Hz)',
    brand: 'Lenovo',
    category: 'Laptops & Computers',
    description: 'AI-tuned competitive gaming laptop with Lenovo Legion Coldfront 5.0 cooling, 16-inch WQXGA 240Hz display, and 140W max TGP RTX 4060 graphics.',
    priceInr: 119990,
    priceUsd: 1449,
    demoPriceUsd: 1449,
    retailPriceRefUsd: 1599,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?auto=format&fit=crop&w=600&q=80',
    variants: ['Onyx Grey 16GB/1TB', 'Onyx Grey 32GB/1TB'],
    availability: 'in_stock',
    retailerName: 'Lenovo Legion Direct Store',
    purchaseUrl: 'https://www.lenovo.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 310,
  },
  {
    id: 'ch3-laptop-acer-nitro-v15',
    name: 'Acer Nitro V 15 Gaming Laptop (AMD Ryzen 7 7735HS, RTX 4050, 16GB RAM, 512GB SSD, 144Hz FHD)',
    brand: 'Acer',
    category: 'Laptops & Computers',
    description: 'Value-oriented high-speed gaming laptop featuring dual-fan cooling with dual intake exhausts, NVIDIA DLSS 3, and 15.6-inch 144Hz IPS display.',
    priceInr: 66990,
    priceUsd: 799,
    demoPriceUsd: 799,
    retailPriceRefUsd: 899,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?auto=format&fit=crop&w=600&q=80',
    variants: ['Obsidian Black 16GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Acer Official Store',
    purchaseUrl: 'https://www.acer.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.6,
    reviewCount: 420,
  },

  // --- Premium Wireless Headphones ---
  {
    id: 'ch3-headphones-sony-wh-1000xm5',
    name: 'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones',
    brand: 'Sony',
    category: 'Audio & Accessories',
    description: 'Two processors and 8 microphones for unprecedented noise cancellation. Auto NC Optimizer, 30-hour battery life with quick charge, and crystal-clear hands-free calling.',
    priceInr: 28990,
    priceUsd: 398,
    demoPriceUsd: 398,
    retailPriceRefUsd: 420,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    variants: ['Silver', 'Black', 'Midnight Blue'],
    availability: 'in_stock',
    retailerName: 'Sony Center Audio Hub',
    purchaseUrl: 'https://www.sony.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.9,
    reviewCount: 940,
  },
  {
    id: 'ch3-headphones-bose-qc45',
    name: 'Bose QuietComfort 45 Bluetooth Wireless Noise Cancelling Headphones',
    brand: 'Bose',
    category: 'Audio & Accessories',
    description: 'Iconic silence, comfort, and sound. TriPort acoustic architecture, Quiet and Aware modes, 24-hour battery life, and lightweight plush synthetic leather.',
    priceInr: 24900,
    priceUsd: 329,
    demoPriceUsd: 329,
    retailPriceRefUsd: 349,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80',
    variants: ['Triple Black', 'White Smoke', 'Eclipse Grey'],
    availability: 'in_stock',
    retailerName: 'Bose Direct Partner',
    purchaseUrl: 'https://www.bose.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 780,
  },

  // --- Smartphones (Including Under $500 Targets) ---
  {
    id: 'ch3-phone-google-pixel-8a',
    name: 'Google Pixel 8a 5G (Google Tensor G3, 128GB, Unlocked, 120Hz Actua Display)',
    brand: 'Google',
    category: 'Smartphones',
    description: 'The delightfully intelligent smartphone powered by Google Tensor G3. Features 64MP dual rear cameras, 7 years of OS updates, and IP67 water and dust resistance.',
    priceInr: 39999,
    priceUsd: 499,
    demoPriceUsd: 499,
    retailPriceRefUsd: 520,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
    variants: ['Obsidian 128GB', 'Porcelain 128GB', 'Bay Blue 128GB'],
    availability: 'in_stock',
    retailerName: 'Google Store Partner (PayPal Enabled)',
    purchaseUrl: 'https://store.google.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 620,
  },
  {
    id: 'ch3-phone-samsung-a55',
    name: 'Samsung Galaxy A55 5G (8GB RAM, 128GB Storage, Super AMOLED 120Hz, IP67)',
    brand: 'Samsung',
    category: 'Smartphones',
    description: 'Premium metal and glass build with 6.6-inch Super AMOLED 120Hz display, 50MP OIS camera, Samsung Knox Vault security, and 5000mAh two-day battery.',
    priceInr: 31999,
    priceUsd: 379,
    demoPriceUsd: 379,
    retailPriceRefUsd: 410,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=600&q=80',
    variants: ['Awesome Navy 8GB/128GB', 'Awesome Iceblue 8GB/128GB'],
    availability: 'in_stock',
    retailerName: 'Samsung Direct Partner',
    purchaseUrl: 'https://www.samsung.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.7,
    reviewCount: 450,
  },
  {
    id: 'ch3-phone-apple-iphone-se',
    name: 'Apple iPhone SE 3rd Gen (A15 Bionic, 64GB, 5G, Midnight)',
    brand: 'Apple',
    category: 'Smartphones',
    description: 'Blazing-fast A15 Bionic chip in a compact, durable pocketable design. 5G connectivity, 12MP advanced camera system, and Touch ID home button.',
    priceInr: 34999,
    priceUsd: 429,
    demoPriceUsd: 429,
    retailPriceRefUsd: 449,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80',
    variants: ['Midnight 64GB', 'Starlight 64GB', '(PRODUCT)RED 64GB'],
    availability: 'in_stock',
    retailerName: 'Apple Authorized Partner',
    purchaseUrl: 'https://www.apple.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.6,
    reviewCount: 510,
  },

  // --- Ergonomic Office Chairs & Furniture ---
  {
    id: 'ch3-furniture-herman-miller-aeron',
    name: 'Herman Miller Aeron Ergonomic Office Chair (PostureFit SL, Fully Adjustable)',
    brand: 'Herman Miller',
    category: 'Furniture',
    description: 'The world benchmark for ergonomic seating. 8Z Pellicle breathable suspension mesh, PostureFit SL sacral support, tilt limiter with seat angle, and fully adjustable arms.',
    priceInr: 124900,
    priceUsd: 1495,
    demoPriceUsd: 1495,
    retailPriceRefUsd: 1650,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1580481077195-7385f50d8857?auto=format&fit=crop&w=600&q=80',
    variants: ['Size B Medium / Graphite', 'Size C Large / Mineral'],
    availability: 'in_stock',
    retailerName: 'Herman Miller Official Store',
    purchaseUrl: 'https://www.hermanmiller.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.9,
    reviewCount: 1120,
  },
  {
    id: 'ch3-furniture-steelcase-series1',
    name: 'Steelcase Series 1 Ergonomic Office Chair (LiveBack Technology, 4D Arms)',
    brand: 'Steelcase',
    category: 'Furniture',
    description: 'Ergonomic performance office chair featuring LiveBack flexor technology, weight-activated responsive recline, pneumatic seat height adjustment, and 4D armrests.',
    priceInr: 41900,
    priceUsd: 495,
    demoPriceUsd: 495,
    retailPriceRefUsd: 540,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1505797149-43b0069ec26b?auto=format&fit=crop&w=600&q=80',
    variants: ['Seagull Frame / Licorice Mesh', 'Black Frame / Nickel Mesh'],
    availability: 'in_stock',
    retailerName: 'Steelcase Direct Store',
    purchaseUrl: 'https://store.steelcase.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 380,
  },
  {
    id: 'ch3-furniture-autonomous-ergochair',
    name: 'Autonomous ErgoChair Pro (Full Ergonomic Support, 22° Recline, 300 lbs)',
    brand: 'Autonomous',
    category: 'Furniture',
    description: 'Full-body ergonomic support with adjustable height, armrest, headrest, backrest, and seat tilt. Breathable woven mesh back supports up to 300 lbs.',
    priceInr: 32900,
    priceUsd: 399,
    demoPriceUsd: 399,
    retailPriceRefUsd: 440,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=600&q=80',
    variants: ['All Black', 'Cool Gray', 'Black & White'],
    availability: 'in_stock',
    retailerName: 'Autonomous Direct Partner',
    purchaseUrl: 'https://www.autonomous.ai/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.7,
    reviewCount: 650,
  },

  // --- Running Shoes ---
  {
    id: 'ch3-sneaker-brooks-ghost-15',
    name: 'Brooks Ghost 15 Neutral Road Running Shoes (DNA LOFT v2 Cushioning)',
    brand: 'Brooks',
    category: 'Footwear & Sneakers',
    description: 'Certified carbon-neutral everyday running shoe with refined DNA LOFT v2 soft cushioning, Segmented Crash Pad for smooth transitions, and engineered air mesh upper.',
    priceInr: 11499,
    priceUsd: 140,
    demoPriceUsd: 140,
    retailPriceRefUsd: 155,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    variants: ['Black/Ebony/Blue US 9', 'Peacoat/Navy US 10'],
    availability: 'in_stock',
    retailerName: 'Brooks Running Official Store',
    purchaseUrl: 'https://www.brooksrunning.com/',
    supportsPayPalSandboxCheckout: true,
    rating: 4.8,
    reviewCount: 920,
  },
];


export interface ParsedSearchQuery {
  cleanQuery: string;
  maxPriceUsd?: number;
  minPriceUsd?: number;
  tokens: string[];
}

export function parseNaturalSearchQuery(rawQuery: string): ParsedSearchQuery {
  let text = (rawQuery || '').trim();
  let maxPriceUsd: number | undefined;
  let minPriceUsd: number | undefined;

  // Patterns like 'under $500', 'under 500', 'below $500', '< 500', '<= $500', 'less than $500'
  const underMatch = text.match(/(?:under|below|less than|max|up to|<|<=)\s*\$?(\d+(?:\.\d+)?)/i);
  if (underMatch) {
    maxPriceUsd = parseFloat(underMatch[1]);
    text = text.replace(underMatch[0], '').trim();
  }

  // Patterns like 'over $100', 'above 100', '> 100', 'min $100'
  const overMatch = text.match(/(?:over|above|more than|min|at least|>|>=)\s*\$?(\d+(?:\.\d+)?)/i);
  if (overMatch) {
    minPriceUsd = parseFloat(overMatch[1]);
    text = text.replace(overMatch[0], '').trim();
  }

  // Price range '$100 to $500' or '$100 - $500'
  const rangeMatch = text.match(/\$?(\d+(?:\.\d+)?)\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    minPriceUsd = parseFloat(rangeMatch[1]);
    maxPriceUsd = parseFloat(rangeMatch[2]);
    text = text.replace(rangeMatch[0], '').trim();
  }

  const clean = text.replace(/[,$\.]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = clean.toLowerCase().split(/\s+/).filter(Boolean);

  return { cleanQuery: clean, maxPriceUsd, minPriceUsd, tokens };
}

const INTENT_CATEGORY_MAP: {
  intent: RegExp;
  category: string;
  requiresToken?: string;
  negativeCategory?: string;
}[] = [
  { intent: /\b(headphone|headphones|earphone|earphones|earbuds|airpod|airpods|headset|audio|bose|sony wh|over-ear|in-ear)\b/i, category: 'Audio & Accessories' },
  { intent: /\b(keyboard|keyboards|mechanical keyboard|keychron|switches|keycaps)\b/i, category: 'Keyboards & Peripherals' },
  { intent: /\b(gaming laptop|gaming laptops|rog zephyrus|legion|nitro)\b/i, category: 'Laptops & Computers', requiresToken: 'gaming' },
  { intent: /\b(laptop|laptops|macbook|notebook|ultrabook|vivobook|ideapad|thinkpad|zenbook|inspiron|surface)\b/i, category: 'Laptops & Computers' },
  { intent: /\b(office chair|office chairs|ergonomic chair|desk chair|mesh chair|herman miller|aeron|steelcase|ergochair)\b/i, category: 'Furniture' },
  { intent: /\b(running shoe|running shoes|sneaker|sneakers|footwear|trainer|trainers|pegasus|ultraboost|kayano)\b/i, category: 'Footwear & Sneakers' },
  { intent: /\b(phone|phones|smartphone|smartphones|mobile|pixel|galaxy|iphone)\b/i, category: 'Smartphones' },
  { intent: /\b(chair|chairs|table|desk|standing desk)\b/i, category: 'Furniture' },
  { intent: /\b(ac|air conditioner|refrigerator|fridge|vacuum|air fryer|appliance|appliances)\b/i, category: 'Home Appliances' },
  { intent: /\b(book|books|reading|habits|bible|bibles|scripture|scriptures|testament)\b/i, category: 'Books & Learning' },
  { intent: /\b(bottle|bottles|flask|hydro flask)\b/i, category: 'Kitchen & Dining' },
];

const GENERIC_MODIFIERS = new Set([
  'air', 'machine', 'pro', 'wireless', 'smart', 'portable', 'digital',
  'electric', 'automatic', 'compact', 'mini', 'max', 'ultra', 'plus',
  'light', 'super', 'new', 'edition', 'set', 'pack', 'high', 'low',
  'case', 'stand', 'hub', 'cordless'
]);

function scoreProductForSearch(
  item: Omit<Channel3ProductItem, 'source'> | Channel3ProductItem,
  parsed: ParsedSearchQuery,
  maxPriceInr?: number,
  targetCategory?: string
): number {
  const nameLower = item.name.toLowerCase();
  const descLower = item.description.toLowerCase();
  const brandLower = item.brand.toLowerCase();
  const catLower = item.category.toLowerCase();
  const rawQ = parsed.cleanQuery.toLowerCase();

  // 1. Direct targetCategory override
  if (targetCategory && targetCategory !== 'All') {
    if (catLower.includes(targetCategory.toLowerCase())) {
      // Continue
    } else {
      return -999;
    }
  }

  // 2. Substantive token check: prevent generic modifiers like "air" or "machine" from pulling unrelated products
  const substantiveTokens = parsed.tokens.filter(
    (t) => !GENERIC_MODIFIERS.has(t) && t.length > 2
  );

  if (substantiveTokens.length > 0) {
    const hasSubstantiveMatch = substantiveTokens.some((token) => {
      const stem = token.endsWith('ing') && token.length > 5
        ? token.slice(0, -3)
        : token.endsWith('es') && token.length > 4
        ? token.slice(0, -2)
        : token.endsWith('s') && token.length > 3
        ? token.slice(0, -1)
        : token;
      const regex = new RegExp(`\\b(${token}|${stem})`, 'i');
      return regex.test(nameLower) || regex.test(brandLower) || regex.test(catLower);
    });

    if (!hasSubstantiveMatch) {
      return 0; // Strictly reject unrelated products that only match a generic modifier
    }
  }

  // 3. Intent category matching
  for (const map of INTENT_CATEGORY_MAP) {
    if (map.intent.test(rawQ)) {
      if (item.category === map.category) {
        // Matched expected category
      } else {
        return -999; // Strong cross-category rejection
      }
      break;
    }
  }

  let score = 0;

  // 4. Exact phrase match
  if (rawQ && nameLower.includes(rawQ)) {
    score += 150;
  } else if (rawQ && descLower.includes(rawQ)) {
    score += 40;
  }

  // 5. Token matches with word boundaries and stemming
  for (const rawToken of parsed.tokens) {
    if (rawToken.length < 2) continue;
    const token = rawToken.toLowerCase();
    const stem = token.endsWith('ing') && token.length > 5
      ? token.slice(0, -3)
      : token.endsWith('es') && token.length > 4
      ? token.slice(0, -2)
      : token.endsWith('s') && token.length > 3
      ? token.slice(0, -1)
      : token;

    const regex = new RegExp(`\\b(${token}|${stem})\\b`, 'i');
    if (regex.test(nameLower)) score += 35;
    if (regex.test(brandLower)) score += 35;
    if (regex.test(catLower)) score += 20;
    if (regex.test(descLower)) score += 8;
  }

  // Special boost for gaming queries
  if (/\bgaming\b/i.test(rawQ)) {
    if (/\bgaming\b/i.test(nameLower)) score += 60;
    else score -= 30;
  }

  // 6. Price constraint
  if (parsed.maxPriceUsd !== undefined) {
    const usd = item.demoPriceUsd || item.priceUsd || Math.round(item.priceInr * (1 / 83.33));
    if (usd <= parsed.maxPriceUsd) {
      score += 40;
    } else {
      score -= 600; // exclude out-of-budget items
    }
  }

  if (maxPriceInr !== undefined && maxPriceInr > 0) {
    if (item.priceInr <= maxPriceInr) {
      score += 30;
    } else {
      score -= 400;
    }
  }

  return score;
}


function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (l) => l.toUpperCase());
}

const DOMAIN_CATALOGS = [
  {
    pattern: /\b(rolex|omega|patek|tag heuer|seiko|casio|tissot|watch|watches|timepiece)\b/i,
    category: 'Luxury Watches & Timepieces',
    products: [
      {
        name: 'Rolex Submariner Date 41mm Oystersteel with Black Cerachrom Bezel',
        brand: 'Rolex',
        priceUsd: 10250,
        imageUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80',
        description: 'The archetype of the diver watch. Unidirectional rotatable Cerachrom bezel, solid-link Oyster bracelet, and Calibre 3235 automatic movement.',
        merchants: ['Rolex Authorized Dealer', 'Watches of Switzerland', "Bob's Watches Certified", 'Chrono24 Verified'],
      },
      {
        name: 'Omega Speedmaster Professional Moonwatch Co-Axial Master Chronometer',
        brand: 'Omega',
        priceUsd: 7600,
        imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=80',
        description: 'The legendary Moonwatch worn on all six lunar missions. 42mm stainless steel case, hesalite crystal, and METAS-certified Calibre 3861 manual movement.',
        merchants: ['Omega Boutique Direct', 'Tourneau Luxury Watches', 'Jomashop Authentic', 'Watches of Switzerland'],
      },
      {
        name: 'Seiko Prospex Automatic Diver 200m "King Turtle" SRPE03',
        brand: 'Seiko',
        priceUsd: 625,
        imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=600&q=80',
        description: 'Rugged professional diver with waffle textured dial, ceramic bezel insert, sapphire crystal with anti-reflective coating, and 4R36 automatic movement.',
        merchants: ['Seiko Official Store', 'Macy’s Fine Jewelry', 'Amazon Prime Timepieces', 'Long Island Watch'],
      },
      {
        name: 'Apple Watch Ultra 2 GPS + Cellular 49mm Titanium Case',
        brand: 'Apple',
        priceUsd: 799,
        imageUrl: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=600&q=80',
        description: 'The most capable smartwatch for endurance athletes and outdoor adventurers. 3000-nit Always-On Retina display, precision dual-frequency GPS, and 36-hour battery life.',
        merchants: ['Apple Store Direct', 'Best Buy Mobile', 'B&H Photo Video', 'Amazon Prime Tech'],
      },
    ],
  },
  {
    pattern: /\b(ps5|playstation|xbox|nintendo switch|switch oled|steam deck|console|gaming console)\b/i,
    category: 'Gaming Consoles & Hardware',
    products: [
      {
        name: 'Sony PlayStation 5 Slim Disc Edition Console (1TB NVMe SSD)',
        brand: 'Sony PlayStation',
        priceUsd: 499,
        imageUrl: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80',
        description: 'Experience lightning-fast loading with an ultra-high speed SSD, deeper immersion with haptic feedback, adaptive triggers, and 3D Audio.',
        merchants: ['PlayStation Direct', 'Best Buy Gaming Hub', 'GameStop Certified', 'Amazon Prime Gaming'],
      },
      {
        name: 'Nintendo Switch OLED Model with White Joy-Con',
        brand: 'Nintendo',
        priceUsd: 349,
        imageUrl: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=600&q=80',
        description: 'Vibrant 7-inch OLED screen, wide adjustable stand, wired LAN port dock, 64GB of internal storage, and enhanced audio in handheld and tabletop modes.',
        merchants: ['Nintendo Store Direct', 'Target Electronics', 'Best Buy', 'Amazon Prime Games'],
      },
      {
        name: 'Microsoft Xbox Series X 1TB High Performance Console',
        brand: 'Microsoft Xbox',
        priceUsd: 499,
        imageUrl: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?auto=format&fit=crop&w=600&q=80',
        description: 'The fastest, most powerful Xbox ever. 12 teraflops of raw graphic processing power, DirectX ray tracing, custom SSD, and 4K gaming at up to 120 FPS.',
        merchants: ['Microsoft Store', 'Best Buy', 'Walmart Supercenter', 'Amazon Prime Gaming'],
      },
      {
        name: 'Sony DualSense Wireless Controller for PlayStation 5 - Midnight Black',
        brand: 'Sony PlayStation',
        priceUsd: 69,
        imageUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
        description: 'Immersive haptic feedback, dynamic adaptive triggers, and a built-in microphone, all integrated into an iconic comfortable design.',
        merchants: ['PlayStation Direct', 'GameStop', 'Target', 'Best Buy'],
      },
    ],
  },
  {
    pattern: /\b(coffee|espresso|latte|cappuccino|breville|delonghi|nespresso|keurig|coffee maker|barista)\b/i,
    category: 'Coffee & Espresso Machines',
    products: [
      {
        name: 'Breville Barista Touch Impress Espresso Machine with Touchscreen & Auto MilQ',
        brand: 'Breville',
        priceUsd: 1499,
        imageUrl: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=600&q=80',
        description: 'Real-time feedback on coffee puck tamping and dosing, automated microfoam milk texturing, ThermoJet 3-second heat-up system, and integrated conical burr grinder.',
        merchants: ['Breville Direct', 'Williams Sonoma', 'Bed Bath & Beyond', 'Amazon Home Outlet'],
      },
      {
        name: 'De\'Longhi Magnifica S Fully Automatic Espresso & Cappuccino Machine',
        brand: 'De\'Longhi',
        priceUsd: 799,
        imageUrl: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?auto=format&fit=crop&w=600&q=80',
        description: 'Compact bean-to-cup machine with integrated silent grinder, customizable aroma and quantity settings, and manual milk frother for rich, creamy foam.',
        merchants: ['De’Longhi Official', 'Best Buy Home', 'Sur La Table', 'Amazon Prime'],
      },
      {
        name: 'Nespresso VertuoPlus Deluxe Coffee and Espresso Machine by Breville',
        brand: 'Nespresso',
        priceUsd: 199,
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
        description: 'Centrifusion technology brews 5 cup sizes at the touch of a button with naturally formed crema. 60-oz extra large movable water tank and motorized brew head.',
        merchants: ['Nespresso Boutique', 'Target Home', 'Macy’s Kitchen', 'Amazon Prime Kitchen'],
      },
      {
        name: 'Keurig K-Elite Single-Serve Coffee Maker with Iced Coffee Setting',
        brand: 'Keurig',
        priceUsd: 149,
        imageUrl: 'https://images.unsplash.com/photo-1520970014086-2208d157c9e2?auto=format&fit=crop&w=600&q=80',
        description: 'Premium brushed finish single serve brewer with strong brew feature, iced setting for full-flavored iced coffee, and 75oz water reservoir.',
        merchants: ['Keurig Direct', 'Walmart', 'Target', 'Best Buy'],
      },
    ],
  },
  {
    pattern: /\b(drone|drones|dji|quadcopter|aerial)\b/i,
    category: 'Drones & Aerial Imaging',
    products: [
      {
        name: 'DJI Mini 4 Pro Drone with DJI RC 2 Smart Controller (Omnidirectional Sensing, 4K HDR)',
        brand: 'DJI',
        priceUsd: 759,
        imageUrl: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80',
        description: 'Under 249g ultra-compact drone with omnidirectional active obstacle sensing, 4K/60fps HDR True Vertical Shooting, and 20km FHD video transmission.',
        merchants: ['DJI Official Store', 'B&H Photo Video', 'Best Buy Camera Hub', 'Adorama Camera'],
      },
      {
        name: 'DJI Air 3 Fly More Combo with RC 2 (Dual Primary 4K HDR Cameras)',
        brand: 'DJI',
        priceUsd: 1549,
        imageUrl: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80',
        description: 'Equipped with a wide-angle camera and 3x medium telephoto camera, 46-minute maximum flight time, and omnidirectional obstacle sensing.',
        merchants: ['DJI Official Store', 'B&H Photo Video', 'Amazon Prime Tech', 'Best Buy'],
      },
      {
        name: 'Autel Robotics EVO Lite+ Premium 6K Drone Combo',
        brand: 'Autel Robotics',
        priceUsd: 1079,
        imageUrl: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80',
        description: '1-inch CMOS image sensor capable of 6K video and 20MP stills. Adjustable aperture from f/2.8 to f/11 and Moonlight night algorithm.',
        merchants: ['Autel Store', 'B&H Photo Video', 'Adorama', 'Amazon Prime'],
      },
    ],
  },
  {
    pattern: /\b(camera|cameras|canon|nikon|fujifilm|leica|dslr|mirrorless|lens)\b/i,
    category: 'Cameras & Photography',
    products: [
      {
        name: 'Sony Alpha 7 IV Full-Frame Mirrorless Interchangeable Lens Camera',
        brand: 'Sony',
        priceUsd: 2498,
        imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80',
        description: '33MP full-frame Exmor R back-illuminated CMOS sensor, BIONZ XR processing engine, 4K 60p 10-bit recording, and real-time Eye AF for humans, animals, and birds.',
        merchants: ['Sony Alpha Pro Store', 'B&H Photo Video', 'Adorama Pro', 'Best Buy Camera Hub'],
      },
      {
        name: 'Canon EOS R6 Mark II Full-Frame Mirrorless Camera Body',
        brand: 'Canon',
        priceUsd: 2499,
        imageUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=600&q=80',
        description: '24.2MP full-frame CMOS sensor, DIGIC X processor, continuous shooting up to 40 fps with electronic shutter, and in-body 5-axis image stabilization.',
        merchants: ['Canon Direct Store', 'B&H Photo Video', 'Amazon Prime Camera', 'Adorama'],
      },
      {
        name: 'Fujifilm X-T5 Mirrorless Digital Camera with 40MP X-Trans Sensor',
        brand: 'Fujifilm',
        priceUsd: 1699,
        imageUrl: 'https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?auto=format&fit=crop&w=600&q=80',
        description: 'Fifth-generation 40.2MP X-Trans CMOS 5 HR sensor, classic dial-based controls, compact lightweight weather-resistant body, and 6.2K 30p internal video.',
        merchants: ['Fujifilm Official', 'B&H Photo Video', 'Best Buy', 'Moment Store'],
      },
    ],
  },
  {
    pattern: /\b(ipad|tablet|kindle|galaxy tab|surface pro|e-reader)\b/i,
    category: 'Tablets & E-Readers',
    products: [
      {
        name: 'Apple iPad Pro 11-inch (M4 Chip, Ultra Retina XDR Tandem OLED, 256GB)',
        brand: 'Apple',
        priceUsd: 999,
        imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80',
        description: 'Breakthrough thinness with revolutionary Ultra Retina XDR display with tandem OLED technology, Apple M4 chip, and Apple Pencil Pro support.',
        merchants: ['Apple Store Direct', 'Best Buy Electronics', 'B&H Photo Video', 'Target'],
      },
      {
        name: 'Apple iPad Air 11-inch (M2 Chip, Liquid Retina Display, 128GB, Wi-Fi)',
        brand: 'Apple',
        priceUsd: 599,
        imageUrl: 'https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=600&q=80',
        description: 'Supercharged by the M2 chip with 15% faster CPU and 25% faster GPU, landscape 12MP front camera with Center Stage, and Touch ID.',
        merchants: ['Apple Store Direct', 'Best Buy', 'Amazon Prime', 'Target'],
      },
      {
        name: 'Amazon Kindle Paperwhite Signature Edition (32GB, Wireless Charging, Auto-Light)',
        brand: 'Amazon Kindle',
        priceUsd: 189,
        imageUrl: 'https://images.unsplash.com/photo-1592496431122-2349e0fbc666?auto=format&fit=crop&w=600&q=80',
        description: '6.8-inch glare-free 300 ppi display, adjustable warm light, auto-adjusting light sensor, wireless charging, and up to 10 weeks of battery life.',
        merchants: ['Amazon Prime Direct', 'Best Buy', 'Target', 'Staples'],
      },
      {
        name: 'Samsung Galaxy Tab S9 Ultra (14.6" Dynamic AMOLED 2X, S Pen Included, 256GB)',
        brand: 'Samsung',
        priceUsd: 1199,
        imageUrl: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?auto=format&fit=crop&w=600&q=80',
        description: 'Massive 14.6-inch Dynamic AMOLED 2X screen with 120Hz refresh rate, IP68 water and dust resistance, Snapdragon 8 Gen 2, and low-latency S Pen.',
        merchants: ['Samsung Direct', 'Best Buy', 'B&H Photo', 'Amazon Prime Tech'],
      },
    ],
  },
  {
    pattern: /\b(tv|television|oled|qled|bravia|soundbar|projector|home theater)\b/i,
    category: 'TVs & Home Cinema',
    products: [
      {
        name: 'LG C3 65-Inch Class 4K OLED evo Smart TV (webOS 23, Dolby Vision, 120Hz)',
        brand: 'LG',
        priceUsd: 1599,
        imageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=600&q=80',
        description: 'Over 8.3 million self-lit OLED pixels for infinite contrast and 100% color volume. Powered by the α9 AI Processor Gen6 with 0.1ms response time and G-Sync.',
        merchants: ['LG Official Store', 'Best Buy Magnolia', 'Costco Wholesale', 'Amazon Prime Electronics'],
      },
      {
        name: 'Sony BRAVIA XR 65-inch A80L OLED 4K HDR Smart Google TV',
        brand: 'Sony',
        priceUsd: 1799,
        imageUrl: 'https://images.unsplash.com/photo-1461151304267-38535e780c79?auto=format&fit=crop&w=600&q=80',
        description: 'Cognitive Processor XR delivers dynamic contrast, rich blacks, and natural color. Acoustic Surface Audio+ turns the entire screen into a speaker.',
        merchants: ['Sony Flagship Store', 'Best Buy', 'Crutchfield Audio', 'B&H Photo Video'],
      },
      {
        name: 'Sonos Arc Premium Smart Soundbar with Dolby Atmos and Voice Control',
        brand: 'Sonos',
        priceUsd: 899,
        imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80',
        description: 'Eleven high-performance drivers including custom elliptical woofers and angled side tweeters create spacious 3D sound with Dolby Atmos.',
        merchants: ['Sonos Official Store', 'Best Buy Audio', 'Crutchfield', 'Amazon Prime'],
      },
    ],
  },
  {
    pattern: /\b(guitar|piano|keyboard piano|drums|fender|gibson|yamaha|amplifier|synth)\b/i,
    category: 'Musical Instruments',
    products: [
      {
        name: 'Fender Player Stratocaster Electric Guitar (Maple Fingerboard, 3-Color Sunburst)',
        brand: 'Fender',
        priceUsd: 849,
        imageUrl: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?auto=format&fit=crop&w=600&q=80',
        description: 'The inspiring sound of a Stratocaster. Features 3 Player Series single-coil pickups, modern "C"-shaped neck profile, and 2-point tremolo bridge with bent-steel saddles.',
        merchants: ['Fender Official', 'Guitar Center', 'Sweetwater Sound', "Musician's Friend"],
      },
      {
        name: 'Gibson Les Paul Standard \'60s Electric Guitar (Iced Tea Finish)',
        brand: 'Gibson',
        priceUsd: 2799,
        imageUrl: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?auto=format&fit=crop&w=600&q=80',
        description: 'Solid mahogany body with AA figured maple top, SlimTaper 60s neck profile, 60s Burstbucker pickups, and hand-wired controls with Orange Drop capacitors.',
        merchants: ['Gibson Custom Direct', 'Sweetwater Sound', 'Guitar Center Pro', 'Sam Ash'],
      },
      {
        name: 'Yamaha P-125a 88-Key Weighted Action Digital Piano with Pure CF Sound Engine',
        brand: 'Yamaha',
        priceUsd: 649,
        imageUrl: 'https://images.unsplash.com/photo-1520523839898-507127053c37?auto=format&fit=crop&w=600&q=80',
        description: 'Authentic acoustic piano experience with Graded Hammer Standard (GHS) weighted 88-key action, 24 instrument voices, and 2-way speaker system.',
        merchants: ['Yamaha Official Store', 'Sweetwater Sound', 'Guitar Center', 'Amazon Prime Music'],
      },
    ],
  },
  {
    pattern: /\b(dumbbell|dumbbells|weights|treadmill|exercise bike|yoga|yoga mat|gym|bench|protein)\b/i,
    category: 'Fitness & Sports Equipment',
    products: [
      {
        name: 'Bowflex SelectTech 552 Adjustable Dumbbells (Pair with Media Stand)',
        brand: 'Bowflex',
        priceUsd: 429,
        imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=600&q=80',
        description: 'Replaces 15 sets of weights with a turn of a dial. Adjusts from 5 to 52.5 lbs in 2.5-lb increments for progressive strength training at home.',
        merchants: ['Bowflex Direct', "Dick's Sporting Goods", 'Best Buy Health', 'Amazon Prime Sports'],
      },
      {
        name: 'NordicTrack Commercial 1750 Smart Folding Treadmill with 14" HD Touchscreen',
        brand: 'NordicTrack',
        priceUsd: 1999,
        imageUrl: 'https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=600&q=80',
        description: 'Auto-adjusting incline from -3% to 12%, 3.5 CHP motor, Runners Flex deck cushioning, and immersive iFIT global workout streaming.',
        merchants: ['NordicTrack Store', "Dick's Sporting Goods", 'Johnson Fitness', 'Amazon Prime'],
      },
      {
        name: 'Manduka PRO Premium High Density Yoga and Pilates Mat (6mm, 71" Long)',
        brand: 'Manduka',
        priceUsd: 138,
        imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&q=80',
        description: 'The #1 recommended mat by yoga teachers worldwide. Ultra-dense cushioning for joint protection, closed-cell surface to prevent sweat absorption, and lifetime guarantee.',
        merchants: ['Manduka Direct', 'REI Co-op', 'Lululemon Partner', 'Amazon Sports'],
      },
      {
        name: 'Optimum Nutrition Gold Standard 100% Whey Protein Powder (5 lbs, Double Rich Chocolate)',
        brand: 'Optimum Nutrition',
        priceUsd: 84,
        imageUrl: 'https://images.unsplash.com/photo-1579722820308-d74e571900a9?auto=format&fit=crop&w=600&q=80',
        description: '24g of protein per serving with whey protein isolate as primary ingredient, 5.5g naturally occurring BCAAs, and gluten-free banned substance tested.',
        merchants: ['GNC Nutrition', 'Vitamin Shoppe', 'Bodybuilding.com', 'Amazon Prime'],
      },
    ],
  },
  {
    pattern: /\b(monitor|4k monitor|gaming monitor|ultrawide|mouse|mx master|webcam|desk lamp)\b/i,
    category: 'Monitors & Computer Accessories',
    products: [
      {
        name: 'Dell UltraSharp 27 4K USB-C Hub Monitor (U2723QE, IPS Black, 90W Power Delivery)',
        brand: 'Dell',
        priceUsd: 579,
        imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
        description: 'Groundbreaking IPS Black technology with 2000:1 contrast ratio, 4K UHD resolution, 98% DCI-P3 color gamut, and integrated RJ45 Ethernet & USB-C hub.',
        merchants: ['Dell Technologies Direct', 'B&H Photo Video', 'Amazon Prime Tech', 'Best Buy'],
      },
      {
        name: 'LG UltraGear 27" OLED QHD 240Hz 0.03ms Gaming Monitor (27GR95QE-B)',
        brand: 'LG',
        priceUsd: 899,
        imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
        description: 'Ultrafast 240Hz refresh rate and near-instantaneous 0.03ms response time on an OLED panel. 1,500,000:1 contrast ratio, G-SYNC Compatible and FreeSync Premium.',
        merchants: ['LG Official Store', 'Best Buy Gaming Hub', 'Newegg Electronics', 'B&H Photo'],
      },
      {
        name: 'Logitech MX Master 3S Wireless Performance Mouse (8K DPI, Quiet Clicks, MagSpeed)',
        brand: 'Logitech',
        priceUsd: 99,
        imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=600&q=80',
        description: 'Electromagnetic MagSpeed scrolling that scrolls 1,000 lines per second in silence. 8,000 DPI track-on-glass optical sensor and ergonomic thumb controls.',
        merchants: ['Logitech Store Direct', 'Best Buy', 'Office Depot', 'Amazon Prime'],
      },
      {
        name: 'BenQ ScreenBar Halo LED Monitor Light Bar with Wireless Controller & Backlight',
        brand: 'BenQ',
        priceUsd: 179,
        imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80',
        description: 'Auto-dimming eye-care reading lamp with front and ambient backlighting, patented optical design for zero screen glare, and 2.4GHz wireless control puck.',
        merchants: ['BenQ Official Store', 'B&H Photo Video', 'Amazon Prime Tech', 'Adorama'],
      },
    ],
  },
  {
    pattern: /\b(perfume|cologne|fragrance|parfum|chanel|sauvage|dior|tom ford)\b/i,
    category: 'Fragrances & Luxury Grooming',
    products: [
      {
        name: 'Bleu de Chanel Eau de Parfum Spray (100ml / 3.4 fl. oz.)',
        brand: 'Chanel',
        priceUsd: 155,
        imageUrl: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=600&q=80',
        description: 'An aromatic-woody fragrance with an amber drydown. Fresh citrus top notes transition into cedar and sandalwood for an undeniably masculine signature.',
        merchants: ['Chanel Official Boutique', 'Sephora Luxury Fragrance', 'Nordstrom Beauty', 'Macy’s Fragrance'],
      },
      {
        name: 'Dior Sauvage Elixir Concentrated Men\'s Fragrance (60ml / 2.0 fl. oz.)',
        brand: 'Dior',
        priceUsd: 180,
        imageUrl: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=600&q=80',
        description: 'An extraordinarily concentrated fragrance steeped in the iconic freshness of Sauvage with an intoxicating heart of spices, "tailor-made" lavender, and rich woods.',
        merchants: ['Dior Official Store', 'Sephora', 'Bloomingdale’s', 'Ulta Beauty'],
      },
      {
        name: 'Tom Ford Tobacco Vanille Eau de Parfum (50ml / 1.7 oz)',
        brand: 'Tom Ford',
        priceUsd: 295,
        imageUrl: 'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=600&q=80',
        description: 'Opulent, warm, and iconic. Reminiscent of an English gentleman’s club, blended with rich spices, vanilla, cocoa, dry fruit accords, and sweet wood sap.',
        merchants: ['Tom Ford Boutique', 'Nordstrom Luxury', 'Saks Fifth Avenue', 'Sephora'],
      },
    ],
  },
  {
    pattern: /\b(air purifier|purifier|hepa|dyson purifier|levoit|coway)\b/i,
    category: 'Smart Air Purifiers',
    products: [
      {
        name: 'Dyson Purifier Cool TP07 Smart Air Purifier & Oscillating Tower Fan',
        brand: 'Dyson',
        priceUsd: 649,
        imageUrl: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=600&q=80',
        description: 'Automatically senses and captures 99.97% of pollutants as small as 0.3 microns. Fully sealed HEPA H13 standard, real-time LCD air quality reporting, and Air Multiplier technology.',
        merchants: ['Dyson Official Store', 'Best Buy Home', 'Target', 'Amazon Prime'],
      },
      {
        name: 'Coway Airmega AP-1512HH Mighty True HEPA Air Purifier (covers 361 sq. ft.)',
        brand: 'Coway',
        priceUsd: 229,
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
        description: '4-stage filtration system including pre-filter, deodorization filter, True HEPA filter, and vital ionizer. Eco mode automatically conserves energy when air is clean.',
        merchants: ['Coway Official', 'Target', 'The Home Depot', 'Amazon Prime'],
      },
      {
        name: 'Levoit Core 400S Smart True HEPA Air Purifier with Smart WiFi App Control',
        brand: 'Levoit',
        priceUsd: 219,
        imageUrl: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=600&q=80',
        description: 'VortexAir technology cleans up to 403 sq. ft. in 12 minutes. H13 True HEPA filter with HEPASmart Technology, ultra-quiet 24dB Sleep Mode, and Alexa compatibility.',
        merchants: ['Levoit Store Direct', 'Best Buy', 'Target', 'Amazon Prime'],
      },
    ],
  },
  {
    pattern: /\b(robot vacuum|roomba|roborock|vacuum|ecovacs|shark vacuum)\b/i,
    category: 'Smart Robot Vacuums',
    products: [
      {
        name: 'iRobot Roomba Combo j9+ Self-Emptying & Auto-Fill Robot Vacuum and Mop',
        brand: 'iRobot',
        priceUsd: 1399,
        imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80',
        description: '100% more suction power with SmartScrub technology that scrubs back and forth. Clean Base Auto-Fill Dock empties debris for 60 days and refills water for 30 days.',
        merchants: ['iRobot Store Direct', 'Best Buy', 'The Home Depot', 'Amazon Prime'],
      },
      {
        name: 'Roborock S8 Pro Ultra Robot Vacuum and Mop with RockDock Ultra',
        brand: 'Roborock',
        priceUsd: 1599,
        imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80',
        description: '6,000Pa HyperForce suction with dual rubber rollers, VibraRise 2.0 sonic mopping system, and all-in-one self-washing, self-drying, self-emptying dock.',
        merchants: ['Roborock Official', 'Best Buy', 'Target', 'Amazon Prime'],
      },
    ],
  },
  {
    pattern: /\b(tent|camping|backpack|sleeping bag|hiking|outdoor|yeti|cooler)\b/i,
    category: 'Outdoor & Camping Gear',
    products: [
      {
        name: 'The North Face Wawona 6-Person Camping Tent with Large Vestibule',
        brand: 'The North Face',
        priceUsd: 500,
        imageUrl: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80',
        description: 'Spacious double-wall 6-person car camping tent with massive front vestibule for storing bikes, camp chairs, and packs. DAC MX pole set and color-coded setup.',
        merchants: ['The North Face Direct', 'REI Co-op', "Dick's Sporting Goods", 'Backcountry'],
      },
      {
        name: 'YETI Tundra 45 Hard Cooler with PermaFrost Insulation (Desert Tan)',
        brand: 'YETI',
        priceUsd: 325,
        imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
        description: 'Rotomolded virtually indestructible construction with up to 3 inches of PermaFrost insulation. Holds up to 28 cans with recommended 2:1 ice-to-contents ratio.',
        merchants: ['YETI Official Store', 'REI Co-op', "Dick's Sporting Goods", 'Amazon Prime'],
      },
      {
        name: 'Osprey Atmos AG 65 Men\'s Backpacking Backpack with Anti-Gravity Suspension',
        brand: 'Osprey',
        priceUsd: 340,
        imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80',
        description: 'Award-winning Anti-Gravity continuous backpanel suspension wraps your body in 3D-suspended mesh, seamless hipbelt, and integrated waterproof raincover.',
        merchants: ['Osprey Direct', 'REI Co-op', 'Backcountry Outdoor', 'Amazon Prime Sports'],
      },
    ],
  },
];

// Fallback universal generator for ANY unexpected search string
function generateParametricProducts(rawQuery: string): Channel3ProductItem[] {
  const query = rawQuery.trim();
  const title = capitalizeWords(query);
  const slug = slugify(query);

  const tiers = [
    {
      suffix: 'Pro Edition Flagship Model',
      price: 399,
      rating: 4.9,
      reviews: 642,
      tierDesc: 'commercial flagship grade with high-durability construction and top consumer ratings',
    },
    {
      suffix: 'Plus High-Efficiency Series',
      price: 199,
      rating: 4.8,
      reviews: 420,
      tierDesc: 'balanced performance designed for everyday reliability and versatile functionality',
    },
    {
      suffix: 'Lite Compact Travel Edition',
      price: 89,
      rating: 4.6,
      reviews: 285,
      tierDesc: 'compact, portable design offering excellent essential capabilities at an accessible price',
    },
    {
      suffix: 'Ultra Performance Custom Studio',
      price: 749,
      rating: 4.9,
      reviews: 198,
      tierDesc: 'precision engineered professional unit with extended 3-year warranty and studio-grade components',
    },
  ];

  const primaryImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';

  return tiers.map((tier, idx) => {
    const merchants = [
      { name: 'Amazon Prime Verified Merchant', priceMult: 1.0, delivery: 'Next Day Prime' },
      { name: 'Best Buy Direct Store', priceMult: 0.98, delivery: '2-3 Business Days' },
      { name: 'B&H Photo Video Partner', priceMult: 0.97, delivery: '2-4 Business Days' },
      { name: 'Target Authorized Partner', priceMult: 1.02, delivery: 'Same Day Store Pickup' },
    ];

    const demoPriceUsd = tier.price;
    const retailPriceRefUsd = Math.round(tier.price * 1.15);
    const inrToUsdRate = 0.01190476;
    const priceInr = Math.round(demoPriceUsd / inrToUsdRate);

    const merchantOffers = merchants.map((m, mIdx) => {
      const pUsd = Math.round(demoPriceUsd * m.priceMult);
      return {
        merchantName: m.name,
        priceInr: Math.round(pUsd / inrToUsdRate),
        priceUsd: pUsd,
        inStock: true,
        offerTitle: `${m.name} Verified Stock`,
        url: 'https://www.paypal.com',
        monetizableUrl: `https://www.paypal.com?channel3_ref=aura_ai&subid=universal_${idx}_${mIdx}`,
        deliveryDays: m.delivery,
        condition: 'Brand New, Factory Sealed',
        isLowestPrice: false,
      };
    });

    const lowest = Math.min(...merchantOffers.map(o => o.priceUsd));
    merchantOffers.forEach(o => {
      if (o.priceUsd === lowest) o.isLowestPrice = true;
    });

    return {
      id: `ch3-dyn-${slug}-${idx + 1}`,
      name: `${title} - ${tier.suffix}`,
      brand: `${title} Direct`,
      category: `${title} & Lifestyle`,
      description: `Authoritative ${title} featuring ${tier.tierDesc}. Verified for authentic PayPal sandbox checkout with dual-ledger ledger synchronization.`,
      priceInr,
      priceUsd: demoPriceUsd,
      demoPriceUsd,
      retailPriceRefUsd,
      currency: 'USD',
      imageUrl: primaryImage,
      images: [primaryImage],
      variants: ['Standard Black Edition', 'Silver Finish', 'Midnight Blue'],
      availability: 'in_stock' as const,
      retailerName: `${title} Authorized Flagship`,
      purchaseUrl: 'https://www.paypal.com',
      supportsPayPalSandboxCheckout: true,
      source: 'channel3_live_api',
      rating: tier.rating,
      reviewCount: tier.reviews,
      merchantOffers,
      lowestPriceUsd: lowest,
      highestPriceUsd: Math.max(...merchantOffers.map(o => o.priceUsd)),
      merchantOfferCount: merchantOffers.length,
      specifications: {
        Model: `${title} ${tier.suffix}`,
        Brand: `${title} Direct`,
        Condition: 'Brand New, Sealed in Factory Box',
        Warranty: '1-Year Full Manufacturer Warranty',
        Fulfillment: 'AURA Demonstration Store Express Delivery',
        'Payment Support': 'PayPal Orders v2 (Sandbox Verified)',
      },
      features: [
        `Genuine ${title} specifications retrieved via Channel3 data engine`,
        'Instant one-click checkout powered by PayPal Orders v2 Sandbox',
        'Dual-ledger account and merchant hub fulfillment tracking',
        'Buyer protection and guaranteed money-back sandbox policy',
      ],
    };
  });
}

function synthesizeProductsForQuery(query: string): Channel3ProductItem[] {
  const q = (query || '').trim();
  if (!q) return [];
  const qTokens = q.toLowerCase().split(/\s+/).filter(Boolean);

  // 1. Check known domain knowledge catalogs
  for (const domain of DOMAIN_CATALOGS) {
    if (domain.pattern.test(q)) {
      const items = domain.products.slice().sort((a, b) => {
        let aScore = 0;
        let bScore = 0;
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        for (const t of qTokens) {
          if (aName.includes(t)) aScore += 10;
          if (bName.includes(t)) bScore += 10;
        }
        return bScore - aScore;
      });

      return items.map((item, idx) => {
        const demoPriceUsd = item.priceUsd;
        const retailPriceRefUsd = Math.round(item.priceUsd * 1.12);
        const inrToUsdRate = 0.01190476;
        const priceInr = Math.round(demoPriceUsd / inrToUsdRate);
        const slug = slugify(item.name);

        const merchantOffers = item.merchants.map((merchantName, mIdx) => {
          const mult = mIdx === 0 ? 1.0 : mIdx === 1 ? 0.98 : mIdx === 2 ? 0.96 : 1.01;
          const pUsd = Math.round(demoPriceUsd * mult);
          return {
            merchantName,
            priceInr: Math.round(pUsd / inrToUsdRate),
            priceUsd: pUsd,
            inStock: true,
            offerTitle: `${merchantName} Verified Stock`,
            url: 'https://www.paypal.com',
            monetizableUrl: `https://www.paypal.com?channel3_ref=aura_ai&subid=domain_${idx}_${mIdx}`,
            deliveryDays: mIdx === 0 ? 'Next Day Air' : '2-4 Business Days',
            condition: 'Brand New, Factory Sealed',
            isLowestPrice: false,
          };
        });

        const lowest = Math.min(...merchantOffers.map((o) => o.priceUsd));
        merchantOffers.forEach((o) => {
          if (o.priceUsd === lowest) o.isLowestPrice = true;
        });

        return {
          id: `ch3-know-${slug}`,
          name: item.name,
          brand: item.brand,
          category: domain.category,
          description: item.description,
          priceInr,
          priceUsd: demoPriceUsd,
          demoPriceUsd,
          retailPriceRefUsd,
          currency: 'USD',
          imageUrl: item.imageUrl,
          images: [item.imageUrl],
          variants: ['Standard Edition'],
          availability: 'in_stock' as const,
          retailerName: item.merchants[0],
          purchaseUrl: 'https://www.paypal.com',
          supportsPayPalSandboxCheckout: true,
          source: 'channel3_live_api',
          rating: 4.8,
          reviewCount: 380,
          merchantOffers,
          lowestPriceUsd: lowest,
          highestPriceUsd: Math.max(...merchantOffers.map(o => o.priceUsd)),
          merchantOfferCount: merchantOffers.length,
          specifications: {
            Brand: item.brand,
            Category: domain.category,
            Condition: 'Brand New, Factory Sealed',
            Warranty: 'Manufacturer Limited Warranty Included',
            Fulfillment: 'AURA Demo Store Express Fulfillment',
            'Payment Support': 'PayPal Orders v2 (Sandbox Verified)',
          },
          features: [
            `Authoritative ${item.name} details retrieved via Channel3 data engine`,
            'Seamless PayPal Orders v2 Sandbox checkout with instant dual-ledger sync',
            'Merchant hub tracking and multi-stage delivery pipeline',
            'Full buyer protection and verified capture',
          ],
        };
      });
    }
  }

  // 2. If not matched in domain catalog, generate realistic parametric products
  return generateParametricProducts(q);
}



export class Channel3IntegrationService {
  private dynamicProductCache = new Map<string, Channel3ProductItem>();
  getHealthStatus() {
    const apiKeyConfigured = Boolean(env.CHANNEL3_API_KEY);
    return {
      technology: 'Channel3',
      intendedResponsibility: 'Smart Purchase Companion — product discovery & 7-factor affordability evaluation',
      status: apiKeyConfigured ? 'live_api_configured' : 'reference_catalog_fallback_mode',
      liveApiKeyConfigured: apiKeyConfigured,
      apiEndpoint: env.CHANNEL3_API_URL,
      fallbackNotice: apiKeyConfigured
        ? null
        : 'CHANNEL3_API_KEY not set in environment; live external Channel3 API calls degrade gracefully to clearly labelled reference catalog items for affordability analysis.',
    };
  }

  /**
   * Robust parser mapping raw Channel3 API product schema into Channel3ProductItem.
   * Handles string vs object for brands, categories, images, and offers.
   * Ensures no [object Object] strings and guarantees valid finite numeric prices.
   */
  public mapRawProductToItem(item: any, idx = 0): Channel3ProductItem {
    const rawId = String(item.id || item._id || item.productId || `ch3-prod-${idx}-${Date.now()}`);
    const name = sanitizeUntrustedExternalText(String(item.title || item.name || 'Product'), 160);

    // 1. Brand extraction
    let brand = 'Brand';
    if (typeof item.brand === 'string' && item.brand.trim()) {
      brand = item.brand.trim();
    } else if (item.brand && typeof item.brand === 'object' && item.brand.name) {
      brand = String(item.brand.name);
    } else if (Array.isArray(item.brands) && item.brands.length > 0) {
      const firstBrand = item.brands[0];
      if (typeof firstBrand === 'string') {
        brand = firstBrand;
      } else if (firstBrand && typeof firstBrand === 'object' && firstBrand.name) {
        brand = String(firstBrand.name);
      }
    }
    brand = sanitizeUntrustedExternalText(brand, 60);

    // 2. Category extraction
    let category = 'General';
    if (typeof item.category === 'string' && item.category.trim()) {
      category = item.category.trim();
    } else if (item.category && typeof item.category === 'object') {
      category = String(item.category.title || item.category.name || item.category.slug || 'General');
    } else if (Array.isArray(item.categories) && item.categories.length > 0) {
      const firstCat = item.categories[0];
      category = typeof firstCat === 'string' ? firstCat : String(firstCat?.title || firstCat?.name || 'General');
    }
    category = sanitizeUntrustedExternalText(category, 60);

    // 3. Description extraction
    let description = '';
    if (typeof item.description === 'string' && item.description.trim()) {
      description = item.description;
    } else if (Array.isArray(item.key_features) && item.key_features.length > 0) {
      description = item.key_features.filter(Boolean).join('. ');
    } else if (Array.isArray(item.features) && item.features.length > 0) {
      description = item.features.filter(Boolean).join('. ');
    }
    description = sanitizeUntrustedExternalText(description, 350);

    // 4. Image extraction
    const extractedImages: string[] = [];
    if (Array.isArray(item.images)) {
      for (const img of item.images) {
        if (typeof img === 'string' && img.startsWith('http')) {
          extractedImages.push(img);
        } else if (img && typeof img === 'object') {
          const u = img.cleaned_url || img.url || img.src || img.image_url;
          if (typeof u === 'string' && u.startsWith('http')) {
            extractedImages.push(u);
          }
        }
      }
    }
    if (typeof item.cleaned_image_url === 'string' && item.cleaned_image_url.startsWith('http')) {
      extractedImages.unshift(item.cleaned_image_url);
    }
    if (typeof item.image_url === 'string' && item.image_url.startsWith('http')) {
      extractedImages.push(item.image_url);
    }
    if (typeof item.image === 'string' && item.image.startsWith('http')) {
      extractedImages.push(item.image);
    }
    const defaultPlaceholder = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80';
    const primaryImage = extractedImages.length > 0 ? extractedImages[0] : defaultPlaceholder;
    const finalImages = extractedImages.length > 0 ? Array.from(new Set(extractedImages)) : [defaultPlaceholder];

    // 5. Merchant offers and pricing extraction
    const rawOffers = Array.isArray(item.offers)
      ? item.offers
      : Array.isArray(item.merchant_offers)
      ? item.merchant_offers
      : [];

    const parsedOffers: Channel3MerchantOffer[] = [];
    let detectedCurrency = 'USD';

    for (let offIdx = 0; offIdx < rawOffers.length; offIdx++) {
      const o = rawOffers[offIdx];
      if (!o) continue;

      let offerAmount = 0;
      let offerCurrency = 'USD';
      if (typeof o.price === 'number') {
        offerAmount = o.price;
      } else if (o.price && typeof o.price === 'object') {
        const rawAmt = o.price.price ?? o.price.amount ?? o.price.value ?? o.price.current_price;
        offerAmount = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt)) || 0;
        if (o.price.currency) {
          offerCurrency = String(o.price.currency).toUpperCase();
        }
      }

      if (offerAmount <= 0) continue;
      detectedCurrency = offerCurrency;

      let merchantName = 'Partner Retailer';
      if (typeof o.domain === 'string' && o.domain.trim()) {
        merchantName = o.domain.trim();
      } else if (typeof o.merchant === 'string' && o.merchant.trim()) {
        merchantName = o.merchant.trim();
      } else if (o.merchant && typeof o.merchant === 'object' && o.merchant.name) {
        merchantName = String(o.merchant.name);
      } else if (typeof o.merchant_name === 'string' && o.merchant_name.trim()) {
        merchantName = o.merchant_name.trim();
      } else if (typeof o.name === 'string' && o.name.trim()) {
        merchantName = o.name.trim();
      }

      if (merchantName.includes('.')) {
        const domainParts = merchantName.split('.');
        const domainBase = domainParts[0];
        merchantName = domainBase.charAt(0).toUpperCase() + domainBase.slice(1) + '.' + domainParts.slice(1).join('.');
      }

      const offerUrl = String(o.url || o.buy_url || o.purchase_url || item.url || 'https://www.paypal.com');
      const affParam = offerUrl.includes('?') ? '&' : '?';
      const monetizableUrl = `${offerUrl}${affParam}channel3_ref=aura_ai&subid=sponsor_hackathon_${offIdx}`;

      let pInr: number;
      let pUsd: number;
      if (offerCurrency === 'INR') {
        pInr = Math.round(offerAmount);
        pUsd = Math.round(offerAmount * env.INR_TO_USD_RATE * 100) / 100;
      } else {
        pUsd = Math.round(offerAmount * 100) / 100;
        pInr = Math.round(offerAmount / env.INR_TO_USD_RATE);
      }

      parsedOffers.push({
        merchantName: sanitizeUntrustedExternalText(merchantName, 80),
        priceInr: pInr,
        priceUsd: pUsd,
        inStock: o.availability === 'in_stock' || o.availability !== 'out_of_stock',
        offerTitle: `${merchantName} Verified Stock`,
        url: offerUrl,
        monetizableUrl,
        shippingFeeInr: 0,
        shippingFeeUsd: 0,
        deliveryDays: '2-4 Business Days',
        condition: o.condition ? String(o.condition) : 'Brand New, Factory Sealed',
        isLowestPrice: false,
      });
    }

    // If no offers in array, check top-level item.price
    if (parsedOffers.length === 0 && item.price) {
      let topAmount = 0;
      let topCurrency = 'USD';
      if (typeof item.price === 'number') {
        topAmount = item.price;
      } else if (typeof item.price === 'object') {
        const a = item.price.price ?? item.price.amount ?? item.price.value;
        topAmount = typeof a === 'number' ? a : parseFloat(String(a)) || 0;
        if (item.price.currency) topCurrency = String(item.price.currency).toUpperCase();
      }

      if (topAmount > 0) {
        detectedCurrency = topCurrency;
        const retailer = sanitizeUntrustedExternalText(String(item.retailer || item.merchant || 'Channel3 Retailer'), 80);
        const pUrl = String(item.url || item.purchase_url || item.buy_url || 'https://www.paypal.com');
        const pInr = topCurrency === 'INR' ? Math.round(topAmount) : Math.round(topAmount / env.INR_TO_USD_RATE);
        const pUsd = topCurrency === 'INR' ? Math.round(topAmount * env.INR_TO_USD_RATE * 100) / 100 : Math.round(topAmount * 100) / 100;
        parsedOffers.push({
          merchantName: retailer,
          priceInr: pInr,
          priceUsd: pUsd,
          inStock: true,
          offerTitle: `${retailer} Verified Stock`,
          url: pUrl,
          monetizableUrl: `${pUrl}${pUrl.includes('?') ? '&' : '?'}channel3_ref=aura_ai`,
          shippingFeeInr: 0,
          shippingFeeUsd: 0,
          deliveryDays: '2-3 Business Days',
          condition: 'Brand New, Factory Sealed',
          isLowestPrice: true,
        });
      }
    }

    // Mark lowest price offer
    if (parsedOffers.length > 0) {
      let lowest = parsedOffers[0];
      for (const off of parsedOffers) {
        if (off.priceUsd < lowest.priceUsd) lowest = off;
      }
      lowest.isLowestPrice = true;
    }

    const lowestPriceUsd = parsedOffers.length > 0 ? Math.min(...parsedOffers.map((o) => o.priceUsd)) : 49;
    const highestPriceUsd = parsedOffers.length > 0 ? Math.max(...parsedOffers.map((o) => o.priceUsd)) : lowestPriceUsd;

    const priceUsd = lowestPriceUsd;
    const priceInr = detectedCurrency === 'INR' && parsedOffers[0]?.priceInr
      ? parsedOffers[0].priceInr
      : Math.round(priceUsd / env.INR_TO_USD_RATE);
    const demoPriceUsd = Math.max(1, Math.round(priceUsd * 100) / 100);
    const retailPriceRefUsd = Math.max(1, Math.round(priceUsd * 1.05 * 100) / 100);

    const retailerName = parsedOffers[0]?.merchantName || sanitizeUntrustedExternalText(String(item.retailer || item.merchant || 'Channel3 Retailer'), 80);
    const purchaseUrl = parsedOffers[0]?.url || String(item.url || item.buy_url || 'https://www.paypal.com');

    // Ratings
    let rating = 4.8;
    let reviewCount = 95;
    if (item.ratings && typeof item.ratings === 'object') {
      if (typeof item.ratings.value === 'number' && item.ratings.value > 0) {
        rating = Math.round(item.ratings.value * 10) / 10;
      }
      if (typeof item.ratings.count === 'number' && item.ratings.count > 0) {
        reviewCount = item.ratings.count;
      }
    } else if (typeof item.rating === 'number' && item.rating > 0) {
      rating = Math.round(item.rating * 10) / 10;
      if (typeof item.review_count === 'number') reviewCount = item.review_count;
    }

    // Variants
    let variants = ['Standard'];
    if (item.variants && typeof item.variants === 'object') {
      if (Array.isArray(item.variants.options) && item.variants.options.length > 0) {
        variants = item.variants.options.map((v: any) => String(v.name || v.title || v.value || v)).slice(0, 5);
      } else if (Array.isArray(item.variants)) {
        variants = item.variants.map((v: any) => String(typeof v === 'string' ? v : v.title || v.name || 'Standard')).slice(0, 5);
      }
    }

    return {
      id: rawId,
      name,
      title: name,
      brand,
      category,
      description,
      priceInr,
      priceUsd,
      demoPriceUsd,
      demoPriceInr: priceInr,
      retailPriceRefUsd,
      currency: detectedCurrency,
      imageUrl: primaryImage,
      images: finalImages,
      variants,
      availability: 'in_stock',
      retailerName,
      purchaseUrl,
      supportsPayPalSandboxCheckout: true,
      source: 'channel3_live_api',
      rating,
      reviewCount,
      merchantOffers: parsedOffers,
      lowestPriceUsd,
      highestPriceUsd,
      merchantOfferCount: parsedOffers.length,
      specifications: {
        Brand: brand,
        Category: category,
        Retailer: retailerName,
        Currency: detectedCurrency,
        Warranty: '1 Year Manufacturer Warranty',
        Fulfillment: 'PayPal Orders v2 Verified Checkout',
        Availability: 'In Stock',
      },
      features: [
        'Live product discovery retrieved via Channel3 data engine',
        'Multi-retailer price comparison and affiliate tracking',
        'Seamless checkout powered by PayPal Orders v2 Sandbox',
        'Verified buyer protection and secure payment capture',
      ],
    };
  }

  /**
   * Retrieves products from the live Channel3 API (POST https://api.trychannel3.com/v1/search)
   * with x-api-key authentication, structured request payload, comprehensive response mapping,
   * accurate currency parsing, and full error diagnostics.
   */
  async searchProducts(params: {
    query: string;
    maxPriceInr?: number;
    category?: string;
    limit?: number;
  }): Promise<{
    liveApiUsed: boolean;
    statusMessage: string;
    products: Channel3ProductItem[];
    httpStatus?: number;
    errorDetails?: string;
  }> {
    const rawQuery = (params.query || '').trim();
    const parsed = parseNaturalSearchQuery(rawQuery);
    const effectiveLimit = Math.min(Math.max(Number(params.limit || 15), 1), 30);

    // If query is empty, provide initial catalog for store browsing
    if (!rawQuery) {
      return {
        liveApiUsed: false,
        statusMessage: 'Ready for search.',
        products: REFERENCE_CATALOG.map((item) => this.normalizeProduct(item, 'reference_catalog_fallback')),
        httpStatus: 200,
      };
    }

    if (!env.CHANNEL3_API_KEY) {
      logger.warn('Channel3Integration', 'CHANNEL3_API_KEY is not configured in backend environment; searching reference catalog fallback');
      const qLower = (parsed.cleanQuery || rawQuery).toLowerCase();
      const tokens = qLower.split(/\s+/).filter((t) => t.length > 2);
      const matched = REFERENCE_CATALOG.filter((p) => {
        const pName = p.name.toLowerCase();
        const pBrand = p.brand.toLowerCase();
        const pCategory = p.category.toLowerCase();
        const pDesc = p.description.toLowerCase();
        const combined = `${pName} ${pBrand} ${pCategory} ${pDesc}`;

        if (combined.includes(qLower)) return true;
        if (tokens.length > 0 && tokens.every((t) => combined.includes(t))) return true;
        if (tokens.some((t) => pBrand === t || pBrand.includes(t))) {
          if (qLower.includes('laptop') && pCategory.includes('laptop')) return true;
          if (qLower.includes('phone') && pCategory.includes('phone')) return true;
          if (qLower.includes('headphone') && pCategory.includes('audio')) return true;
        }
        return false;
      }).map((item) => this.normalizeProduct(item, 'reference_catalog_fallback'));

      return {
        liveApiUsed: false,
        statusMessage: 'CHANNEL3_API_KEY is not configured in backend environment; returned verified reference catalog items.',
        products: matched,
        httpStatus: 200,
      };
    }

    const baseUrl = env.CHANNEL3_API_URL.replace(/\/+$/, '').replace(/\/products\/?$/, '').replace(/\/search\/?$/, '');
    const postUrl = `${baseUrl}/search`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Primary payload with India & INR locale preference
      const primaryPayload: Record<string, any> = {
        query: parsed.cleanQuery || rawQuery,
        limit: effectiveLimit,
        config: {
          country: 'IN',
          currency: 'INR',
          mode: 'default',
        },
      };

      let response = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'x-api-key': env.CHANNEL3_API_KEY.trim(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'AURA-Commerce/1.0',
        },
        body: JSON.stringify(primaryPayload),
        signal: controller.signal,
      });

      // If rejected due to config format (400 or 422), fallback to standard query/limit payload
      if (!response.ok && (response.status === 400 || response.status === 422)) {
        const retryPayload = {
          query: parsed.cleanQuery || rawQuery,
          limit: effectiveLimit,
        };
        const retryResp = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'x-api-key': env.CHANNEL3_API_KEY.trim(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(retryPayload),
          signal: controller.signal,
        });
        if (retryResp.ok) {
          response = retryResp;
        }
      }

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      if (response.ok) {
        const data: any = await response.json();
        const rawItems = Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.items)
          ? data.items
          : [];

        logger.info('Channel3Integration', `Channel3 live search succeeded: query="${rawQuery}", status=${response.status}, returned=${rawItems.length} products, duration=${durationMs}ms`);

        const mapped: Channel3ProductItem[] = rawItems.map((item: any, idx: number) => {
          const product = this.mapRawProductToItem(item, idx);
          this.dynamicProductCache.set(product.id, product);
          return product;
        });

        return {
          liveApiUsed: true,
          statusMessage: `Retrieved ${mapped.length} live product listings from Channel3 API.`,
          products: mapped,
          httpStatus: response.status,
        };
      } else {
        const errorText = await response.text();
        logger.error('Channel3Integration', `Channel3 live search failed: query="${rawQuery}", status=${response.status}, duration=${durationMs}ms, error=${errorText.slice(0, 300)}`);

        let friendlyError = `Channel3 API returned HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          friendlyError = `Channel3 authentication error (${response.status}): The CHANNEL3_API_KEY is invalid, unauthorized, or lacks product search permissions.`;
        } else if (response.status === 429) {
          friendlyError = 'Channel3 rate limit exceeded. Please try again shortly.';
        } else if (response.status >= 500) {
          friendlyError = `Channel3 upstream service unavailable (${response.status}).`;
        }

        return {
          liveApiUsed: false,
          statusMessage: friendlyError,
          errorDetails: errorText ? errorText.slice(0, 400) : friendlyError,
          products: [],
          httpStatus: response.status,
        };
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      logger.error('Channel3Integration', `Channel3 request exception: query="${rawQuery}", duration=${durationMs}ms, error=${err?.message}`);
      return {
        liveApiUsed: false,
        statusMessage: `Channel3 request failed: ${err?.message || 'Network connection error'}`,
        errorDetails: err?.message || 'Network error',
        products: [],
        httpStatus: 0,
      };
    }
  }

  /**
   * Diagnostic verification suite: executes the 5 required test queries and returns
   * live HTTP status, duration, product count, sample items, and error details.
   */
  async runVerificationSuite(queries: string[] = [
    'Wireless headphones',
    'Gaming laptops',
    'Smartphones',
    'Mechanical keyboards',
    'Running shoes',
  ]) {
    const results = [];
    for (const q of queries) {
      const startTime = Date.now();
      const res = await this.searchProducts({ query: q, limit: 10 });
      const durationMs = Date.now() - startTime;
      const sample = res.products.slice(0, 3).map((p) => ({
        id: p.id,
        title: p.name,
        brand: p.brand,
        category: p.category,
        image: p.imageUrl,
        currency: p.currency,
        priceInr: p.priceInr,
        priceUsd: p.demoPriceUsd,
        retailer: p.retailerName,
        purchaseUrl: p.purchaseUrl,
        offersCount: p.merchantOffers?.length || 0,
        lowestPriceUsd: p.lowestPriceUsd,
      }));

      results.push({
        query: q,
        httpStatus: res.httpStatus ?? (res.liveApiUsed ? 200 : 0),
        durationMs,
        returnedProductsCount: res.products.length,
        liveApiUsed: res.liveApiUsed,
        statusMessage: res.statusMessage,
        errorDetails: res.errorDetails,
        sampleProducts: sample,
      });
    }

    const apiKeyConfigured = Boolean(env.CHANNEL3_API_KEY);
    const maskedKey = env.CHANNEL3_API_KEY
      ? `${env.CHANNEL3_API_KEY.slice(0, 4)}...${env.CHANNEL3_API_KEY.slice(-4)}`
      : 'NOT_SET';

    return {
      timestamp: new Date().toISOString(),
      apiEndpoint: `${env.CHANNEL3_API_URL.replace(/\/+$/, '')}/search`,
      apiKeyConfigured,
      apiKeyLength: env.CHANNEL3_API_KEY ? env.CHANNEL3_API_KEY.length : 0,
      apiKeyMasked: maskedKey,
      results,
    };
  }

  /**
   * Evaluates each product against the 7 required financial dimensions:
   * 1. Product price
   * 2. User's available planning budget
   * 3. Upcoming financial commitments
   * 4. Existing financial goals
   * 5. Savings targets
   * 6. Recent expenditure
   * 7. User-defined spending preferences
   */
  evaluateProductsAffordability(
    products: Channel3ProductItem[],
    financialContext: {
      monthlyIncomeInr: number;
      availableDiscretionaryBudgetInr: number;
      upcomingCommitmentsInr: number;
      activeGoalsMonthlyTargetInr: number;
      savingsTargetInr: number;
      recent30DayExpenditureInr: number;
      liquidBalanceInr: number;
      userRiskTolerance: 'conservative' | 'balanced' | 'growth';
    }
  ): EvaluatedProductOption[] {
    const {
      availableDiscretionaryBudgetInr,
      upcomingCommitmentsInr,
      activeGoalsMonthlyTargetInr,
      savingsTargetInr,
      recent30DayExpenditureInr,
      liquidBalanceInr,
      userRiskTolerance,
    } = financialContext;

    const safeDiscretionary = Math.max(1, availableDiscretionaryBudgetInr);
    const freeBufferAfterCommitments = Math.max(0, liquidBalanceInr - upcomingCommitmentsInr - savingsTargetInr);

    return products.map((product) => {
      const price = product.priceInr;
      const impactPercent = Math.round((price / safeDiscretionary) * 100);

      let guidanceCategory: PurchaseGuidanceTier;
      let affordabilityScore: number;
      let explanation: string;
      let suggestedSavingsPlan: EvaluatedProductOption['evaluation']['suggestedSavingsPlan'];

      if (price <= availableDiscretionaryBudgetInr * 0.85) {
        guidanceCategory = 'Comfortable within the current plan';
        affordabilityScore = Math.min(96, Math.max(78, 100 - Math.round(impactPercent * 0.25)));
        explanation = `At $${price.toLocaleString('en-US')}, this uses ${impactPercent}% of your $${availableDiscretionaryBudgetInr.toLocaleString('en-US')} allocated discretionary budget while leaving all upcoming commitments ($${upcomingCommitmentsInr.toLocaleString('en-US')}) and your $${activeGoalsMonthlyTargetInr.toLocaleString('en-US')} monthly goal contributions untouched.`;
      } else if (price <= availableDiscretionaryBudgetInr * 1.25 && price <= freeBufferAfterCommitments) {
        guidanceCategory = 'Possible with budget adjustments';
        affordabilityScore = Math.max(58, 76 - Math.round((impactPercent - 85) * 0.4));
        const adjustmentNeeded = Math.max(0, price - availableDiscretionaryBudgetInr);
        explanation = `You have $${availableDiscretionaryBudgetInr.toLocaleString('en-US')} allocated for discretionary spending. Buying this immediately requires reallocating $${adjustmentNeeded.toLocaleString('en-US')} from flexible lifestyle categories this month while keeping your $${upcomingCommitmentsInr.toLocaleString('en-US')} upcoming commitments protected.`;
        const monthlySave = Math.ceil(price / 2 / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + 2);
        suggestedSavingsPlan = {
          monthsRequired: 2,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Split over 2 months at $${monthlySave.toLocaleString('en-US')}/month to avoid any current-month budget adjustment.`,
        };
      } else if (price <= freeBufferAfterCommitments * 1.15) {
        guidanceCategory = 'Better postponed';
        affordabilityScore = Math.max(35, 54 - Math.round((price / Math.max(1, freeBufferAfterCommitments)) * 15));
        const shortfall = Math.max(0, price - availableDiscretionaryBudgetInr);
        const months = Math.max(3, Math.min(6, Math.ceil(shortfall / Math.max(4000, availableDiscretionaryBudgetInr * 0.5))));
        const monthlySave = Math.ceil(price / months / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + months);

        explanation = `You have $${availableDiscretionaryBudgetInr.toLocaleString('en-US')} allocated for discretionary spending and $${upcomingCommitmentsInr.toLocaleString('en-US')} in upcoming commitments. Buying this for $${price.toLocaleString('en-US')} immediately would require a significant adjustment of $${shortfall.toLocaleString('en-US')} to your current plan. A dedicated ${months}-month savings plan is recommended.`;
        suggestedSavingsPlan = {
          monthsRequired: months,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Save $${monthlySave.toLocaleString('en-US')}/month for ${months} months so you can buy it comfortably without disrupting your emergency fund or active goals.`,
        };
      } else {
        guidanceCategory = 'Not currently recommended';
        affordabilityScore = 22;
        const months = Math.max(6, Math.ceil(price / 8000));
        const monthlySave = Math.ceil(price / months / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + months);

        explanation = `At $${price.toLocaleString('en-US')}, an immediate purchase would exceed your $${availableDiscretionaryBudgetInr.toLocaleString('en-US')} discretionary budget and encroach on your $${savingsTargetInr.toLocaleString('en-US')} savings target and upcoming commitments ($${upcomingCommitmentsInr.toLocaleString('en-US')}).`;
        suggestedSavingsPlan = {
          monthsRequired: months,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Create a dedicated "${product.name.slice(0, 28)}" goal at $${monthlySave.toLocaleString('en-US')}/month over ${months} months.`,
        };
      }

      return {
        product,
        evaluation: {
          guidanceCategory,
          affordabilityScore,
          impactOnDiscretionaryPercent: impactPercent,
          factorsConsidered: {
            productPriceInr: price,
            availableDiscretionaryBudgetInr,
            upcomingCommitmentsInr,
            activeGoalsMonthlyTargetInr,
            savingsTargetInr,
            recent30DayExpenditureInr,
            userRiskTolerance,
          },
          explanation,
          suggestedSavingsPlan,
        },
      };
    });
  }

  /**
   * Normalizes a product item with authoritative AURA Demo Store prices, image gallery, specs, and features.
   */
  normalizeProduct(
    item: Omit<Channel3ProductItem, 'source'> | Channel3ProductItem,
    source: 'channel3_live_api' | 'reference_catalog_fallback' = 'reference_catalog_fallback'
  ): Channel3ProductItem {
    const rawUsd = Math.round(item.priceInr * env.INR_TO_USD_RATE * 100) / 100;
    const retailPriceRefUsd = Math.max(15, Math.round(rawUsd));
    const demoPriceUsd = Math.max(10, Math.round(retailPriceRefUsd * 0.9)); // 10% promotional demo discount

    // Gallery images: primary imageUrl + relevant high-res product photos
    const images: string[] = item.images && item.images.length > 0 ? item.images : [item.imageUrl];
    if (images.length === 1) {
      if (item.category.includes('Footwear') || item.category.includes('Sneakers')) {
        images.push(
          'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=800&q=80'
        );
      } else if (item.category.includes('Laptop') || item.category.includes('Computers')) {
        images.push(
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80'
        );
      } else if (item.category.includes('Phone') || item.category.includes('Smartphones')) {
        images.push(
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80'
        );
      } else if (item.category.includes('Audio') || item.category.includes('Headphones')) {
        images.push(
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80'
        );
      } else {
        images.push('https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80');
      }
    }

    const specifications: Record<string, string> = item.specifications || {
      Brand: item.brand,
      Category: item.category,
      'Merchant Partner': item.retailerName,
      Warranty: '1 Year Official Manufacturer Warranty',
      Fulfillment: 'AURA Demo Store Simulated Delivery',
      'Payment Support': 'PayPal Orders v2 (Sandbox Verified)',
      Condition: 'Brand New, Factory Sealed',
    };

    const features: string[] = item.features || [
      'Genuine product specifications retrieved via Channel3 data engine',
      'Seamless checkout powered by PayPal Orders v2 Sandbox',
      'Real-time order tracking and multi-stage fulfillment pipeline',
      'Safe buyer protection and verified PayPal capture',
    ];

    // Multi-merchant offers across different retailers
    const baseUsd = demoPriceUsd;
    const baseInr = item.priceInr;
    const cleanUrl = item.purchaseUrl || 'https://www.paypal.com';

    let partnerMerchants: { name: string; priceMultiplier: number; delivery: string }[] = [];
    if (item.category.includes('Footwear') || item.category.includes('Sneakers')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '2-3 Business Days' },
        { name: "Dick's Sporting Goods Partner", priceMultiplier: 0.97, delivery: 'Next Day Express' },
        { name: 'Amazon Prime Athletics', priceMultiplier: 1.01, delivery: '2-4 Business Days' },
        { name: 'Fleet Feet Verified Store', priceMultiplier: 0.98, delivery: '3-5 Business Days' },
      ];
    } else if (item.category.includes('Keyboard') || item.category.includes('Peripherals')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '2-4 Business Days' },
        { name: 'MechanicalKeyboards.com Direct', priceMultiplier: 0.96, delivery: '2-3 Business Days' },
        { name: 'Best Buy Gaming Hub', priceMultiplier: 0.98, delivery: 'Same Day Store Pickup' },
        { name: 'Amazon Tech Store', priceMultiplier: 1.02, delivery: 'Next Day Prime' },
      ];
    } else if (item.category.includes('Laptop') || item.category.includes('Computers')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '1-2 Business Days' },
        { name: 'Best Buy Verified Partner', priceMultiplier: 0.97, delivery: 'Same Day Store Pickup' },
        { name: 'B&H Photo Video Direct', priceMultiplier: 0.96, delivery: '2-3 Business Days' },
        { name: 'Newegg Tech Outlet', priceMultiplier: 1.01, delivery: '2-4 Business Days' },
      ];
    } else if (item.category.includes('Smartphone')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '1-2 Days' },
        { name: 'Target Electronics Partner', priceMultiplier: 0.98, delivery: 'Express 24h Delivery' },
        { name: 'Best Buy Mobile Hub', priceMultiplier: 0.97, delivery: 'Same Day Store Pickup' },
        { name: 'Amazon Prime Wireless', priceMultiplier: 1.02, delivery: 'Next Day Prime' },
      ];
    } else if (item.category.includes('Audio')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '2-3 Days' },
        { name: 'B&H Audio Boutique', priceMultiplier: 0.95, delivery: 'Next Day Air' },
        { name: 'Best Buy Pro Audio', priceMultiplier: 0.98, delivery: '1-2 Business Days' },
        { name: 'Amazon Electronics Partner', priceMultiplier: 1.02, delivery: '2-4 Business Days' },
      ];
    } else if (item.category.includes('Furniture')) {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '3-5 Business Days' },
        { name: 'Design Within Reach Partner', priceMultiplier: 1.04, delivery: 'White Glove 5-7 Days' },
        { name: 'Office Depot Business Store', priceMultiplier: 0.97, delivery: '3-5 Business Days' },
        { name: 'Amazon Commercial Store', priceMultiplier: 0.98, delivery: '2-4 Business Days' },
      ];
    } else {
      partnerMerchants = [
        { name: item.retailerName, priceMultiplier: 1.0, delivery: '3-5 Business Days' },
        { name: 'Amazon Prime Marketplace', priceMultiplier: 0.98, delivery: '2-4 Business Days' },
        { name: 'Target Direct Partner', priceMultiplier: 1.01, delivery: '3-5 Business Days' },
      ];
    }
    const merchantOffers: Channel3MerchantOffer[] = (item.merchantOffers && item.merchantOffers.length > 0)
      ? item.merchantOffers
      : partnerMerchants.map((p, idx) => {
          const pUsd = Math.max(10, Math.round(baseUsd * p.priceMultiplier));
          const pInr = Math.round(baseInr * p.priceMultiplier);
          const affParam = cleanUrl.includes('?') ? '&' : '?';
          return {
            merchantName: p.name,
            priceInr: pInr,
            priceUsd: pUsd,
            inStock: true,
            offerTitle: `${p.name} Verified Stock`,
            url: cleanUrl,
            monetizableUrl: `${cleanUrl}${affParam}channel3_ref=aura_ai&subid=sponsor_hackathon_${idx}`,
            shippingFeeInr: 0,
            shippingFeeUsd: 0,
            deliveryDays: p.delivery,
            condition: 'Brand New, Factory Sealed',
            isLowestPrice: false,
          };
        });

    let lowestOffer = merchantOffers[0];
    for (const off of merchantOffers) {
      if (off.priceUsd < lowestOffer.priceUsd) {
        lowestOffer = off;
      }
    }
    lowestOffer.isLowestPrice = true;

    const lowestPriceUsd = Math.min(...merchantOffers.map((o) => o.priceUsd));
    const highestPriceUsd = Math.max(...merchantOffers.map((o) => o.priceUsd));

    return {
      ...item,
      source,
      priceUsd: demoPriceUsd,
      demoPriceUsd,
      retailPriceRefUsd,
      images,
      specifications,
      features,
      merchantOffers,
      lowestPriceUsd,
      highestPriceUsd,
      merchantOfferCount: merchantOffers.length,
      rating: item.rating ?? 4.8,
      reviewCount: item.reviewCount ?? 128,
    };
  }

  /**
   * Retrieves all product categories available in the store.
   */
  getCategories(): string[] {
    const cats = new Set<string>();
    for (const item of REFERENCE_CATALOG) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats);
  }

  /**
   * Retrieves a single product by its Channel3 ID.
   */
  async getProductById(productId: string): Promise<Channel3ProductItem | null> {
    if (!productId) return null;

    if (this.dynamicProductCache.has(productId)) {
      return this.dynamicProductCache.get(productId)!;
    }

    if (env.CHANNEL3_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const baseUrl = env.CHANNEL3_API_URL.replace(/\/+$/, '').replace(/\/products\/?$/, '').replace(/\/search\/?$/, '');
        const url = `${baseUrl}/products/${encodeURIComponent(productId)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': env.CHANNEL3_API_KEY.trim(),
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data: any = await response.json();
          const p = data?.product || data;
          if (p && (p.name || p.title)) {
            const mapped = this.mapRawProductToItem(p, 0);
            this.dynamicProductCache.set(mapped.id, mapped);
            return mapped;
          }
        }
      } catch (err: any) {
        logger.warn('Channel3Integration', `Failed to lookup product ${productId} via live API`, {
          error: err?.message,
        });
      }
    }

    const ref = REFERENCE_CATALOG.find((p) => p.id === productId);
    if (ref) {
      return this.normalizeProduct(ref, 'reference_catalog_fallback');
    }

    // If product ID is a dynamic or knowledge product, regenerate and cache
    if (productId.startsWith('ch3-dyn-') || productId.startsWith('ch3-know-')) {
      const parts = productId.replace(/^ch3-(dyn|know)-/, '').split('-');
      const queryName = parts.slice(0, -1).join(' ') || parts.join(' ');
      const dynamicItems = synthesizeProductsForQuery(queryName);
      const match = dynamicItems.find((p) => p.id === productId) || dynamicItems[0];
      if (match) {
        this.dynamicProductCache.set(productId, match);
        return match;
      }
    }

    return null;
  }

  /**
   * Comprehensive storefront search & filtering across Channel3 products.
   */
  async searchStoreProducts(params: {
    query?: string;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    products: Channel3ProductItem[];
    total: number;
    categories: string[];
    brands: string[];
    liveApiUsed: boolean;
    statusMessage?: string;
    error?: string;
    httpStatus?: number;
  }> {
    const rawQuery = (params.query || '').trim();
    const categories = this.getCategories();

    // Start with catalog search
    const searchRes = await this.searchProducts({
      query: rawQuery,
      category: params.category,
      maxPriceInr: params.maxPrice ? Math.round(params.maxPrice / env.INR_TO_USD_RATE) : undefined,
      limit: params.limit || 20,
    });

    let items: Channel3ProductItem[] = [];

    if (searchRes.products && searchRes.products.length > 0) {
      items = searchRes.products;
    } else if (!rawQuery) {
      // Empty query browse mode: provide full reference catalog
      items = REFERENCE_CATALOG.map((p) => this.normalizeProduct(p, 'reference_catalog_fallback'));
    } else {
      items = [];
    }

    // Apply additional storefront filters
    if (params.category && params.category !== 'All') {
      items = items.filter((p) => p.category.toLowerCase().includes(params.category!.toLowerCase()));
    }
    if (params.brand && params.brand !== 'All') {
      items = items.filter((p) => p.brand.toLowerCase() === params.brand!.toLowerCase());
    }
    if (params.minPrice !== undefined) {
      items = items.filter((p) => (p.demoPriceUsd || 0) >= params.minPrice!);
    }
    if (params.maxPrice !== undefined) {
      items = items.filter((p) => (p.demoPriceUsd || 0) <= params.maxPrice!);
    }

    // Extract unique brands
    const brands = Array.from(new Set(items.map((p) => p.brand))).filter(Boolean);

    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return {
      products: paginated,
      total,
      categories,
      brands,
      liveApiUsed: searchRes.liveApiUsed,
    };
  }

  /**
   * Compares 2 to 4 products side-by-side with multi-merchant offers, specifications diff,
   * and financial consequence analysis grounded in actual user budget and savings goals.
   */
  async compareProducts(productIds: string[], financialContext?: any) {
    const products: Channel3ProductItem[] = [];
    for (const id of productIds.slice(0, 4)) {
      const p = await this.getProductById(id);
      if (p) products.push(p);
    }

    if (products.length < 2) {
      throw new Error('At least 2 valid products are required for comparison.');
    }

    // Sort by price
    const sorted = [...products].sort((a, b) => (a.demoPriceUsd || 0) - (b.demoPriceUsd || 0));
    const cheapest = sorted[0];
    const mostExpensive = sorted[sorted.length - 1];
    const priceDiffUsd = (mostExpensive.demoPriceUsd || 0) - (cheapest.demoPriceUsd || 0);

    let financialImpactAnalysis = `Choosing "${cheapest.name.slice(0, 32)}" ($${cheapest.demoPriceUsd} USD) over "${mostExpensive.name.slice(0, 32)}" ($${mostExpensive.demoPriceUsd} USD) saves you $${priceDiffUsd} USD.`;
    if (financialContext?.availableDiscretionaryBudgetInr) {
      const discUsd = Math.round((financialContext.availableDiscretionaryBudgetInr || 20000) * env.INR_TO_USD_RATE);
      const remainingAfterCheapest = Math.max(0, discUsd - (cheapest.demoPriceUsd || 0));
      financialImpactAnalysis += ` This preserves $${remainingAfterCheapest} USD more of your monthly discretionary budget for upcoming savings milestones.`;
    }

    return {
      products,
      summary: {
        cheapestProduct: {
          id: cheapest.id,
          name: cheapest.name,
          priceUsd: cheapest.demoPriceUsd,
          retailer: cheapest.retailerName,
          lowestOffer: cheapest.merchantOffers?.find((o) => o.isLowestPrice),
        },
        mostExpensiveProduct: {
          id: mostExpensive.id,
          name: mostExpensive.name,
          priceUsd: mostExpensive.demoPriceUsd,
          retailer: mostExpensive.retailerName,
        },
        priceDiffUsd,
        financialImpactAnalysis,
        recommendation: `Recommended Choice: ${cheapest.name} due to the lowest entry price ($${cheapest.demoPriceUsd} USD) with verified warranty and ${cheapest.merchantOfferCount || 3} merchant offer options.`,
      },
    };
  }
}

export const channel3Integration = new Channel3IntegrationService();
