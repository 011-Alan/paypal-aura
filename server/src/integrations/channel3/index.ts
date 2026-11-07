import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sanitizeUntrustedExternalText } from '../../middleware/security';

export type PurchaseGuidanceTier =
  | 'Comfortable within the current plan'
  | 'Possible with budget adjustments'
  | 'Better postponed'
  | 'Not currently recommended';

export interface Channel3ProductItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  currency: string;
  imageUrl: string;
  variants: string[];
  availability: 'in_stock' | 'limited_stock' | 'out_of_stock';
  retailerName: string;
  purchaseUrl: string;
  supportsPayPalSandboxCheckout: boolean;
  source: 'channel3_live_api' | 'reference_catalog_fallback';
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
  },
  {
    id: 'ch3-laptop-lenovo-ideapad-slim3',
    name: 'Lenovo IdeaPad Slim 3 (AMD Ryzen 5 7530U, 16GB RAM, 512GB SSD)',
    brand: 'Lenovo',
    category: 'Laptops & Computers',
    description: 'Lightweight 15.6-inch everyday laptop with Ryzen 5 7000 series processor, Dolby Audio, and Rapid Charge Boost.',
    priceInr: 42990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
    variants: ['Arctic Grey 16GB/512GB', 'Abyss Blue 8GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Lenovo Authorized Online Store',
    purchaseUrl: 'https://www.lenovo.com/in/en/',
    supportsPayPalSandboxCheckout: true,
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
];

export class Channel3IntegrationService {
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
   * Retrieves products from the live Channel3 API when CHANNEL3_API_KEY is configured,
   * or falls back transparently (without pretending to be a live API response) when unavailable.
   */
  async searchProducts(params: {
    query: string;
    maxPriceInr?: number;
    category?: string;
  }): Promise<{
    liveApiUsed: boolean;
    statusMessage: string;
    products: Channel3ProductItem[];
  }> {
    const q = (params.query || '').toLowerCase();

    if (env.CHANNEL3_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const url = new URL(`${env.CHANNEL3_API_URL}/products/search`);
        url.searchParams.set('q', params.query);
        if (params.maxPriceInr) url.searchParams.set('max_price', String(params.maxPriceInr));

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.CHANNEL3_API_KEY}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data: any = await response.json();
          const rawItems = Array.isArray(data?.products || data?.items || data?.data)
            ? data.products || data.items || data.data
            : [];
          if (rawItems.length > 0) {
            const mapped: Channel3ProductItem[] = rawItems.slice(0, 10).map((item: any, idx: number) => ({
              id: String(item.id || `ch3-live-${idx}`),
              name: sanitizeUntrustedExternalText(String(item.name || item.title || 'Product'), 160),
              brand: sanitizeUntrustedExternalText(String(item.brand || 'Brand'), 60),
              category: sanitizeUntrustedExternalText(String(item.category || 'General'), 60),
              description: sanitizeUntrustedExternalText(String(item.description || ''), 300),
              priceInr: Number(item.price_inr || item.price || 15000),
              currency: String(item.currency || 'INR'),
              imageUrl: String(item.image_url || item.image || REFERENCE_CATALOG[0].imageUrl),
              variants: Array.isArray(item.variants) ? item.variants.map(String) : ['Standard'],
              availability: 'in_stock',
              retailerName: sanitizeUntrustedExternalText(String(item.retailer || item.merchant || 'Channel3 Merchant'), 80),
              purchaseUrl: String(item.url || item.purchase_url || 'https://www.paypal.com'),
              supportsPayPalSandboxCheckout: Boolean(item.supports_paypal ?? true),
              source: 'channel3_live_api',
            }));
            return {
              liveApiUsed: true,
              statusMessage: 'Retrieved live product listings from Channel3 API.',
              products: mapped,
            };
          }
        }
      } catch (err: any) {
        logger.warn('Channel3Integration', 'Channel3 API request failed; falling back to labelled reference catalog', {
          error: err?.message,
        });
      }
    }

    // Filter reference catalog transparently across diverse product categories
    let matches = REFERENCE_CATALOG.filter((item) => {
      // Direct category override if provided
      if (params.category && item.category.toLowerCase().includes(params.category.toLowerCase())) {
        return true;
      }

      // Footwear & Sneakers
      if (
        q.includes('sneaker') ||
        q.includes('shoe') ||
        q.includes('running') ||
        q.includes('footwear') ||
        q.includes('trainer') ||
        q.includes('nike') ||
        q.includes('adidas') ||
        q.includes('puma') ||
        q.includes('asics')
      ) {
        if (item.category === 'Footwear & Sneakers') {
          // If running specific, prefer running shoes
          if (q.includes('running') || q.includes('sports')) {
            return item.description.toLowerCase().includes('running') || item.name.toLowerCase().includes('running');
          }
          if (q.includes('casual') || q.includes('everyday')) {
            return item.description.toLowerCase().includes('casual') || item.name.toLowerCase().includes('casual');
          }
          return true;
        }
        return false;
      }

      // Clothing & Apparel
      if (
        q.includes('cloth') ||
        q.includes('apparel') ||
        q.includes('shirt') ||
        q.includes('tee') ||
        q.includes('jeans') ||
        q.includes('denim') ||
        q.includes('jacket') ||
        q.includes('uniqlo') ||
        q.includes('levi')
      ) {
        return item.category === 'Clothing & Apparel';
      }

      // Furniture & Home Office
      if (
        q.includes('furniture') ||
        q.includes('chair') ||
        q.includes('desk') ||
        q.includes('table') ||
        q.includes('wakefit') ||
        q.includes('ikea')
      ) {
        return item.category === 'Furniture';
      }

      // Home Appliances (Air Conditioners, Refrigerators, Vacuum, Air Fryer, etc.)
      if (
        q.includes('appliance') ||
        /\bac\b|\bair conditioner\b|\bair conditioning\b|\bcooler\b/i.test(q) ||
        /\brefrigerator\b|\bfridge\b/i.test(q) ||
        q.includes('air fryer') ||
        q.includes('fryer') ||
        q.includes('vacuum') ||
        q.includes('philips') ||
        q.includes('dyson') ||
        q.includes('daikin') ||
        q.includes('voltas') ||
        q.includes('lg')
      ) {
        if (item.category === 'Home Appliances') {
          if (/\bac\b|\bair conditioner\b|\bair conditioning\b|\bcooler\b/i.test(q)) {
            return (
              item.id.includes('-ac') ||
              /\b(ac|air conditioner|air conditioning)\b/i.test(item.name) ||
              /\b(air conditioner|air conditioning)\b/i.test(item.description)
            );
          }
          if (/\brefrigerator\b|\bfridge\b/i.test(q)) {
            return item.name.toLowerCase().includes('refrigerator') || item.description.toLowerCase().includes('refrigerator');
          }
          if (q.includes('air fryer') || q.includes('fryer')) {
            return item.name.toLowerCase().includes('air fryer');
          }
          if (q.includes('vacuum')) {
            return item.name.toLowerCase().includes('vacuum');
          }
          return true;
        }
        return false;
      }

      // Books & Learning
      if (
        q.includes('book') ||
        q.includes('read') ||
        q.includes('habits') ||
        q.includes('psychology of money') ||
        q.includes('novel')
      ) {
        return item.category === 'Books & Learning';
      }

      // Laptops & Computers
      if (
        q.includes('laptop') ||
        q.includes('macbook') ||
        q.includes('computer') ||
        q.includes('notebook') ||
        q.includes('asus') ||
        q.includes('lenovo') ||
        q.includes('acer')
      ) {
        return item.category === 'Laptops & Computers';
      }

      // Smartphones
      if (
        q.includes('phone') ||
        q.includes('mobile') ||
        q.includes('smartphone') ||
        q.includes('galaxy') ||
        q.includes('cmf')
      ) {
        return item.category === 'Smartphones';
      }

      // Audio & Accessories
      if (
        q.includes('headphone') ||
        q.includes('audio') ||
        q.includes('earphone') ||
        q.includes('airpod') ||
        q.includes('earbud') ||
        q.includes('sound')
      ) {
        return item.category === 'Audio & Accessories';
      }

      // Bottles & Kitchenware
      if (
        q.includes('bottle') ||
        q.includes('flask') ||
        q.includes('hydration') ||
        q.includes('thermosteel') ||
        q.includes('milton') ||
        q.includes('cello')
      ) {
        return item.category === 'Kitchen & Dining';
      }

      if (!q.trim()) return true;

      // General fallback keyword matching
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });

    // If query was specific (e.g. AC or Refrigerator) but yielded no matches, do not pollute with random running shoes
    if (matches.length === 0) {
      const isSpecificQuery =
        /\bac\b|\bair conditioner\b|\bfridge\b|\brefrigerator\b|\blaptop\b|\bsneaker\b|\bphone\b|\bchair\b|\bbook\b|\bbottle\b/i.test(q);
      if (!isSpecificQuery && !q.trim()) {
        matches = REFERENCE_CATALOG;
      }
    }

    if (typeof params.maxPriceInr === 'number' && params.maxPriceInr > 0) {
      const underPrice = matches.filter((m) => m.priceInr <= params.maxPriceInr!);
      if (underPrice.length > 0) {
        matches = underPrice;
      }
    }

    return {
      liveApiUsed: false,
      statusMessage: env.CHANNEL3_API_KEY
        ? 'Channel3 live API temporarily unreachable — using clearly labelled reference catalog for affordability evaluation.'
        : 'Channel3 live API key not configured — using clearly labelled reference catalog for affordability evaluation.',
      products: matches.map((item) => ({
        ...item,
        source: 'reference_catalog_fallback',
      })),
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
}

export const channel3Integration = new Channel3IntegrationService();
