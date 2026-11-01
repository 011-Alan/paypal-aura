import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory or root directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL || 'http://localhost:4000/api',
  ENABLE_BACKGROUND_WORKERS: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',

  // Primary Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aura_fintech',

  // Security & Auth
  JWT_SECRET: process.env.JWT_SECRET || 'aura-dev-jwt-secret-key-2026-paypal-hackathon-secure',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  APPROVAL_TOKEN_SECRET: process.env.APPROVAL_TOKEN_SECRET || 'aura-dev-approval-token-secret-2026-guardian',
  APPROVAL_TOKEN_TTL_SECONDS: parseInt(process.env.APPROVAL_TOKEN_TTL_SECONDS || '300', 10),
  CSRF_SECRET: process.env.CSRF_SECRET || 'aura-csrf-token-secret-2026',

  // Google Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // PayPal Sandbox
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
  PAYPAL_BASE_URL: process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com',
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || '',
  PAYPAL_DEFAULT_CURRENCY: process.env.PAYPAL_DEFAULT_CURRENCY || 'USD',
  INR_TO_USD_RATE: parseFloat(process.env.INR_TO_USD_RATE || '0.01190476'),

  // Sponsor 1: AG Grid / AG Studio
  AG_GRID_LICENSE_KEY: process.env.AG_GRID_LICENSE_KEY || '',
  AG_STUDIO_ENABLED: process.env.AG_STUDIO_ENABLED === 'true',

  // Sponsor 2: APIMatic
  APIMATIC_STRICT_CONTRACT_VALIDATION: process.env.APIMATIC_STRICT_CONTRACT_VALIDATION !== 'false',
  APIMATIC_PAYPAL_SPEC_VERSION: process.env.APIMATIC_PAYPAL_SPEC_VERSION || '2.1.0',

  // Sponsor 3: Astropods
  ASTROPODS_API_URL: process.env.ASTROPODS_API_URL || 'https://api.astropods.io/v1',
  ASTROPODS_API_KEY: process.env.ASTROPODS_API_KEY || '',
  ASTROPODS_WORKSPACE_ID: process.env.ASTROPODS_WORKSPACE_ID || 'aura-financial-agents',

  // Sponsor 4: Bryntum
  BRYNTUM_CALENDAR_ENABLED: process.env.BRYNTUM_CALENDAR_ENABLED !== 'false',
  BRYNTUM_DEFAULT_VIEW: process.env.BRYNTUM_DEFAULT_VIEW || 'month',

  // Sponsor 5: Channel3
  CHANNEL3_API_URL: process.env.CHANNEL3_API_URL || 'https://api.channel3.io/v1',
  CHANNEL3_API_KEY: process.env.CHANNEL3_API_KEY || '',

  // Sponsor 6: Elastic
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  ELASTICSEARCH_API_KEY: process.env.ELASTICSEARCH_API_KEY || '',
  ELASTICSEARCH_USERNAME: process.env.ELASTICSEARCH_USERNAME || '',
  ELASTICSEARCH_PASSWORD: process.env.ELASTICSEARCH_PASSWORD || '',
  ELASTICSEARCH_INDEX_PREFIX: process.env.ELASTICSEARCH_INDEX_PREFIX || 'aura',

  // Sponsor 7: KERNEL
  KERNEL_API_URL: process.env.KERNEL_API_URL || 'https://api.onkernel.com/v1',
  KERNEL_API_KEY: process.env.KERNEL_API_KEY || '',
  KERNEL_MAX_SESSION_SECONDS: parseInt(process.env.KERNEL_MAX_SESSION_SECONDS || '60', 10),

  // Sponsor 10: Zapier MCP
  ZAPIER_MCP_URL: process.env.ZAPIER_MCP_URL || 'https://mcp.zapier.com/api/v1',
  ZAPIER_API_KEY: process.env.ZAPIER_API_KEY || '',
  ZAPIER_WEBHOOK_URL: process.env.ZAPIER_WEBHOOK_URL || '',

  // Python Analytics Engine
  PYTHON_EXECUTABLE: process.env.PYTHON_EXECUTABLE || 'python',
};
