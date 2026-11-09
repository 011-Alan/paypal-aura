import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  FinancialPlanModel,
  GoalModel,
  FamilyGroupModel,
  CalendarEventModel,
  PaymentRequestModel,
  NotificationModel,
  AutomationRuleModel,
  AuditLogModel,
  ConversationModel,
  MessageModel,
} from '../models';
import {
  AuthenticatedRequest,
  requireAuth,
  strictAuthRateLimiter,
  hashSecretArgon2id,
  verifySecretArgon2id,
  signSessionToken,
  recordAuditLog,
  setSessionCookie,
  clearSessionCookie,
} from '../middleware/security';
import {
  ensureDemoUserAlexSeeded,
  ensureDemoUserMayaSeeded,
  ensureDemoMerchantBruceSeeded,
  getDemoPersonas,
  DEMO_ALEX_CREDENTIALS,
  DEMO_PRIYA_CREDENTIALS,
  DEMO_MAYA_CREDENTIALS,
  DEMO_BRUCE_CREDENTIALS,
} from '../seed/seedService';
import { coreFinancialService } from '../services/financial/financialService';
import { pythonAnalyticsService } from '../services/analytics/analyticsService';
import { paymentGuardianService } from '../services/payments/paymentGuardianService';
import { ecommerceService } from '../services/ecommerce/ecommerceService';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { geminiRequestManager } from '../services/planning/geminiRequestManager';
import { GEMINI_MODEL_REGISTRY, validateModelAvailability } from '../services/planning/modelConfig';
import { lightweightProcessingService } from '../services/ai/lightweightProcessingService';
import { semanticRetrievalService } from '../services/ai/semanticRetrievalService';
import { agGridIntegration } from '../integrations/ag-grid';
import { apimaticIntegration } from '../integrations/apimatic';
import { astropodsIntegration } from '../integrations/astropods';
import { bryntumIntegration } from '../integrations/bryntum';
import { channel3Integration } from '../integrations/channel3';
import { elasticIntegration } from '../integrations/elastic';
import { kernelIntegration } from '../integrations/kernel';
import { paypalIntegration } from '../integrations/paypal';
import { paypalIdentityService } from '../integrations/paypal/identityService';
import { paypalProfileService } from '../integrations/paypal/paypalProfileService';
import { paypalBalanceService } from '../integrations/paypal/paypalBalanceService';
import { paypalTransactionService } from '../integrations/paypal/paypalTransactionService';
import { paypalReportingService } from '../integrations/paypal/paypalReportingService';
import { validatePayPalConfig } from '../integrations/paypal/validator';
import { zapierIntegration } from '../integrations/zapier';
import { renderWorkerManager } from '../workers/backgroundWorkflows';
import { getDatabaseHealth } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const apiRouter = Router();

export function resolveFrontendOrigin(req: Request): string {
  // 1. If explicitly set in environment (non-localhost)
  if (process.env.CLIENT_ORIGIN && !process.env.CLIENT_ORIGIN.includes('localhost')) {
    return process.env.CLIENT_ORIGIN.replace(/\/+$/, '');
  }
  // 2. Browser origin header if valid and non-local
  const origin = req.headers.origin as string | undefined;
  if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    return origin.replace(/\/+$/, '');
  }
  // 3. Browser referer header if valid and non-local
  if (req.headers.referer) {
    try {
      const refUrl = new URL(req.headers.referer);
      if (!refUrl.origin.includes('localhost') && !refUrl.origin.includes('127.0.0.1')) {
        return refUrl.origin.replace(/\/+$/, '');
      }
    } catch {
      // ignore
    }
  }
  // 4. If on Render or production host, use exact deployed frontend URL
  if (req.headers.host?.includes('.onrender.com') || process.env.RENDER_EXTERNAL_URL) {
    return 'https://aura-frontend-izl2.onrender.com';
  }
  // 5. env.CLIENT_ORIGIN fallback or local dev
  return env.CLIENT_ORIGIN || 'http://localhost:5173';
}

// Helper to sanitize user response (never expose passwordHash or pinHash)
function sanitizeUser(u: any) {
  const normCurrency = (u.currency && u.currency !== 'INR') ? u.currency : 'USD';
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    currency: normCurrency,
    preferredCurrency: normCurrency,
    monthlyIncome: u.monthlyIncome,
    familyGroupId: u.familyGroupId,
    spendingPreferences: u.spendingPreferences,
    financialPolicy: u.financialPolicy,
    onboardingCompleted: u.onboardingCompleted,
    paypalAccountLinked: Boolean(u.paypalAccountLinked),
    paypalEmail: u.paypalEmail,
    paypalPayerId: u.paypalPayerId,
    paypalIdentityVerified: Boolean(u.paypalIdentityVerified),
    paypalAddress: u.paypalAddress,
    paypalLastSyncAt: u.paypalLastSyncAt,
    authenticationProvider: u.authenticationProvider || 'local',
    createdAt: u.createdAt,
  };
}

// ============================================================================
// 0. Health & Dashboard Overview
// ============================================================================
apiRouter.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = getDatabaseHealth();
  const elasticStatus = await elasticIntegration.getHealthStatus();
  const geminiStatus = auraAiOrchestrator.getHealthStatus();
  res.json({
    success: true,
    service: 'PROJECT AURA Backend API',
    status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbHealth,
    gemini: geminiStatus,
    elastic: {
      status: elasticStatus.status,
      clusterReachable: elasticStatus.clusterReachable,
    },
  });
});

apiRouter.get('/ai/health', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    if (force) {
      await auraAiOrchestrator.verifyConnectivity(true);
    }
    const health = auraAiOrchestrator.getHealthStatus();
    res.json({
      success: true,
      gemini: health,
      recentTraces: auraAiOrchestrator.getRecentTraces(5),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ai/metrics', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    metrics: geminiRequestManager.getMetrics(),
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/ai/models', async (_req: Request, res: Response) => {
  try {
    const diagnostics = await validateModelAvailability((auraAiOrchestrator as any).geminiClient);
    res.json({
      success: true,
      models: GEMINI_MODEL_REGISTRY,
      diagnostics,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ai/categorize-transaction', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { description, amount, currency } = req.body || {};
    if (!description) {
      res.status(400).json({ success: false, error: 'Transaction description is required.' });
      return;
    }

    const result = await lightweightProcessingService.categorizeTransaction({
      description: String(description),
      amount: amount !== undefined ? Number(amount) : undefined,
      currency: currency ? String(currency) : 'INR',
    });

    res.json({
      success: true,
      modelUsed: GEMINI_MODEL_REGISTRY.lightweight.modelId,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Categorization failed' });
  }
});

apiRouter.post('/ai/extract-entities', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text } = req.body || {};
    if (!text) {
      res.status(400).json({ success: false, error: 'Text is required for entity extraction.' });
      return;
    }

    const result = await lightweightProcessingService.extractStructuredEntities({
      text: String(text),
    });

    res.json({
      success: true,
      modelUsed: GEMINI_MODEL_REGISTRY.lightweight.modelId,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Entity extraction failed' });
  }
});

apiRouter.get('/ai/semantic-search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      res.status(400).json({ success: false, error: 'Query parameter "q" is required.' });
      return;
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
    const sourceType = req.query.sourceType ? String(req.query.sourceType) as any : undefined;

    const results = await semanticRetrievalService.semanticSearch({
      userId: req.user!.id,
      query,
      sourceType,
      limit,
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Semantic search failed' });
  }
});

// ============================================================================
// 1. Authentication (Folder 1)
// ============================================================================
apiRouter.post('/auth/register', strictAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    const { name, email, password, pin, monthlyIncome } = req.body || {};
    if (!name || !email || !password || String(password).length < 6) {
      res.status(400).json({
        success: false,
        error: 'Name, valid email, and password (minimum 6 characters) are required.',
      });
      return;
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existing = await UserModel.findOne({ email: cleanEmail });
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
      return;
    }

    const pinStr = String(pin || '4826').trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      res.status(400).json({
        success: false,
        error: 'Security PIN must be 4 to 6 digits.',
      });
      return;
    }

    const passwordHash = await hashSecretArgon2id(String(password));
    const pinHash = await hashSecretArgon2id(pinStr);

    const user = await UserModel.create({
      name: String(name).trim(),
      email: cleanEmail,
      passwordHash,
      pinHash,
      monthlyIncome: Number(monthlyIncome || 5000),
      familyGroupId: `aura-family-${Date.now()}`,
    });

    // Create default checking account for new user
    await AccountModel.create({
      userId: user._id,
      name: 'Primary Checking Account',
      institution: 'Primary Checking Bank',
      type: 'checking',
      accountNumberMasked: 'XXXX-1024',
      balance: Number(monthlyIncome || 5000),
      currency: 'USD',
      isSharedWithFamily: false,
      familyGroupId: user.familyGroupId,
    });

    await zapierIntegration.ensureDefaultAutomationRules(String(user._id), user.email);
    const token = signSessionToken(user);
    setSessionCookie(res, token);

    await recordAuditLog({
      userId: String(user._id),
      actor: 'user',
      action: 'user_registered',
      resourceType: 'user',
      resourceId: String(user._id),
      status: 'success',
    });

    res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Registration failed' });
  }
});

apiRouter.post('/auth/login', strictAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required.' });
      return;
    }

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const valid = await verifySecretArgon2id(user.passwordHash, String(password));
    if (!valid) {
      await recordAuditLog({
        userId: String(user._id),
        actor: 'user',
        action: 'user_login_failed',
        resourceType: 'user',
        status: 'blocked',
      });
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const token = signSessionToken(user);
    setSessionCookie(res, token);
    await recordAuditLog({
      userId: String(user._id),
      actor: 'user',
      action: 'user_logged_in',
      resourceType: 'user',
      resourceId: String(user._id),
      status: 'success',
    });

    res.json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Login failed' });
  }
});

apiRouter.post('/auth/demo-login', async (_req: Request, res: Response) => {
  try {
    const { user, credentials } = await ensureDemoUserAlexSeeded(false);
    const token = signSessionToken(user);
    setSessionCookie(res, token);
    res.json({
      success: true,
      token,
      user: sanitizeUser(user),
      demoCredentials: {
        email: credentials.email,
        pinHint: credentials.pin,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Demo login failed' });
  }
});

apiRouter.get('/auth/demo-personas', async (_req: Request, res: Response) => {
  try {
    const personas = getDemoPersonas();
    res.json({ success: true, personas });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/auth/demo-switch', async (req: Request, res: Response) => {
  try {
    const { persona } = req.body || {};
    let targetUser: any = null;
    let targetCreds: any = null;

    if (persona === 'priya') {
      let priya = await UserModel.findOne({ email: DEMO_PRIYA_CREDENTIALS.email });
      if (!priya) {
        await ensureDemoUserAlexSeeded(true);
        priya = await UserModel.findOne({ email: DEMO_PRIYA_CREDENTIALS.email });
      }
      targetUser = priya;
      targetCreds = DEMO_PRIYA_CREDENTIALS;
    } else if (persona === 'maya') {
      const resMaya = await ensureDemoUserMayaSeeded(false);
      targetUser = resMaya.user;
      targetCreds = DEMO_MAYA_CREDENTIALS;
    } else if (persona === 'bruce') {
      const resBruce = await ensureDemoMerchantBruceSeeded(false);
      targetUser = resBruce.user;
      targetCreds = DEMO_BRUCE_CREDENTIALS;
    } else {
      // Default to Alex
      const resAlex = await ensureDemoUserAlexSeeded(false);
      targetUser = resAlex.user;
      targetCreds = DEMO_ALEX_CREDENTIALS;
    }

    if (!targetUser) {
      res.status(404).json({ success: false, error: 'Could not load requested demo persona' });
      return;
    }

    const token = signSessionToken(targetUser);
    res.json({
      success: true,
      token,
      user: sanitizeUser(targetUser),
      demoCredentials: {
        email: targetCreds.email,
        pinHint: targetCreds.pin,
        role: targetCreds.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Demo persona switch failed' });
  }
});

apiRouter.post('/auth/account-type', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountType } = req.body || {};
    if (!accountType || !['personal', 'business'].includes(accountType)) {
      return res.status(400).json({ success: false, error: 'Invalid accountType. Must be "personal" or "business".' });
    }
    const user = await UserModel.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    user.accountType = accountType;
    if (accountType === 'business') {
      user.role = 'merchant';
      const existingAccount = await AccountModel.findOne({ userId: user._id, name: /Merchant/i });
      if (!existingAccount) {
        await AccountModel.create({
          userId: user._id,
          name: `${user.name} Merchant Settlement`,
          institution: 'PayPal Sandbox Business Account',
          type: 'checking',
          accountNumberMasked: user.email,
          balance: 0,
          currency: 'USD',
          isSharedWithFamily: false,
          status: 'active',
        });
      }
    } else if (user.role === 'merchant') {
      user.role = 'user';
    }
    await user.save();

    res.json({
      success: true,
      message: `Account type successfully updated to ${accountType}.`,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 1b. Log in with PayPal (Identity API / OpenID Connect)
// ============================================================================
apiRouter.get('/auth/paypal/diagnostics', (_req: Request, res: Response) => {
  const result = validatePayPalConfig();
  res.json({
    success: true,
    ...result,
  });
});

apiRouter.get('/auth/paypal/authorize', async (req: Request, res: Response) => {
  try {
    let linkUserId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded: any = jwt.verify(authHeader.slice(7).trim(), env.JWT_SECRET);
        linkUserId = decoded.sub;
      } catch {
        // Unauthenticated request, proceed with standard registration / login flow
      }
    }

    const action = (req.query.action as any) || 'continue';
    let clientOrigin = (req.query.client_origin as string) || (req.headers.origin as string);
    if (!clientOrigin || clientOrigin.includes('localhost') || clientOrigin.includes('127.0.0.1')) {
      clientOrigin = resolveFrontendOrigin(req);
    }

    const { url, state, nonce } = paypalIdentityService.getAuthorizationUrl({
      linkUserId,
      prompt: req.query.prompt as string | undefined,
      action,
      clientOrigin,
    });

    res.json({
      success: true,
      url,
      state,
      mode: env.PAYPAL_MODE,
      action,
    });
  } catch (err: any) {
    logger.error('PayPalAuth', 'Failed to generate PayPal authorization URL', { error: err?.message });
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to initialize Log in with PayPal.',
    });
  }
});

apiRouter.get('/auth/paypal/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  // Dynamically resolve target frontend origin from verified state payload or request
  let targetOrigin = '';
  if (state && typeof state === 'string') {
    const verifiedState = paypalIdentityService.verifyOAuthState(state);
    if (verifiedState.payload?.clientOrigin && !verifiedState.payload.clientOrigin.includes('localhost') && !verifiedState.payload.clientOrigin.includes('127.0.0.1')) {
      targetOrigin = verifiedState.payload.clientOrigin;
    }
  }

  // Fallback safeguard: resolve to verified frontend origin
  if (!targetOrigin || targetOrigin.includes('localhost') || targetOrigin.includes('127.0.0.1')) {
    targetOrigin = resolveFrontendOrigin(req);
  }

  if (error) {
    const errorMsg = String(error_description || error || 'Authentication cancelled by user');
    logger.warn('PayPalAuth', 'PayPal returned authentication error', { error, error_description });
    return res.redirect(`${targetOrigin}/?auth=paypal_error&message=${encodeURIComponent(errorMsg)}`);
  }

  if (!code || !state) {
    return res.redirect(`${targetOrigin}/?auth=paypal_error&message=${encodeURIComponent('Missing authorization code or state from PayPal')}`);
  }

  try {
    const result = await paypalIdentityService.handleCallback({
      code: String(code),
      state: String(state),
    });

    setSessionCookie(res, result.token);

    const redirectUrl = `${targetOrigin}/?auth=paypal_success&token=${encodeURIComponent(result.token)}&isNewUser=${result.isNewUser}&isLinked=${result.isLinked}`;
    return res.redirect(redirectUrl);
  } catch (err: any) {
    logger.error('PayPalAuth', 'Failed to process PayPal authentication callback', { error: err?.message });
    const clientMsg = err?.message || 'PayPal authentication failed. Please try again.';
    return res.redirect(`${targetOrigin}/?auth=paypal_error&message=${encodeURIComponent(clientMsg)}`);
  }
});

apiRouter.post('/auth/paypal/callback', strictAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body || {};
    if (!code || !state) {
      res.status(400).json({
        success: false,
        error: 'Both code and state are required to exchange PayPal authorization.',
      });
      return;
    }

    const result = await paypalIdentityService.handleCallback({
      code: String(code),
      state: String(state),
    });

    setSessionCookie(res, result.token);

    res.json({
      success: true,
      token: result.token,
      user: sanitizeUser(result.user),
      isNewUser: result.isNewUser,
      isLinked: result.isLinked,
    });
  } catch (err: any) {
    logger.error('PayPalAuth', 'POST callback processing error', { error: err?.message });
    res.status(400).json({
      success: false,
      error: err?.message || 'PayPal authentication failed.',
    });
  }
});

apiRouter.post('/auth/paypal/link', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, state } = paypalIdentityService.getAuthorizationUrl({
      linkUserId: req.userId,
    });
    res.json({
      success: true,
      url,
      state,
      mode: env.PAYPAL_MODE,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to initialize PayPal account linking.',
    });
  }
});

/**
 * Helper to reconcile Available Balance vs. Transaction Ledger Calculation:
 * - Checks both the available balance in account and the calculation of transactions.
 * - Gives preference to the available balance in account first as the primary source of truth.
 * - If both match, confirms match.
 * - If they differ (e.g., initial balance was adjusted in sandbox without creating a transaction ledger entry),
 *   prioritizes the account's available balance.
 * - Synchronizes the verified balance to the user's primary/PayPal AccountModel and updates currency.
 */
async function reconcilePayPalAccountBalances(
  user: any,
  balance: any,
  transactions: any,
  merchantBalances: any,
  merchantTransactions: any
): Promise<void> {
  try {
    const allTxns = (transactions?.transactions?.length ? transactions.transactions : (merchantTransactions?.transactions || []));
    let calculatedLedgerTotal: number | null = null;
    if (allTxns.length > 0) {
      calculatedLedgerTotal = allTxns.reduce((sum: number, t: any) => {
        const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || 0));
        const isNegative = t.type === 'debit' || t.type === 'expense' || String(t.amount).startsWith('-');
        return sum + (isNegative ? -Math.abs(amt) : Math.abs(amt));
      }, 0);
    }

    let accountAvailableBalance: number | null = null;
    let resolvedCurrency = user.currency || 'USD';

    if (balance?.available && balance.balance !== null && typeof balance.balance === 'number') {
      accountAvailableBalance = balance.balance;
      resolvedCurrency = balance.currency || resolvedCurrency;
    } else if (merchantBalances?.available && merchantBalances.primaryBalance !== null && typeof merchantBalances.primaryBalance === 'number') {
      accountAvailableBalance = merchantBalances.primaryBalance;
      resolvedCurrency = merchantBalances.primaryCurrency || resolvedCurrency;
    }

    let resolvedBalance: number | null = null;
    if (accountAvailableBalance !== null) {
      resolvedBalance = accountAvailableBalance;
      balance.available = true;
      balance.balance = resolvedBalance;
      balance.currency = resolvedCurrency;
      if (calculatedLedgerTotal !== null && Math.abs(calculatedLedgerTotal - resolvedBalance) < 0.01) {
        balance.statusMessage = 'Live available balance verified and matches transaction ledger.';
      } else {
        balance.statusMessage = 'Live available balance in account (primary source of truth).';
      }
    } else if (calculatedLedgerTotal !== null) {
      resolvedBalance = calculatedLedgerTotal;
      balance.available = true;
      balance.balance = resolvedBalance;
      balance.currency = resolvedCurrency;
      balance.statusMessage = 'Balance calculated from transaction history ledger.';
    }

    // Persist reconciled balance & currency to AURA's local accounts and user profile
    if (resolvedBalance !== null) {
      let linkedAccount = await AccountModel.findOne({
        userId: user._id,
        $or: [
          { institution: { $regex: /PayPal/i } },
          { name: { $regex: /PayPal/i } },
          { type: 'checking' },
        ],
      });

      if (linkedAccount) {
        linkedAccount.balance = resolvedBalance;
        linkedAccount.currency = resolvedCurrency;
        linkedAccount.lastSyncedAt = new Date();
        await linkedAccount.save();
      } else {
        await AccountModel.create({
          userId: user._id,
          name: 'Primary PayPal Linked Account',
          institution: `PayPal ${env.PAYPAL_MODE === 'live' ? 'Live' : 'Sandbox'} Account`,
          type: 'checking',
          accountNumberMasked: `PP-${user.paypalPayerId ? user.paypalPayerId.slice(-4) : '0000'}`,
          balance: resolvedBalance,
          currency: resolvedCurrency,
          isSharedWithFamily: false,
          familyGroupId: user.familyGroupId,
          lastSyncedAt: new Date(),
        });
      }

      if (user.currency !== resolvedCurrency || user.financialProfile?.preferredCurrency !== resolvedCurrency) {
        user.currency = resolvedCurrency;
        if (user.financialProfile) {
          user.financialProfile.preferredCurrency = resolvedCurrency;
        }
        await user.save();
      }
    }
  } catch (err: any) {
    logger.warn('reconcilePayPalAccountBalances', 'Failed to synchronize account balance to database', {
      error: err?.message,
    });
  }
}

apiRouter.get('/paypal/connected-account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized.' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    if (!user.paypalAccountLinked || !user.paypalUserId) {
      res.json({
        success: true,
        linked: false,
        profile: null,
        balance: {
          available: false,
          balance: null,
          currency: null,
          statusMessage: 'No PayPal account connected.',
          details: 'Please connect a PayPal account to view account details.',
          lastSyncAt: null,
        },
        transactions: {
          available: false,
          transactions: [],
          totalCount: 0,
          statusMessage: 'No PayPal account connected.',
          details: 'Please connect a PayPal account to view transactions.',
          lastSyncAt: null,
        },
        lastSynchronized: null,
      });
      return;
    }

    // Force fresh balance and transaction pull from PayPal
    paypalReportingService.clearTokenCache();

    const [profile, balance, transactions, merchantBalances, merchantTransactions] = await Promise.all([
      paypalProfileService.getProfile(userId, { forceRefresh: true }),
      paypalBalanceService.getBalance(userId),
      paypalTransactionService.getTransactions(userId),
      paypalReportingService.getMerchantBalances(),
      paypalReportingService.getMerchantTransactions({ page: 1, pageSize: 20 }),
    ]);

    // Reconcile Available Balance vs. Transaction Ledger (Preference: Available Balance in Account First)
    await reconcilePayPalAccountBalances(user, balance, transactions, merchantBalances, merchantTransactions);

    res.json({
      success: true,
      linked: true,
      profile,
      balance,
      transactions,
      merchantBalances,
      merchantTransactions,
      lastSynchronized: user.paypalLastSyncAt || new Date().toISOString(),
      mode: env.PAYPAL_MODE,
    });
  } catch (err: any) {
    logger.error('PayPalConnectedAccount', 'Failed to retrieve connected PayPal account data', {
      userId: req.userId,
      error: err?.message,
    });
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retrieve PayPal connected account details.',
    });
  }
});

apiRouter.post('/paypal/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized.' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user || !user.paypalAccountLinked || !user.paypalUserId) {
      res.status(400).json({
        success: false,
        error: 'No linked PayPal account found to synchronize.',
      });
      return;
    }

    // Force fresh balance and transaction pull from PayPal
    paypalReportingService.clearTokenCache();

    const [profile, balance, transactions, merchantBalances, merchantTransactions] = await Promise.all([
      paypalProfileService.getProfile(userId, { forceRefresh: true }),
      paypalBalanceService.getBalance(userId),
      paypalTransactionService.getTransactions(userId),
      paypalReportingService.getMerchantBalances(),
      paypalReportingService.getMerchantTransactions({ page: 1, pageSize: 20 }),
    ]);

    // Reconcile Available Balance vs. Transaction Ledger (Preference: Available Balance in Account First)
    await reconcilePayPalAccountBalances(user, balance, transactions, merchantBalances, merchantTransactions);

    user.paypalLastSyncAt = new Date();
    await user.save();

    res.json({
      success: true,
      linked: true,
      profile,
      balance,
      transactions,
      merchantBalances,
      merchantTransactions,
      lastSynchronized: user.paypalLastSyncAt,
      mode: env.PAYPAL_MODE,
    });
  } catch (err: any) {
    logger.error('PayPalSync', 'Failed to synchronize PayPal connected account data', {
      userId: req.userId,
      error: err?.message,
    });
    res.status(500).json({
      success: false,
      error: err?.message || 'PayPal synchronization failed.',
    });
  }
});

/**
 * Dedicated endpoint for PayPal Sandbox Business Account Balances
 * Scope: https://uri.paypal.com/services/reporting/balances/read
 */
apiRouter.get('/paypal/merchant-reporting/balances', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const balanceResult = await paypalReportingService.getMerchantBalances();
    res.json({
      success: true,
      ...balanceResult,
    });
  } catch (err: any) {
    logger.error('PayPalMerchantReporting', 'Failed to retrieve merchant balances', { error: err?.message });
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retrieve PayPal Sandbox Business Account balances.',
    });
  }
});

/**
 * Dedicated endpoint for PayPal Sandbox Business Account Transaction History
 * Scope: https://uri.paypal.com/services/reporting/search/read
 */
apiRouter.get('/paypal/merchant-reporting/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, page, pageSize, transactionStatus } = req.query as {
      startDate?: string;
      endDate?: string;
      page?: string;
      pageSize?: string;
      transactionStatus?: string;
    };

    const transactionsResult = await paypalReportingService.getMerchantTransactions({
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      transactionStatus,
    });

    res.json({
      success: true,
      ...transactionsResult,
    });
  } catch (err: any) {
    logger.error('PayPalMerchantReporting', 'Failed to retrieve merchant transactions', { error: err?.message });
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retrieve PayPal Sandbox Business Account transactions.',
    });
  }
});

apiRouter.post('/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, error: 'Email address is required.' });
      return;
    }
    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      // Don't disclose user existence to prevent account enumeration, but return helpful message
      res.json({
        success: true,
        message: 'If an account exists for this email, you may reset your password using your security PIN.',
        requiresPin: true,
      });
      return;
    }
    res.json({
      success: true,
      message: 'Account verified. Please confirm your 4-digit security PIN to establish a new password.',
      requiresPin: true,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/auth/reset-password', strictAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, pin, newPassword } = req.body || {};
    if (!email || !pin || !newPassword || String(newPassword).length < 6) {
      res.status(400).json({
        success: false,
        error: 'Email, valid 4-digit PIN, and new password (minimum 6 characters) are required.',
      });
      return;
    }

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid verification details.' });
      return;
    }

    const pinValid = await verifySecretArgon2id(user.pinHash, String(pin).trim());
    if (!pinValid) {
      await recordAuditLog({
        userId: String(user._id),
        actor: 'user',
        action: 'password_reset_pin_failed',
        resourceType: 'user',
        status: 'blocked',
      });
      res.status(401).json({ success: false, error: 'Incorrect security PIN. Reset denied.' });
      return;
    }

    user.passwordHash = await hashSecretArgon2id(String(newPassword));
    await user.save();

    await recordAuditLog({
      userId: String(user._id),
      actor: 'user',
      action: 'password_reset_success',
      resourceType: 'user',
      resourceId: String(user._id),
      status: 'success',
    });

    res.json({
      success: true,
      message: 'Password reset successful. Please sign in with your new password.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Password reset failed' });
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    user: sanitizeUser(req.user),
  });
});

apiRouter.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    clearSessionCookie(res);
    await recordAuditLog({
      userId: req.userId,
      actor: 'user',
      action: 'user_logged_out',
      resourceType: 'user',
      resourceId: req.userId,
      status: 'success',
      details: { reason: req.body?.reason || 'user_initiated_logout' },
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/auth/logout-beacon', async (req: Request, res: Response) => {
  try {
    clearSessionCookie(res);
    // Navigator.sendBeacon best-effort logout
    const authHeader = req.headers.authorization;
    const bodyToken = typeof req.body === 'string' ? req.body : req.body?.token;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : bodyToken;
    if (token) {
      try {
        const decoded: any = (jwt as any)?.verify ? (jwt as any).verify(token, env.JWT_SECRET) : null;
        if (decoded?.id) {
          await recordAuditLog({
            userId: decoded.id,
            actor: 'user',
            action: 'user_session_window_closed',
            resourceType: 'user',
            resourceId: decoded.id,
            status: 'success',
          });
        }
      } catch {
        // Ignored for beacon
      }
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// ============================================================================
// 2. User Profiles & Policies (Folder 2)
// ============================================================================
apiRouter.get('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    profile: sanitizeUser(req.user),
  });
});

apiRouter.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, monthlyIncome, currency, spendingPreferences } = req.body || {};
    if (name) user.name = String(name).trim();
    if (typeof monthlyIncome === 'number' && monthlyIncome > 0) user.monthlyIncome = monthlyIncome;
    if (currency) user.currency = String(currency).toUpperCase().trim();
    if (spendingPreferences && typeof spendingPreferences === 'object') {
      user.spendingPreferences = {
        ...user.spendingPreferences,
        ...spendingPreferences,
      };
    }
    await user.save();
    res.json({ success: true, profile: sanitizeUser(user) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/profile/policy', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const updates = req.body || {};
    user.financialPolicy = {
      ...user.financialPolicy,
      ...(typeof updates.requirePinAboveAmount === 'number' ? { requirePinAboveAmount: updates.requirePinAboveAmount } : {}),
      ...(typeof updates.singleTransactionLimit === 'number' ? { singleTransactionLimit: updates.singleTransactionLimit } : {}),
      ...(typeof updates.dailySpendingLimit === 'number' ? { dailySpendingLimit: updates.dailySpendingLimit } : {}),
      ...(typeof updates.discretionaryMonthlyCap === 'number' ? { discretionaryMonthlyCap: updates.discretionaryMonthlyCap } : {}),
      ...(typeof updates.allowFamilySharedView === 'boolean' ? { allowFamilySharedView: updates.allowFamilySharedView } : {}),
      ...(Array.isArray(updates.blockedCategories) ? { blockedCategories: updates.blockedCategories.map(String) } : {}),
      requireExplicitApproval: true, // Invariant: always require explicit approval
    };
    await user.save();

    await recordAuditLog({
      userId: req.userId,
      actor: 'user',
      action: 'financial_policy_updated',
      resourceType: 'user_policy',
      status: 'success',
      details: { financialPolicy: user.financialPolicy },
    });

    res.json({ success: true, financialPolicy: user.financialPolicy });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/profile/pin', requireAuth, strictAuthRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { currentPin, newPin } = req.body || {};
    if (!currentPin || !newPin || !/^\d{4,6}$/.test(String(newPin))) {
      res.status(400).json({ success: false, error: 'Current PIN and a valid 4-6 digit new PIN are required.' });
      return;
    }

    const ok = await verifySecretArgon2id(user.pinHash, String(currentPin));
    if (!ok) {
      res.status(401).json({ success: false, error: 'Current security PIN is incorrect.' });
      return;
    }

    user.pinHash = await hashSecretArgon2id(String(newPin));
    await user.save();

    await recordAuditLog({
      userId: req.userId,
      actor: 'user',
      action: 'security_pin_rotated',
      resourceType: 'user',
      status: 'success',
    });

    res.json({ success: true, message: 'Security PIN updated with Argon2id hashing.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// Dashboard Summary Endpoint (Used by Home Page)
// ============================================================================
apiRouter.get('/dashboard/overview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userObjId = new mongoose.Types.ObjectId(req.userId!);
    const [accounts, transactions, mandates, goals, notifications, latestPlan] = await Promise.all([
      AccountModel.find({ userId: userObjId, status: 'active' }).sort({ balance: -1 }),
      TransactionModel.find({ userId: userObjId }).sort({ date: -1 }),
      MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } }).sort({ dueDayOfMonth: 1 }),
      GoalModel.find({ userId: userObjId, status: 'active' }),
      NotificationModel.find({ userId: userObjId }).sort({ createdAt: -1 }).limit(10),
      FinancialPlanModel.findOne({ userId: userObjId }).sort({ createdAt: -1 }),
    ]);

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const pythonSummary = await pythonAnalyticsService.runPythonTask({
      task: 'analyze_transactions',
      monthlyIncome: req.user!.monthlyIncome,
      transactions,
    });

    const plan = latestPlan || (await coreFinancialService.generateOrUpdateMonthlyPlan(req.userId!));

    res.json({
      success: true,
      user: sanitizeUser(req.user),
      metrics: {
        totalNetBalance: totalBalance,
        monthlyIncome: req.user!.monthlyIncome,
        totalExpense: pythonSummary.totalExpense,
        netCashflow: pythonSummary.netCashflow,
        savingsRatePercent: pythonSummary.savingsRatePercent,
        forecastNextMonthExpense: pythonSummary.forecastNextMonthExpense,
        unusualTransactionsCount: pythonSummary.unusualTransactions?.length || 0,
      },
      accounts,
      recentTransactions: transactions.slice(0, 8),
      pythonAnalytics: pythonSummary,
      mandates,
      goals,
      activePlan: plan,
      notifications,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 3. Accounts (Folder 3)
// ============================================================================
apiRouter.get('/accounts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const accounts = await AccountModel.find({ userId: req.userId, status: 'active' }).sort({ createdAt: 1 });
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  res.json({ success: true, totalBalance, accounts });
});

apiRouter.post('/accounts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, institution, type, accountNumberMasked, balance, isSharedWithFamily } = req.body || {};
    if (!name || !institution) {
      res.status(400).json({ success: false, error: 'Account name and financial institution are required.' });
      return;
    }

    const account = await AccountModel.create({
      userId: req.userId,
      name: String(name).trim(),
      institution: String(institution).trim(),
      type: type || 'checking',
      accountNumberMasked: String(accountNumberMasked || `XXXX-${Math.floor(1000 + Math.random() * 9000)}`),
      balance: Number(balance || 0),
      currency: req.body?.currency || (req.user as any)?.preferredCurrency || (req.user as any)?.currency || 'USD',
      isSharedWithFamily: Boolean(isSharedWithFamily),
      familyGroupId: req.user?.familyGroupId,
    });

    await recordAuditLog({
      userId: req.userId,
      actor: 'user',
      action: 'account_created',
      resourceType: 'account',
      resourceId: String(account._id),
      status: 'success',
    });

    res.status(201).json({ success: true, account });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/accounts/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await AccountModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!account) {
      res.status(404).json({ success: false, error: 'Account not found or unauthorized.' });
      return;
    }
    const { name, balance, isSharedWithFamily } = req.body || {};
    if (name) account.name = String(name).trim();
    if (typeof balance === 'number') account.balance = balance;
    if (typeof isSharedWithFamily === 'boolean') account.isSharedWithFamily = isSharedWithFamily;
    account.lastSyncedAt = new Date();
    await account.save();
    res.json({ success: true, account });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 4. Transactions & AG Grid Analytics (Folder 4)
// ============================================================================
apiRouter.get('/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: Record<string, any> = { userId: req.userId };
    const { direction, type, status, category, dateFrom, dateTo, search, onlyUnusual, limit, offset } = req.query;

    if (direction && direction !== 'all') {
      if (direction === 'sent') {
        query.$or = [{ direction: 'outgoing' }, { type: 'expense' }];
      } else if (direction === 'received') {
        query.$or = [{ direction: 'incoming' }, { type: 'income' }];
      } else {
        query.direction = direction;
      }
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = { $regex: String(category).trim(), $options: 'i' };
    }

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(String(dateFrom));
      if (dateTo) query.date.$lte = new Date(String(dateTo));
    }

    if (onlyUnusual === 'true') {
      query.isUnusual = true;
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      query.$or = [
        { merchant: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { counterparty: { $regex: q, $options: 'i' } },
        { paypalCaptureId: { $regex: q, $options: 'i' } },
        { paypalOrderId: { $regex: q, $options: 'i' } },
        { orderNumber: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
      ];
    }

    const total = await TransactionModel.countDocuments(query);
    const transactions = await TransactionModel.find(query)
      .sort({ date: -1 })
      .limit(limit ? Number(limit) : 200)
      .skip(offset ? Number(offset) : 0);

    // Compute sent/received aggregates for spending intelligence
    const allUserTxs = await TransactionModel.find({ userId: req.userId }).sort({ date: -1 });
    const totalSent = allUserTxs
      .filter((t) => t.type === 'expense' || t.direction === 'outgoing')
      .reduce((s, t) => s + t.amount, 0);
    const totalReceived = allUserTxs
      .filter((t) => t.type === 'income' || t.direction === 'incoming')
      .reduce((s, t) => s + t.amount, 0);
    const sentCount = allUserTxs.filter((t) => t.type === 'expense' || t.direction === 'outgoing').length;
    const receivedCount = allUserTxs.filter((t) => t.type === 'income' || t.direction === 'incoming').length;

    const filterCmd = {
      categoryFilter: category ? [String(category)] : undefined,
      typeFilter: type as any,
      dateFrom: dateFrom ? String(dateFrom) : undefined,
      dateTo: dateTo ? String(dateTo) : undefined,
      onlyUnusual: onlyUnusual === 'true',
      searchQuery: search ? String(search) : undefined,
    };

    const agGridPayload = agGridIntegration.buildGridAnalyticsPayload(transactions, filterCmd);
    const pythonAnalytics = await pythonAnalyticsService.runPythonTask({
      task: 'analyze_transactions',
      monthlyIncome: req.user!.monthlyIncome,
      transactions,
    });

    res.json({
      success: true,
      agGrid: agGridPayload,
      pythonAnalytics,
      transactions,
      total,
      summary: {
        totalTransactions: allUserTxs.length,
        totalSent,
        totalReceived,
        sentCount,
        receivedCount,
        netCashFlow: totalReceived - totalSent,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, merchant, description, category, type, amount, date, paymentMethod, isSharedFamilyTransaction } =
      req.body || {};
    const numAmount = Number(amount);
    if (!merchant || !category || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ success: false, error: 'Merchant, category, and positive amount are required.' });
      return;
    }

    const account = accountId
      ? await AccountModel.findOne({ _id: accountId, userId: req.userId })
      : await AccountModel.findOne({ userId: req.userId, status: 'active' });

    if (!account) {
      res.status(404).json({ success: false, error: 'No active account found for transaction.' });
      return;
    }

    const txType: 'income' | 'expense' | 'transfer' =
      type === 'income' ? 'income' : type === 'transfer' ? 'transfer' : 'expense';
    const isUnusual = txType === 'expense' && numAmount >= 10000 && !['Rent', 'Housing', 'Loan EMI'].includes(category);

    const tx = await TransactionModel.create({
      userId: req.userId,
      accountId: account._id,
      accountName: account.name,
      date: date ? new Date(date) : new Date(),
      merchant: String(merchant).trim(),
      description: String(description || merchant).trim(),
      category: String(category).trim(),
      type: txType,
      amount: numAmount,
      currency: 'INR',
      status: isUnusual ? 'flagged' : 'completed',
      paymentMethod: paymentMethod || 'upi',
      isRecurring: false,
      isUnusual,
      unusualReason: isUnusual
        ? `Single expenditure of ₹${numAmount.toLocaleString('en-IN')} in ${category} exceeds typical category threshold.`
        : undefined,
      isSharedFamilyTransaction: Boolean(isSharedFamilyTransaction),
      familyGroupId: req.user?.familyGroupId,
      tags: [String(category).toLowerCase()],
    });

    if (txType === 'income') {
      account.balance += numAmount;
    } else if (txType === 'expense') {
      account.balance = Math.max(0, account.balance - numAmount);
    }
    await account.save();

    await elasticIntegration.syncTransaction(tx);

    if (isUnusual) {
      await zapierIntegration.triggerAutomation({
        userId: req.userId!,
        automationType: 'upcoming_commitment_reminder',
        title: `Unusual Spending Flagged: ₹${numAmount.toLocaleString('en-IN')} at ${merchant}`,
        message: tx.unusualReason || `High spend in ${category}`,
        deduplicationKey: `unusual-tx-${String(tx._id)}`,
      });
    }

    res.status(201).json({ success: true, transaction: tx, updatedAccountBalance: account.balance });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/transactions/ag-grid-query', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, filterCommand } = req.body || {};
    const transactions = await TransactionModel.find({ userId: req.userId }).sort({ date: -1 });
    const cmd = query
      ? agGridIntegration.parseNaturalLanguageToGridFilter(String(query))
      : filterCommand || {};
    const agGridPayload = agGridIntegration.buildGridAnalyticsPayload(transactions, cmd);

    res.json({
      success: true,
      query: query || null,
      agGrid: agGridPayload,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 5. CSV Imports (Folder 5)
// ============================================================================
apiRouter.post('/transactions/import-csv', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { csvContent, accountId } = req.body || {};
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ success: false, error: 'csvContent string is required.' });
      return;
    }

    const importResult = await coreFinancialService.importTransactionsFromCsv({
      userId: req.userId!,
      accountId,
      csvContent,
    });

    const workerRun = await renderWorkerManager.runPostImportPipeline(req.userId!);

    res.status(201).json({
      success: true,
      ...importResult,
      backgroundWorkerPipeline: workerRun,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 6. Mandates & Recurring Commitments (Folder 6)
// ============================================================================
apiRouter.get('/mandates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const mandates = await MandateModel.find({ userId: req.userId }).sort({ dueDayOfMonth: 1 });
  const confirmedTotal = mandates
    .filter((m) => m.status === 'confirmed' && m.category !== 'Salary')
    .reduce((s, m) => s + m.amount, 0);
  const inferredCount = mandates.filter((m) => m.status === 'inferred').length;
  res.json({
    success: true,
    confirmedMonthlyOutflow: confirmedTotal,
    inferredCount,
    mandates,
  });
});

apiRouter.post('/mandates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, merchant, category, amount, dueDayOfMonth, frequency, isSharedWithFamily } = req.body || {};
    if (!title || !merchant || !amount) {
      res.status(400).json({ success: false, error: 'Title, merchant, and amount are required.' });
      return;
    }
    const dueDay = Math.min(31, Math.max(1, Number(dueDayOfMonth || 5)));
    const now = new Date();
    const nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (nextDueDate < now) {
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    }

    const mandate = await MandateModel.create({
      userId: req.userId,
      title: String(title).trim(),
      merchant: String(merchant).trim(),
      category: category || 'Other',
      amount: Number(amount),
      currency: 'INR',
      frequency: frequency || 'monthly',
      dueDayOfMonth: dueDay,
      nextDueDate,
      status: 'confirmed',
      confidenceScore: 1.0,
      autoPayEnabled: false,
      isSharedWithFamily: Boolean(isSharedWithFamily),
      familyGroupId: req.user?.familyGroupId,
    });

    await bryntumIntegration.syncUserFinancialCalendar(req.userId!);
    res.status(201).json({ success: true, mandate });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.patch('/mandates/:id/confirm', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mandate = await MandateModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!mandate) {
      res.status(404).json({ success: false, error: 'Mandate not found.' });
      return;
    }
    mandate.status = req.body?.status || 'confirmed';
    if (typeof req.body?.dueDayOfMonth === 'number') {
      mandate.dueDayOfMonth = Math.min(31, Math.max(1, req.body.dueDayOfMonth));
    }
    await mandate.save();

    await bryntumIntegration.syncUserFinancialCalendar(req.userId!);
    res.json({ success: true, mandate });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 7. Financial Plans & Recovery (Folder 7)
// ============================================================================
apiRouter.get('/plans', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  let plans: any[] = await FinancialPlanModel.find({ userId: req.userId }).sort({ createdAt: -1 });
  if (plans.length === 0) {
    const generated = await coreFinancialService.generateOrUpdateMonthlyPlan(req.userId!);
    plans = [generated];
  }
  res.json({ success: true, activePlan: plans[0], plans });
});

apiRouter.post('/plans/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { month } = req.body || {};
    const plan = await coreFinancialService.generateOrUpdateMonthlyPlan(req.userId!, month);
    res.status(201).json({ success: true, plan });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.patch('/plans/:id/recovery/:recId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const plan = await FinancialPlanModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!plan) {
      res.status(404).json({ success: false, error: 'Financial plan not found.' });
      return;
    }
    const decision: 'accepted' | 'rejected' = req.body?.status === 'rejected' ? 'rejected' : 'accepted';
    const rec = plan.recoveryRecommendations.find((r) => r.id === req.params.recId);
    if (!rec) {
      res.status(404).json({ success: false, error: 'Recovery recommendation not found.' });
      return;
    }
    rec.status = decision;
    if (decision === 'accepted') {
      plan.unallocatedBuffer += Math.round(rec.projectedSavings * 0.5);
    }
    await plan.save();
    await elasticIntegration.syncFinancialPlan(plan);

    res.json({ success: true, plan });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 8. Financial Goals & Milestones (Folder 8)
// ============================================================================
apiRouter.get('/goals', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const goals = await GoalModel.find({ userId: req.userId }).sort({ priority: 1, deadline: 1 });
  res.json({ success: true, goals });
});

apiRouter.post('/goals', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, category, targetAmount, currentAmount, monthlyContribution, deadline, priority, isSharedWithFamily } =
      req.body || {};
    if (!title || !targetAmount) {
      res.status(400).json({ success: false, error: 'Goal title and target amount are required.' });
      return;
    }

    const goal = await GoalModel.create({
      userId: req.userId,
      title: String(title).trim(),
      category: category || 'Other',
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount || 0),
      monthlyContribution: Number(monthlyContribution || Math.ceil(Number(targetAmount) / 6)),
      deadline: deadline ? new Date(deadline) : new Date(Date.now() + 180 * 86400000),
      priority: priority || 'medium',
      isSharedWithFamily: Boolean(isSharedWithFamily),
      familyGroupId: req.user?.familyGroupId,
      milestones: [
        { percentage: 25, reached: false, confirmedByUser: false },
        { percentage: 50, reached: false, confirmedByUser: false },
        { percentage: 75, reached: false, confirmedByUser: false },
        { percentage: 100, reached: false, confirmedByUser: false },
      ],
    });

    await bryntumIntegration.syncUserFinancialCalendar(req.userId!);
    res.status(201).json({ success: true, goal });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.patch('/goals/:id/contribute', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const goal = await GoalModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      res.status(404).json({ success: false, error: 'Goal not found.' });
      return;
    }
    const addAmount = Number(req.body?.amount || goal.monthlyContribution);
    if (isNaN(addAmount) || addAmount <= 0) {
      res.status(400).json({ success: false, error: 'Positive contribution amount required.' });
      return;
    }

    goal.currentAmount = Math.min(goal.targetAmount, goal.currentAmount + addAmount);
    const pct = (goal.currentAmount / goal.targetAmount) * 100;

    let newlyReachedMilestone: number | null = null;
    for (const ms of goal.milestones) {
      if (pct >= ms.percentage && !ms.reached) {
        ms.reached = true;
        ms.reachedAt = new Date();
        ms.confirmedByUser = true;
        newlyReachedMilestone = ms.percentage;
      }
    }
    if (pct >= 100) {
      goal.status = 'completed';
    }
    await goal.save();

    if (newlyReachedMilestone) {
      await zapierIntegration.triggerAutomation({
        userId: req.userId!,
        automationType: 'financial_milestone',
        title: `Milestone Reached: ${newlyReachedMilestone}% of "${goal.title}"!`,
        message: `Congratulations! You have saved ₹${goal.currentAmount.toLocaleString('en-IN')} of ₹${goal.targetAmount.toLocaleString('en-IN')} (${newlyReachedMilestone}%) towards "${goal.title}".`,
        deduplicationKey: `goal-ms-${String(goal._id)}-${newlyReachedMilestone}`,
      });
    }

    res.json({ success: true, goal, newlyReachedMilestone });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/goals/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const goal = await GoalModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      res.status(404).json({ success: false, error: 'Goal not found.' });
      return;
    }
    const { title, targetAmount, monthlyContribution, deadline, priority, status } = req.body || {};
    if (title) goal.title = String(title).trim();
    if (typeof targetAmount === 'number' && targetAmount > 0) goal.targetAmount = targetAmount;
    if (typeof monthlyContribution === 'number' && monthlyContribution > 0) goal.monthlyContribution = monthlyContribution;
    if (deadline) goal.deadline = new Date(deadline);
    if (priority) goal.priority = priority;
    if (status) goal.status = status;

    await goal.save();
    await bryntumIntegration.syncUserFinancialCalendar(req.userId!);
    res.json({ success: true, goal, message: 'Goal updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.delete('/goals/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const goal = await GoalModel.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!goal) {
      res.status(404).json({ success: false, error: 'Goal not found.' });
      return;
    }
    await bryntumIntegration.syncUserFinancialCalendar(req.userId!);
    res.json({ success: true, message: 'Goal removed.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 9. Family Finance (Folder 9 — Strict Privacy Boundaries Enforced)
// ============================================================================
apiRouter.get('/family', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const overview = await coreFinancialService.getPrivacyPreservingFamilyOverview(req.userId!);
    res.json({ success: true, ...overview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/family/shared-budget', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    const familyGroupId = user?.familyGroupId;
    if (!familyGroupId) {
      res.status(404).json({ success: false, error: 'No family group associated with this user.' });
      return;
    }
    const group = await FamilyGroupModel.findOne({ familyGroupId });
    if (!group) {
      res.status(404).json({ success: false, error: 'Family group not found for this user.' });
      return;
    }
    if (typeof req.body?.sharedMonthlyBudget === 'number' && req.body.sharedMonthlyBudget > 0) {
      group.sharedMonthlyBudget = req.body.sharedMonthlyBudget;
      await group.save();
    }
    res.json({ success: true, familyGroup: group });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/family/setup', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const { name, sharedMonthlyBudget } = req.body || {};
    const householdName = typeof name === 'string' && name.trim() ? name.trim() : `${user.name}'s Household`;
    const budget = typeof sharedMonthlyBudget === 'number' && sharedMonthlyBudget > 0 ? sharedMonthlyBudget : 30000;

    let familyGroupId = user.familyGroupId;
    let group: any = null;

    if (familyGroupId) {
      group = await FamilyGroupModel.findOne({ familyGroupId });
    }

    if (!group) {
      familyGroupId = `aura-family-${user._id}`;
      group = await FamilyGroupModel.create({
        familyGroupId,
        name: householdName,
        sharedMonthlyBudget: budget,
        sharedCategories: ['Housing', 'Groceries', 'Utilities', 'Healthcare'],
        members: [
          {
            userId: user._id,
            name: user.name,
            email: user.email,
            relationship: 'Household Lead',
            role: 'admin',
            privacyLevel: 'shared_summary_only',
            monthlySharedContribution: Math.round(budget * 0.6),
          },
        ],
      });
      user.familyGroupId = familyGroupId;
      await user.save();
    } else {
      group.name = householdName;
      group.sharedMonthlyBudget = budget;
      await group.save();
    }

    const overview = await coreFinancialService.getPrivacyPreservingFamilyOverview(String(user._id));
    res.json({ success: true, familyGroup: group, overview });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 10. Financial Life Calendar — Bryntum Integration (Folder 10)
// ============================================================================
apiRouter.get('/calendar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dataset = await bryntumIntegration.getBryntumCalendarDataset(
      req.userId!,
      req.query.start ? String(req.query.start) : undefined,
      req.query.end ? String(req.query.end) : undefined
    );
    res.json(dataset);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/calendar/gantt-roadmap', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dataset = await bryntumIntegration.getBryntumGanttRoadmap(req.userId!);
    res.json(dataset);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/calendar/scheduler-commitments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dataset = await bryntumIntegration.getBryntumSchedulerCommitments(req.userId!);
    res.json(dataset);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/calendar/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, eventType, startDate, amount, notes } = req.body || {};
    if (!title || !startDate) {
      res.status(400).json({ success: false, error: 'Event title and startDate are required.' });
      return;
    }
    const start = new Date(startDate);
    const end = new Date(start.getTime() + 3600 * 1000);
    const event = await CalendarEventModel.create({
      userId: req.userId,
      title: String(title).trim(),
      eventType: eventType || 'reminder',
      startDate: start,
      endDate: end,
      allDay: true,
      amount: amount ? Number(amount) : undefined,
      currency: 'INR',
      status: 'upcoming',
      color: '#2563eb',
      notes: notes ? String(notes) : undefined,
    });

    await zapierIntegration.triggerAutomation({
      userId: req.userId!,
      automationType: 'financial_calendar_reminder',
      title: `Financial Calendar Event Scheduled: ${event.title}`,
      message: `Scheduled "${event.title}" for ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
      deduplicationKey: `cal-evt-${String(event._id)}`,
    });

    res.status(201).json({ success: true, event });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.patch('/calendar/events/:id/reschedule', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newStartDate } = req.body || {};
    if (!newStartDate) {
      res.status(400).json({ success: false, error: 'newStartDate ISO string is required.' });
      return;
    }
    const updated = await bryntumIntegration.rescheduleCalendarEvent(req.userId!, req.params.id, String(newStartDate));
    res.json({
      success: true,
      message: 'Calendar event and linked recurring mandate updated consistently.',
      ...updated,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 10b. Financial Profile Management
// ============================================================================
apiRouter.get('/user/financial-profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const profile = user.financialProfile || {
      monthlyIncome: user.monthlyIncome || 95000,
      incomeType: 'salary',
      incomeFrequency: 'monthly',
      expectedIncomeDate: 1,
      additionalIncome: 0,
      incomeStatus: 'user_estimate',
      preferredCurrency: user.currency || 'USD',
    };
    res.json({
      success: true,
      profile,
      user: {
        name: user.name,
        email: user.email,
        currency: user.currency,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/user/financial-profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const {
      monthlyIncome,
      incomeType,
      incomeFrequency,
      expectedIncomeDate,
      additionalIncome,
      incomeStatus,
      preferredCurrency,
    } = req.body || {};

    const newIncome = Number(monthlyIncome ?? user.monthlyIncome ?? 5000);
    user.monthlyIncome = newIncome;
    user.currency = preferredCurrency || user.currency || 'USD';

    user.financialProfile = {
      monthlyIncome: newIncome,
      incomeType: incomeType || user.financialProfile?.incomeType || 'salary',
      incomeFrequency: incomeFrequency || user.financialProfile?.incomeFrequency || 'monthly',
      expectedIncomeDate: Number(expectedIncomeDate ?? user.financialProfile?.expectedIncomeDate ?? 1),
      additionalIncome: Number(additionalIncome ?? user.financialProfile?.additionalIncome ?? 0),
      incomeStatus: incomeStatus || user.financialProfile?.incomeStatus || 'user_estimate',
      preferredCurrency: user.currency,
    };

    await user.save();

    // Recalculate current month's financial plan if one exists
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      await coreFinancialService.generateOrUpdateMonthlyPlan(req.userId!, currentMonth);
    } catch {
      // Non-fatal if plan recalculation will run on next load
    }

    res.json({
      success: true,
      message: 'Financial profile updated successfully',
      profile: user.financialProfile,
      monthlyIncome: user.monthlyIncome,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 11. AI Assistant & Persistent Conversations
// ============================================================================
apiRouter.get('/conversations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    let filter: any = { userId };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { conversationSummary: { $regex: search, $options: 'i' } },
      ];
    }

    const conversations = await ConversationModel.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(50);

    res.json({ success: true, conversations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/conversations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const title = (req.body?.title || 'New Conversation').trim();
    const conversation = await ConversationModel.create({
      userId,
      title,
      lastMessageAt: new Date(),
    });
    res.status(201).json({ success: true, conversation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/conversations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const convId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(convId)) {
      res.status(400).json({ success: false, error: 'Invalid conversation ID' });
      return;
    }
    const conversation = await ConversationModel.findOne({ _id: convId, userId });
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    const messages = await MessageModel.find({ conversationId: conversation._id, userId }).sort({ createdAt: 1 });
    res.json({ success: true, conversation, messages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/conversations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const convId = req.params.id;
    const title = (req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ success: false, error: 'Title is required' });
      return;
    }
    const conversation = await ConversationModel.findOneAndUpdate(
      { _id: convId, userId },
      { title },
      { new: true }
    );
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    res.json({ success: true, conversation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.delete('/conversations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const convId = req.params.id;
    const conversation = await ConversationModel.findOneAndDelete({ _id: convId, userId });
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    await MessageModel.deleteMany({ conversationId: convId, userId });
    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/conversations/:id/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const convId = req.params.id;
    const { content, includeKernelResearch } = req.body || {};
    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'Message content is required' });
      return;
    }

    const conversation = await ConversationModel.findOne({ _id: convId, userId });
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    // Load recent messages for conversational context
    const previousMessages = await MessageModel.find({ conversationId: conversation._id, userId })
      .sort({ createdAt: -1 })
      .limit(8);
    previousMessages.reverse();

    const conversationHistory = previousMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 1. Save user message first so it is preserved even if Gemini is unavailable
    const userMsg = await MessageModel.create({
      conversationId: conversation._id,
      userId,
      role: 'user',
      content,
    });

    // 2. Process through AURA Gemini Orchestrator
    const aiResult = await auraAiOrchestrator.processConversationalQuery({
      userId: req.userId!,
      prompt: content,
      conversationHistory,
      includeKernelResearch: Boolean(includeKernelResearch),
      conversationId: String(conversation._id),
    });

    // 3. Save assistant message (preserving error notice if service unavailable)
    const assistantMsg = await MessageModel.create({
      conversationId: conversation._id,
      userId,
      role: 'assistant',
      content: aiResult.explanation || aiResult.answer || (aiResult.serviceUnavailable ? aiResult.error : ''),
      toolAction: aiResult.toolAction,
      suggestedNextPrompts: aiResult.suggestedNextPrompts || [],
    });

    // Update conversation title if default
    if (conversation.title === 'New Conversation') {
      const generatedTitle = content.length > 36 ? content.slice(0, 36).trim() + '...' : content;
      conversation.title = generatedTitle;
    }
    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.json({
      success: !aiResult.serviceUnavailable,
      conversation,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      toolAction: aiResult.toolAction,
      suggestedNextPrompts: aiResult.suggestedNextPrompts,
      purchaseCompanion: aiResult.purchaseCompanion,
      serviceUnavailable: Boolean(aiResult.serviceUnavailable),
      error: aiResult.error,
      canRetry: aiResult.canRetry,
      observability: aiResult.observability,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/conversations/:id/messages/stream', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const convId = req.params.id;
    const { content, includeKernelResearch } = req.body || {};
    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'Message content is required' });
      return;
    }

    const conversation = await ConversationModel.findOne({ _id: convId, userId });
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    const previousMessages = await MessageModel.find({ conversationId: conversation._id, userId })
      .sort({ createdAt: -1 })
      .limit(8);
    previousMessages.reverse();

    const conversationHistory = previousMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write(': connected\n\n');

    // Save user message immediately
    const userMsg = await MessageModel.create({
      conversationId: conversation._id,
      userId,
      role: 'user',
      content,
    });

    await auraAiOrchestrator.processConversationalQueryStream(
      {
        userId: req.userId!,
        prompt: content,
        conversationHistory,
        includeKernelResearch: Boolean(includeKernelResearch),
      },
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'delta', delta: chunk.delta })}\n\n`);
      },
      async (finalResult) => {
        const assistantMsg = await MessageModel.create({
          conversationId: conversation._id,
          userId,
          role: 'assistant',
          content: finalResult.explanation || finalResult.answer,
          toolAction: finalResult.toolAction,
          suggestedNextPrompts: finalResult.suggestedNextPrompts || [],
        });

        if (conversation.title === 'New Conversation') {
          const generatedTitle = content.length > 36 ? content.slice(0, 36).trim() + '...' : content;
          conversation.title = generatedTitle;
        }
        conversation.lastMessageAt = new Date();
        await conversation.save();

        res.write(
          `data: ${JSON.stringify({
            type: 'finish',
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            result: finalResult,
          })}\n\n`
        );
        res.end();
      }
    );
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err?.message });
    } else {
      res.end();
    }
  }
});

// ============================================================================
// 11. AI Assistant & Astropods Multi-Agent Orchestration (Folder 11)
// ============================================================================
apiRouter.post('/ai/ask', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, includeKernelResearch } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'A natural-language prompt is required.' });
      return;
    }
    const response = await auraAiOrchestrator.processConversationalQuery({
      userId: req.userId!,
      prompt,
      includeKernelResearch: Boolean(includeKernelResearch),
    });
    if (response.serviceUnavailable) {
      res.status(503).json(response);
      return;
    }
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ai/ask/stream', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, includeKernelResearch } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'A natural-language prompt is required.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write(': connected\n\n');

    await auraAiOrchestrator.processConversationalQueryStream(
      {
        userId: req.userId!,
        prompt,
        includeKernelResearch: Boolean(includeKernelResearch),
      },
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'delta', delta: chunk.delta })}\n\n`);
      },
      (finalResult) => {
        res.write(`data: ${JSON.stringify({ type: 'finish', result: finalResult })}\n\n`);
        res.end();
      }
    );
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err?.message });
    } else {
      res.end();
    }
  }
});

apiRouter.get('/ai/agents', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    astropodsStatus: astropodsIntegration.getHealthStatus(),
    agents: astropodsIntegration.getAgents(),
    recentExecutions: astropodsIntegration.getRecentExecutions(15),
  });
});

apiRouter.get('/ai/agents/availability', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const availability = await astropodsIntegration.checkRemoteAvailability();
    res.json({
      success: true,
      ...availability,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ai/agents/:agentId/traces', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.agentId as any;
    const agents = astropodsIntegration.getAgents();
    if (!agents.some((a) => a.id === agentId)) {
      res.status(404).json({ success: false, error: `Unknown Astropods agent ID: ${agentId}` });
      return;
    }
    const remoteTraces = await astropodsIntegration.fetchRemoteAgentTraces(agentId, 15);
    const localHistory = astropodsIntegration
      .getRecentExecutions(25)
      .filter((wf) => wf.participatingAgents.includes(agentId));
    res.json({
      success: true,
      agentId,
      ...remoteTraces,
      recentBackendWorkflows: localHistory,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ai/agents/:agentId/invoke', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.agentId as any;
    const { task, input, idempotencyKey, timeoutMs } = req.body || {};
    const invocation = await astropodsIntegration.invokeAgent({
      agentId,
      task: String(task || `Invoke ${agentId}`),
      input: input || {},
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
    });
    res.json({
      success: true,
      invocation,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 12. Purchase Intelligence — Channel3 Smart Purchase Companion (Folder 12)
// ============================================================================
apiRouter.post('/purchase/evaluate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, maxPriceInr, includeKernelResearch } = req.body || {};
    const searchQuery = String(query || 'laptop').trim();

    const userObjId = new mongoose.Types.ObjectId(req.userId!);
    const [accounts, mandates, goals, transactions, plan] = await Promise.all([
      AccountModel.find({ userId: userObjId, status: 'active' }),
      MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } }),
      GoalModel.find({ userId: userObjId, status: 'active' }),
      TransactionModel.find({ userId: userObjId }).sort({ date: -1 }).limit(50),
      coreFinancialService.generateOrUpdateMonthlyPlan(req.userId!),
    ]);

    const liquidBalance = accounts
      .filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'wallet')
      .reduce((s, a) => s + a.balance, 0);
    const upcomingCommitments = mandates
      .filter((m) => m.category !== 'Salary')
      .reduce((s, m) => s + m.amount, 0);
    const activeGoalsMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
    const recent30DaySpend = transactions
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const ch3Result = await channel3Integration.searchProducts({
      query: searchQuery,
      maxPriceInr: maxPriceInr ? Number(maxPriceInr) : undefined,
    });

    const discretionaryBudget = req.user!.financialPolicy.discretionaryMonthlyCap || 18000;

    const evaluatedProducts = channel3Integration.evaluateProductsAffordability(ch3Result.products, {
      monthlyIncomeInr: req.user!.monthlyIncome,
      availableDiscretionaryBudgetInr: discretionaryBudget,
      upcomingCommitmentsInr: upcomingCommitments,
      activeGoalsMonthlyTargetInr: activeGoalsMonthly,
      savingsTargetInr: plan.totalSavingsTarget,
      recent30DayExpenditureInr: recent30DaySpend,
      liquidBalanceInr: liquidBalance,
      userRiskTolerance: req.user!.spendingPreferences.riskTolerance,
    });

    let kernelResearch = null;
    if (includeKernelResearch) {
      kernelResearch = await kernelIntegration.runAssistedResearch({
        userId: req.userId!,
        topic: searchQuery,
        targetCategory: 'product_specs',
      });
    }

    res.json({
      success: true,
      query: searchQuery,
      liveChannel3ApiUsed: ch3Result.liveApiUsed,
      channel3StatusMessage: ch3Result.statusMessage,
      financialContextSummary: {
        monthlyIncomeInr: req.user!.monthlyIncome,
        availableDiscretionaryBudgetInr: discretionaryBudget,
        upcomingCommitmentsInr: upcomingCommitments,
        activeGoalsMonthlyTargetInr: activeGoalsMonthly,
        savingsTargetInr: plan.totalSavingsTarget,
        liquidBalanceInr: liquidBalance,
      },
      evaluatedProducts,
      kernelResearch,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 12b. AURA E-Commerce — Modern Online Storefront & Fulfillment Engine
// ============================================================================

// Merchant/Admin authorization middleware
const requireMerchantAuth = async (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found.' });
    }

    const isAuthorized =
      user.accountType === 'business' ||
      user.role === 'merchant' ||
      user.role === 'admin';

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Merchant or Business account privileges are required to access this dashboard. Regular personal accounts cannot access merchant operations.',
      });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
};

// --- Product Discovery (Channel3 Catalog) ---
apiRouter.get('/ecommerce/products', async (req: Request, res: Response) => {
  try {
    const { q, category, brand, minPrice, maxPrice, limit, offset } = req.query;
    const result = await channel3Integration.searchStoreProducts({
      query: q ? String(q) : undefined,
      category: category ? String(category) : undefined,
      brand: brand ? String(brand) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ecommerce/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await channel3Integration.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    res.json({ success: true, product });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ecommerce/products/compare', async (req: Request, res: Response) => {
  try {
    const { productIds, userId } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length < 2) {
      return res.status(400).json({ success: false, error: 'productIds array with at least 2 items is required.' });
    }

    let financialContext: any = null;
    const targetUserId = userId || (req as any).userId;
    if (targetUserId) {
      try {
        const plan = await FinancialPlanModel.findOne({ userId: targetUserId }).sort({ createdAt: -1 });
        financialContext = {
          availableDiscretionaryBudgetInr: plan?.totalDiscretionaryBudget || 25000,
        };
      } catch {
        // optional financial context
      }
    }

    const comparison = await channel3Integration.compareProducts(productIds, financialContext);
    res.json({ success: true, ...comparison });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ecommerce/products/:id/click', async (req: Request, res: Response) => {
  try {
    const { merchantName, monetizableUrl } = req.body || {};
    await recordAuditLog({
      actor: 'channel3_shopper',
      action: 'channel3_monetizable_link_click',
      resourceType: 'product_offer',
      resourceId: req.params.id,
      status: 'success',
      details: {
        productId: req.params.id,
        merchantName,
        monetizableUrl,
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ success: true, recorded: true });
  } catch {
    res.json({ success: true, recorded: false });
  }
});

apiRouter.get('/ecommerce/categories', async (_req: Request, res: Response) => {
  try {
    const categories = channel3Integration.getCategories();
    res.json({ success: true, categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// --- Shopping Cart ---
apiRouter.get('/ecommerce/cart', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cartData = await ecommerceService.getCart(req.userId!);
    res.json({ success: true, ...cartData });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ecommerce/cart/items', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId, quantity, selectedVariant } = req.body || {};
    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId is required.' });
    }
    await ecommerceService.addItemToCart(req.userId!, {
      productId,
      quantity,
      selectedVariant,
    });
    const cartData = await ecommerceService.getCart(req.userId!);
    res.json({ success: true, ...cartData });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/ecommerce/cart/items/:productId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { quantity, selectedVariant } = req.body || {};
    await ecommerceService.updateCartItem(req.userId!, req.params.productId, {
      quantity,
      selectedVariant,
    });
    const cartData = await ecommerceService.getCart(req.userId!);
    res.json({ success: true, ...cartData });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.delete('/ecommerce/cart/items/:productId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ecommerceService.removeCartItem(req.userId!, req.params.productId);
    const cartData = await ecommerceService.getCart(req.userId!);
    res.json({ success: true, ...cartData });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.delete('/ecommerce/cart', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ecommerceService.clearCart(req.userId!);
    const cartData = await ecommerceService.getCart(req.userId!);
    res.json({ success: true, ...cartData });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// --- Checkout & PayPal Sandbox Payment ---
apiRouter.post('/ecommerce/checkout/validate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items } = req.body || {};
    let targetItems = items;
    if (!targetItems || targetItems.length === 0) {
      const cartData = await ecommerceService.getCart(req.userId!);
      targetItems = cartData.cart.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        selectedVariant: it.selectedVariant,
      }));
    }
    const calculation = await ecommerceService.calculateAuthoritativeTotals(targetItems);
    res.json({ success: true, ...calculation });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ecommerce/orders/create-paypal-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shippingAddress, items, notes, customReturnUrl, customCancelUrl } = req.body || {};
    let finalReturnUrl = customReturnUrl as string | undefined;
    let finalCancelUrl = customCancelUrl as string | undefined;

    if (!finalReturnUrl) {
      const frontendOrigin = resolveFrontendOrigin(req);
      finalReturnUrl = `${frontendOrigin}/?tab=smart-purchases&view=checkout-success`;
      finalCancelUrl = `${frontendOrigin}/?tab=smart-purchases&view=checkout-cancelled`;
    }

    const result = await ecommerceService.createCheckoutOrder(req.userId!, {
      shippingAddress,
      items,
      notes,
      customReturnUrl: finalReturnUrl,
      customCancelUrl: finalCancelUrl,
    });
    res.json({
      success: true,
      order: result.order,
      paypalOrderId: result.paypalOrderId,
      approvalUrl: result.approvalUrl,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/ecommerce/orders/capture-payment', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, orderNumber, paypalOrderId } = req.body || {};
    if (!paypalOrderId) {
      return res.status(400).json({ success: false, error: 'paypalOrderId is required to capture payment.' });
    }
    const result = await ecommerceService.captureOrderPayment(req.userId!, {
      orderId,
      orderNumber,
      paypalOrderId,
    });
    res.json({
      success: true,
      order: result.order,
      captureId: result.captureId,
      isAlreadyPaid: result.isAlreadyPaid,
      message: 'Payment captured and verified successfully.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// --- Customer Order Tracking ---
apiRouter.get('/ecommerce/orders/my-orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await ecommerceService.getCustomerOrders(req.userId!);
    res.json({ success: true, orders });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ecommerce/orders/:orderId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await ecommerceService.getCustomerOrderById(req.userId!, req.params.orderId);
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err?.message });
  }
});

// --- Merchant Dashboard & Manual Fulfillment ---
apiRouter.get('/ecommerce/merchant/overview', requireAuth, requireMerchantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const overview = await ecommerceService.getMerchantOverview(req.userId);
    res.json({ success: true, overview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ecommerce/merchant/received-payments', requireAuth, requireMerchantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: Record<string, any> = {
      userId: req.userId,
      $or: [{ direction: 'incoming' }, { type: 'income' }],
    };
    const payments = await TransactionModel.find(query).sort({ date: -1 });
    const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      totalCount: payments.length,
      totalAmount: totalReceived,
      currency: 'USD',
      payments,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ecommerce/merchant/orders', requireAuth, requireMerchantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, search, limit, offset } = req.query;
    const result = await ecommerceService.getMerchantOrders({
      merchantUserId: req.userId,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/ecommerce/merchant/orders/:orderId', requireAuth, requireMerchantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await ecommerceService.getMerchantOrderById(req.params.orderId, req.userId);
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err?.message });
  }
});

apiRouter.put('/ecommerce/merchant/orders/:orderId/fulfillment', requireAuth, requireMerchantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fulfillmentStatus, status, carrier, trackingNumber, shippingDate, estimatedDeliveryDate, notes } = req.body || {};
    const targetStatus = fulfillmentStatus || status;
    if (!targetStatus) {
      return res.status(400).json({ success: false, error: 'fulfillmentStatus or status is required.' });
    }
    const user = await UserModel.findById(req.userId);
    const order = await ecommerceService.updateOrderFulfillment({
      orderId: req.params.orderId,
      merchantUserId: req.userId,
      fulfillmentStatus: targetStatus,
      carrier,
      trackingNumber,
      shippingDate,
      estimatedDeliveryDate,
      notes,
      adminName: user?.name || 'AURA Merchant Admin',
    });
    res.json({
      success: true,
      order,
      message: `Order fulfillment status updated to ${targetStatus}.`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 13. Elastic Search — Financial Memory & Hybrid Retrieval (Folder 13)
// ============================================================================
apiRouter.post('/elastic/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, scope, limit } = req.body || {};
    const searchResult = await elasticIntegration.searchFinancialMemory({
      userId: req.userId!,
      query: String(query || ''),
      scope: scope || 'all',
      limit: limit ? Number(limit) : 25,
    });
    res.json({ success: true, ...searchResult });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/elastic/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerRun = await renderWorkerManager.runPostImportPipeline(req.userId!);
    const queueFlush = await elasticIntegration.processRetryQueue();
    res.json({
      success: true,
      workerRun,
      queueFlush,
      elasticHealth: await elasticIntegration.getHealthStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 14. Notifications (Folder 14)
// ============================================================================
apiRouter.get('/notifications', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const notifications = await NotificationModel.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  res.json({ success: true, unreadCount, notifications });
});

apiRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const notif = await NotificationModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { isRead: true } },
    { new: true }
  );
  res.json({ success: true, notification: notif });
});

apiRouter.put('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const notif = await NotificationModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { isRead: true } },
    { new: true }
  );
  res.json({ success: true, notification: notif });
});

apiRouter.post('/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = await NotificationModel.updateMany({ userId: req.userId, isRead: false }, { $set: { isRead: true } });
  res.json({ success: true, count: result.modifiedCount, unreadCount: 0 });
});

apiRouter.post('/notifications/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = await NotificationModel.updateMany({ userId: req.userId, isRead: false }, { $set: { isRead: true } });
  res.json({ success: true, count: result.modifiedCount, unreadCount: 0 });
});

// ============================================================================
// 15. Payment Preparation — Financial Guardian (Folder 15)
// ============================================================================
apiRouter.get('/payments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const payments = await PaymentRequestModel.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(25);
  res.json({
    success: true,
    paypalSandboxStatus: paypalIntegration.getHealthStatus(),
    payments,
  });
});

apiRouter.post('/payments/prepare', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, recipientName, recipientEmail, merchantCategory, description, amountInr, idempotencyKey } =
      req.body || {};
    if (!recipientName || !amountInr) {
      res.status(400).json({ success: false, error: 'Recipient name and amountInr are required.' });
      return;
    }

    const paymentRequest = await paymentGuardianService.preparePaymentRequest({
      userId: req.userId!,
      accountId,
      recipientName: String(recipientName),
      recipientEmail: recipientEmail ? String(recipientEmail) : undefined,
      merchantCategory: merchantCategory ? String(merchantCategory) : 'General',
      description: String(description || `Payment to ${recipientName}`),
      amountInr: Number(amountInr),
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
    });

    res.status(201).json({
      success: true,
      paymentRequest,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 16. PIN Verification & Approval Token Issuance (Folder 16)
// ============================================================================
apiRouter.post(
  '/payments/:id/verify-pin',
  requireAuth,
  strictAuthRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pin } = req.body || {};
      if (!pin) {
        res.status(400).json({ success: false, error: 'Security PIN is required to authorise payment.' });
        return;
      }

      const verified = await paymentGuardianService.verifyPinForPayment({
        userId: req.userId!,
        paymentRequestId: req.params.id,
        pin: String(pin),
      });

      res.json({
        success: true,
        message: 'Argon2id PIN verified. Short-lived payment approval token issued.',
        ...verified,
      });
    } catch (err: any) {
      res.status(401).json({ success: false, error: err?.message });
    }
  }
);

// ============================================================================
// 17. PayPal Orders API v2 (Folder 17)
// ============================================================================
apiRouter.post('/payments/:id/paypal-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { approvalToken } = req.body || {};
    if (!approvalToken) {
      res.status(400).json({
        success: false,
        error: 'Short-lived approvalToken from PIN verification is required to create a PayPal Order.',
      });
      return;
    }

    let customReturnUrl = req.body?.customReturnUrl as string | undefined;
    let customCancelUrl = req.body?.customCancelUrl as string | undefined;
    if (!customReturnUrl) {
      const frontendOrigin = resolveFrontendOrigin(req);
      customReturnUrl = `${frontendOrigin}/payments?status=approved`;
      customCancelUrl = `${frontendOrigin}/payments?status=cancelled`;
    }

    const result = await paymentGuardianService.createPayPalOrderForApprovedRequest({
      userId: req.userId!,
      paymentRequestId: req.params.id,
      approvalToken: String(approvalToken),
      customReturnUrl,
      customCancelUrl,
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/payments/paypal-order/:orderId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderInfo = await paypalIntegration.getOrder(req.params.orderId);
    res.json({ success: true, order: orderInfo });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 18. PayPal Capture (Folder 18)
// ============================================================================
apiRouter.post('/payments/:id/paypal-capture', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const captureRes = await paymentGuardianService.capturePayPalOrder({
      userId: req.userId!,
      paymentRequestId: req.params.id,
      paypalOrderId: req.body?.paypalOrderId,
    });

    res.json({
      success: true,
      ...captureRes,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// Direct capture endpoint for return from PayPal Checkout
apiRouter.post('/payments/capture-paypal-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, paymentRequestId } = req.body || {};
    if (!orderId && !paymentRequestId) {
      res.status(400).json({
        success: false,
        error: 'Either orderId or paymentRequestId is required to capture PayPal payment.',
      });
      return;
    }

    const captureRes = await paymentGuardianService.capturePayPalOrder({
      userId: req.userId!,
      paymentRequestId,
      paypalOrderId: orderId,
    });

    res.json({
      success: true,
      ...captureRes,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 19. PayPal Webhooks (Folder 19)
// ============================================================================
apiRouter.post('/webhooks/paypal', async (req: Request, res: Response) => {
  try {
    const result = await paymentGuardianService.handlePayPalWebhook({
      headers: req.headers,
      webhookEvent: req.body || {},
    });
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// 20. External Integrations, KERNEL, Zapier, Render Workers & Audit (Folder 20)
// ============================================================================
apiRouter.get('/integrations/status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const elasticHealth = await elasticIntegration.getHealthStatus();
  res.json({
    success: true,
    integrations: {
      agGrid: agGridIntegration.getHealthStatus(),
      apimatic: apimaticIntegration.getHealthStatus(),
      astropods: astropodsIntegration.getHealthStatus(),
      bryntum: bryntumIntegration.getHealthStatus(),
      channel3: channel3Integration.getHealthStatus(),
      elastic: elasticHealth,
      kernel: kernelIntegration.getHealthStatus(),
      paypal: paypalIntegration.getHealthStatus(),
      render: renderWorkerManager.getHealthStatus(),
      zapier: zapierIntegration.getHealthStatus(),
      gemini: auraAiOrchestrator.getHealthStatus(),
    },
  });
});

apiRouter.post('/kernel/research', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { topic, targetCategory } = req.body || {};
    if (!topic) {
      res.status(400).json({ success: false, error: 'Research topic is required.' });
      return;
    }
    const research = await kernelIntegration.runAssistedResearch({
      userId: req.userId!,
      topic: String(topic),
      targetCategory,
    });
    res.json({ success: true, research });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/automations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const rules = await zapierIntegration.ensureDefaultAutomationRules(req.userId!, req.user!.email);
  res.json({
    success: true,
    zapierStatus: zapierIntegration.getHealthStatus(),
    rules,
    recentExecutions: zapierIntegration.getExecutionLogs(20),
  });
});

apiRouter.patch('/automations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rule = await AutomationRuleModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!rule) {
      res.status(404).json({ success: false, error: 'Automation rule not found.' });
      return;
    }
    if (typeof req.body?.enabled === 'boolean') rule.enabled = req.body.enabled;
    if (req.body?.channel) rule.channel = req.body.channel;
    if (req.body?.targetDestination) rule.targetDestination = String(req.body.targetDestination).trim();
    await rule.save();
    res.json({ success: true, rule });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/automations/:id/test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rule = await AutomationRuleModel.findOne({ _id: req.params.id, userId: req.userId });
    if (!rule) {
      res.status(404).json({ success: false, error: 'Automation rule not found.' });
      return;
    }
    const result = await zapierIntegration.triggerAutomation({
      userId: req.userId!,
      automationType: rule.automationType,
      title: `[Test Trigger] ${rule.name}`,
      message: `Manual test trigger for "${rule.name}" (${rule.channel} -> ${rule.targetDestination}).`,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/workers/run-daily', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const summary = await renderWorkerManager.runDailyCommitmentsWorkflow(req.userId);
  res.json({ success: true, workerRun: summary });
});

apiRouter.get('/audit-logs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const logs = await AuditLogModel.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(40);
  res.json({ success: true, logs });
});

apiRouter.post('/scenarios/simulate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scenarioType } = req.body || {};
    const userId = req.userId!;
    const userObjId = new mongoose.Types.ObjectId(userId);
    const primaryAccount = await AccountModel.findOne({ userId: userObjId, type: 'checking', status: 'active' });

    let resultSummary = '';
    let simulationDetails: any = null;

    if (scenarioType === 'fine_dining_spike') {
      const tx = await TransactionModel.create({
        userId: userObjId,
        accountId: primaryAccount?._id,
        accountName: primaryAccount?.name || 'Primary Checking',
        date: new Date(),
        merchant: 'Trishna Gourmet Seafood & Wine',
        description: 'Simulated Weekend Dining Spike (Scenario Simulation)',
        category: 'Dining',
        type: 'expense',
        amount: 6800,
        currency: 'INR',
        status: 'completed',
        paymentMethod: 'card',
        isRecurring: false,
        isUnusual: true,
        unusualReason: 'Exceeds historical 90-day dining average by 240%',
        anomalyScore: 0.88,
        tags: ['simulated', 'dining_spike'],
      });

      if (primaryAccount) {
        primaryAccount.balance = Math.max(0, primaryAccount.balance - 6800);
        await primaryAccount.save();
      }

      await coreFinancialService.generateOrUpdateMonthlyPlan(userId);

      resultSummary = 'Simulated ₹6,800 fine-dining spike. Flagged as unusual transaction and updated monthly recovery plan.';
      simulationDetails = { transaction: tx };
    } else if (scenarioType === 'salary_bonus') {
      const tx = await TransactionModel.create({
        userId: userObjId,
        accountId: primaryAccount?._id,
        accountName: primaryAccount?.name || 'Primary Checking',
        date: new Date(),
        merchant: 'TechCorp India Pvt Ltd',
        description: 'Simulated Quarterly Performance Bonus',
        category: 'Income',
        type: 'income',
        amount: 25000,
        currency: 'INR',
        status: 'completed',
        paymentMethod: 'bank_transfer',
        isRecurring: false,
        isUnusual: false,
        tags: ['simulated', 'bonus'],
      });

      if (primaryAccount) {
        primaryAccount.balance += 25000;
        await primaryAccount.save();
      }

      await coreFinancialService.generateOrUpdateMonthlyPlan(userId);

      resultSummary = 'Simulated ₹25,000 performance bonus credit. Available balance and savings capacity increased.';
      simulationDetails = { transaction: tx };
    } else if (scenarioType === 'emergency_medical') {
      const tx = await TransactionModel.create({
        userId: userObjId,
        accountId: primaryAccount?._id,
        accountName: primaryAccount?.name || 'Primary Checking',
        date: new Date(),
        merchant: 'Apollo Multispecialty Hospital',
        description: 'Simulated Unexpected Emergency Medical Diagnostic',
        category: 'Healthcare',
        type: 'expense',
        amount: 14500,
        currency: 'INR',
        status: 'completed',
        paymentMethod: 'card',
        isRecurring: false,
        isUnusual: true,
        unusualReason: 'Unplanned medical expense — Emergency Reserve protection active',
        anomalyScore: 0.79,
        tags: ['simulated', 'emergency'],
      });

      if (primaryAccount) {
        primaryAccount.balance = Math.max(0, primaryAccount.balance - 14500);
        await primaryAccount.save();
      }

      await coreFinancialService.generateOrUpdateMonthlyPlan(userId);

      resultSummary = 'Simulated ₹14,500 emergency medical expense. Emergency reserve cushion evaluated.';
      simulationDetails = { transaction: tx };
    } else {
      // Default: subscription surge
      const mandate = await MandateModel.create({
        userId: userObjId,
        accountId: primaryAccount?._id,
        title: 'Cloud AI Developer Suite',
        merchant: 'CloudAI Platforms Inc',
        category: 'Subscription',
        amount: 2200,
        currency: 'INR',
        frequency: 'monthly',
        dueDayOfMonth: 12,
        nextDueDate: new Date(Date.now() + 10 * 86400000),
        status: 'confirmed',
        confidenceScore: 0.95,
        autoPayEnabled: false,
        notes: 'Simulated new software subscription',
      });

      await bryntumIntegration.syncUserFinancialCalendar(userId);
      resultSummary = 'Simulated new recurring commitment: Cloud AI Developer Suite (₹2,200/mo) synced to Financial Calendar.';
      simulationDetails = { mandate };
    }

    await recordAuditLog({
      userId,
      actor: 'system_worker',
      action: 'scenario_simulated',
      resourceType: 'simulation',
      status: 'success',
      details: { scenarioType, summary: resultSummary },
    });

    res.json({
      success: true,
      scenarioType,
      message: resultSummary,
      simulationDetails,
      isSimulated: true,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Scenario simulation failed' });
  }
});

apiRouter.post('/seed/reset', async (_req: Request, res: Response) => {
  try {
    const seeded = await ensureDemoUserAlexSeeded(true);
    res.json({
      success: true,
      message: 'Demo user Alex Sharma and family data reset to clean baseline.',
      user: sanitizeUser(seeded.user),
      credentials: {
        email: DEMO_ALEX_CREDENTIALS.email,
        pin: DEMO_ALEX_CREDENTIALS.pin,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});
