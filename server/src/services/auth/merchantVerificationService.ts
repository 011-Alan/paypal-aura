import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  UserModel,
  IUser,
  AuraAccountType,
  PayPalAccountType,
  MerchantVerificationStatus,
} from '../../models';
import { paypalIdentityService } from '../../integrations/paypal/identityService';

export interface MerchantEligibilityResult {
  auraAccountType: AuraAccountType;
  paypalAccountType: PayPalAccountType;
  merchantVerificationStatus: MerchantVerificationStatus;
  merchantAccessEnabled: boolean;
  merchantVerifiedAt: Date | null;
  paypalMerchantId: string | null;
  verificationMethod: string | null;
  verificationUpdatedAt: Date;
  explanation: string;
  canRetry: boolean;
  connectedPayPalEmail?: string | null;
  isPayPalLinked: boolean;
  mode: 'sandbox' | 'live';
}

export class MerchantVerificationService {
  /**
   * Pure evaluation of account eligibility based on authenticated user state,
   * connected PayPal identity data, and environment mode.
   *
   * STRICT ACCESS POLICY:
   * - Verified PayPal Business  => Enabled
   * - Verified PayPal Personal  => Disabled
   * - Unknown PayPal type       => Disabled
   * - Pending verification      => Disabled
   * - Rejected verification     => Disabled
   * - Disconnected PayPal       => Disabled
   */
  public evaluateAccountEligibility(
    user: IUser,
    options?: {
      userInfo?: any;
      idTokenClaims?: any;
      modeOverride?: 'sandbox' | 'live';
    }
  ): MerchantEligibilityResult {
    const mode = options?.modeOverride || (env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox');
    const isPayPalLinked = Boolean(user.paypalAccountLinked && user.paypalUserId);
    const paypalEmail = (user.paypalEmail || options?.userInfo?.email || '').trim().toLowerCase();
    const userInfoAccountType = (
      options?.userInfo?.account_type ||
      options?.idTokenClaims?.account_type ||
      ''
    ).toUpperCase();

    const now = new Date();

    // -------------------------------------------------------------------------
    // RULE 1: Disconnected PayPal Account => Merchant Hub Disabled
    // -------------------------------------------------------------------------
    if (!isPayPalLinked) {
      return {
        auraAccountType: 'UNVERIFIED',
        paypalAccountType: 'UNKNOWN',
        merchantVerificationStatus: user.merchantVerificationStatus === 'REJECTED' ? 'REJECTED' : 'NOT_STARTED',
        merchantAccessEnabled: false,
        merchantVerifiedAt: null,
        paypalMerchantId: null,
        verificationMethod: null,
        verificationUpdatedAt: now,
        explanation:
          'No PayPal account is currently connected. To enable Merchant Hub, please connect a verified PayPal Business account in Settings.',
        canRetry: true,
        connectedPayPalEmail: null,
        isPayPalLinked: false,
        mode,
      };
    }

    // -------------------------------------------------------------------------
    // RULE 2: Sandbox Mode Evaluation
    // Only in sandbox mode may email conventions (@business.example.com / @personal.example.com)
    // from verified identity responses be used alongside account_type.
    // -------------------------------------------------------------------------
    if (mode === 'sandbox') {
      const isKnownSandboxBusinessEmail =
        paypalEmail.endsWith('@business.example.com') ||
        (user.email && user.email.toLowerCase().endsWith('@business.example.com'));

      const isKnownSandboxPersonalEmail =
        paypalEmail.endsWith('@personal.example.com') ||
        (user.email && user.email.toLowerCase().endsWith('@personal.example.com'));

      // Case 2A: Sandbox Business Verified
      if (userInfoAccountType === 'BUSINESS' || isKnownSandboxBusinessEmail) {
        const merchantId = user.paypalPayerId || user.paypalUserId || `sandbox-biz-${user._id}`;
        return {
          auraAccountType: 'BUSINESS',
          paypalAccountType: 'BUSINESS',
          merchantVerificationStatus: 'VERIFIED',
          merchantAccessEnabled: true,
          merchantVerifiedAt: user.merchantVerifiedAt || now,
          paypalMerchantId: merchantId,
          verificationMethod: 'paypal_sandbox_verified_business_identity',
          verificationUpdatedAt: now,
          explanation:
            'Your connected PayPal Sandbox Business account has been verified. Merchant Hub, order fulfillment, received payments, and store analytics are fully enabled.',
          canRetry: false,
          connectedPayPalEmail: user.paypalEmail || paypalEmail,
          isPayPalLinked: true,
          mode,
        };
      }

      // Case 2B: Sandbox Personal Verified
      if (userInfoAccountType === 'PERSONAL' || isKnownSandboxPersonalEmail) {
        return {
          auraAccountType: 'PERSONAL',
          paypalAccountType: 'PERSONAL',
          merchantVerificationStatus: 'REJECTED',
          merchantAccessEnabled: false,
          merchantVerifiedAt: null,
          paypalMerchantId: null,
          verificationMethod: 'paypal_sandbox_verified_personal_identity',
          verificationUpdatedAt: now,
          explanation:
            'Your connected PayPal account is classified as Personal. Merchant Hub is exclusively available to verified Business accounts. Your personal banking and smart shopping features remain fully active.',
          canRetry: false,
          connectedPayPalEmail: user.paypalEmail || paypalEmail,
          isPayPalLinked: true,
          mode,
        };
      }

      // Case 2C: Unknown / Unverifiable in Sandbox
      return {
        auraAccountType: 'UNVERIFIED',
        paypalAccountType: 'UNKNOWN',
        merchantVerificationStatus: 'UNVERIFIED',
        merchantAccessEnabled: false,
        merchantVerifiedAt: null,
        paypalMerchantId: null,
        verificationMethod: 'paypal_identity_unverifiable',
        verificationUpdatedAt: now,
        explanation:
          'Unable to verify business eligibility from the connected PayPal Sandbox account. Please ensure your sandbox credentials belong to a verified business facilitator account.',
        canRetry: true,
        connectedPayPalEmail: user.paypalEmail || paypalEmail,
        isPayPalLinked: true,
        mode,
      };
    }

    // -------------------------------------------------------------------------
    // RULE 3: Live Mode Evaluation
    // In live mode, NEVER infer business status from email patterns or display names.
    // Must strictly verify authenticated OpenID Connect account_type claims.
    // -------------------------------------------------------------------------
    if (userInfoAccountType === 'BUSINESS') {
      const merchantId = user.paypalPayerId || user.paypalUserId || null;
      return {
        auraAccountType: 'BUSINESS',
        paypalAccountType: 'BUSINESS',
        merchantVerificationStatus: 'VERIFIED',
        merchantAccessEnabled: true,
        merchantVerifiedAt: user.merchantVerifiedAt || now,
        paypalMerchantId: merchantId,
        verificationMethod: 'paypal_live_merchant_identity',
        verificationUpdatedAt: now,
        explanation:
          'Your Live PayPal Business account has been authenticated and verified. Merchant Hub access is enabled.',
        canRetry: false,
        connectedPayPalEmail: user.paypalEmail || paypalEmail,
        isPayPalLinked: true,
        mode,
      };
    }

    if (userInfoAccountType === 'PERSONAL') {
      return {
        auraAccountType: 'PERSONAL',
        paypalAccountType: 'PERSONAL',
        merchantVerificationStatus: 'REJECTED',
        merchantAccessEnabled: false,
        merchantVerifiedAt: null,
        paypalMerchantId: null,
        verificationMethod: 'paypal_live_personal_identity',
        verificationUpdatedAt: now,
        explanation:
          'Your connected PayPal account is a verified Personal account. Merchant Hub is reserved for commercial sellers with a verified Business account.',
        canRetry: false,
        connectedPayPalEmail: user.paypalEmail || paypalEmail,
        isPayPalLinked: true,
        mode,
      };
    }

    // Live account type cannot be reliably established
    return {
      auraAccountType: 'UNVERIFIED',
      paypalAccountType: 'UNKNOWN',
      merchantVerificationStatus: 'UNVERIFIED',
      merchantAccessEnabled: false,
      merchantVerifiedAt: null,
      paypalMerchantId: null,
      verificationMethod: 'paypal_live_unverifiable',
      verificationUpdatedAt: now,
      explanation:
        'Your PayPal account type could not be established with authenticated seller credentials. To access Merchant Hub, please connect a verified PayPal Business account with seller permissions.',
      canRetry: true,
      connectedPayPalEmail: user.paypalEmail || paypalEmail,
      isPayPalLinked: true,
      mode,
    };
  }

  /**
   * Triggers an authoritative backend business verification workflow for a user.
   * Loads fresh user data, queries PayPal identity if token is available, and persists updates.
   */
  public async verifyBusinessEligibility(userId: string): Promise<MerchantEligibilityResult> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID provided for business verification.');
    }

    const user = await UserModel.findById(userId).select('+paypalAccessToken +paypalRefreshToken');
    if (!user) {
      throw new Error('User account not found.');
    }

    let userInfo: any = null;

    // If PayPal is linked and token exists, query latest verified userinfo
    if (user.paypalAccountLinked && user.paypalAccessToken) {
      try {
        const userInfoRes = await paypalIdentityService.getUserInfo(user.paypalAccessToken, {
          refreshToken: user.paypalRefreshToken,
        });
        if (userInfoRes?.data) {
          userInfo = userInfoRes.data;
          if (userInfo.email) user.paypalEmail = userInfo.email;
          if (userInfo.payer_id) user.paypalPayerId = userInfo.payer_id;
        }
      } catch (err: any) {
        logger.warn('MerchantVerificationService', 'Failed to refresh PayPal userinfo during eligibility check', {
          userId,
          error: err?.message,
        });
      }
    }

    const eligibility = this.evaluateAccountEligibility(user, { userInfo });

    // Apply updates to database record
    user.auraAccountType = eligibility.auraAccountType;
    user.paypalAccountType = eligibility.paypalAccountType;
    user.merchantVerificationStatus = eligibility.merchantVerificationStatus;
    user.merchantAccessEnabled = eligibility.merchantAccessEnabled;
    user.merchantVerifiedAt = eligibility.merchantVerifiedAt;
    user.paypalMerchantId = eligibility.paypalMerchantId;
    user.verificationMethod = eligibility.verificationMethod;
    user.verificationUpdatedAt = eligibility.verificationUpdatedAt;

    // Synchronize legacy fields for full backwards compatibility
    if (eligibility.merchantAccessEnabled) {
      user.role = 'merchant';
      user.accountType = 'business';
    } else {
      if (user.role === 'merchant') {
        user.role = 'family_admin';
      }
      user.accountType = 'personal';
    }

    await user.save();

    logger.info('MerchantVerificationService', 'Authoritative business eligibility evaluation completed', {
      userId,
      auraAccountType: eligibility.auraAccountType,
      paypalAccountType: eligibility.paypalAccountType,
      merchantVerificationStatus: eligibility.merchantVerificationStatus,
      merchantAccessEnabled: eligibility.merchantAccessEnabled,
      method: eligibility.verificationMethod,
    });

    return eligibility;
  }

  /**
   * Securely disconnects PayPal from an AURA account.
   * Immediately revokes merchant entitlement, updates verification status,
   * but strictly preserves all historical financial records, goals, orders, and payments.
   */
  public async disconnectPayPal(userId: string): Promise<{ user: IUser; eligibility: MerchantEligibilityResult }> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID provided.');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error('User account not found.');
    }

    // 1. Clear PayPal linkage and authentication tokens
    user.paypalAccountLinked = false;
    user.paypalIdentityVerified = false;
    user.paypalUserId = undefined;
    user.paypalPayerId = undefined;
    user.paypalEmail = undefined;
    user.paypalAccessToken = undefined;
    user.paypalRefreshToken = undefined;
    user.paypalTokenExpiresAt = undefined;
    user.paypalGrantedScopes = undefined;
    user.paypalLastSyncAt = undefined;

    // 2. Immediately revoke merchant access entitlement
    user.merchantAccessEnabled = false;
    user.merchantVerificationStatus = 'UNVERIFIED';
    user.auraAccountType = 'UNVERIFIED';
    user.paypalAccountType = 'UNKNOWN';
    user.merchantVerifiedAt = null;
    user.verificationMethod = 'paypal_account_disconnected';
    user.verificationUpdatedAt = new Date();

    if (user.role === 'merchant') {
      user.role = 'family_admin';
    }
    user.accountType = 'personal';

    await user.save();

    const eligibility = this.evaluateAccountEligibility(user);

    logger.info('MerchantVerificationService', 'PayPal disconnected and merchant access revoked', {
      userId,
      merchantAccessEnabled: user.merchantAccessEnabled,
    });

    return { user, eligibility };
  }

  /**
   * Fast server-side entitlement check verifying whether an account has valid merchant rights.
   */
  public async checkMerchantEntitlement(userOrId: string | IUser): Promise<boolean> {
    let user: IUser | null = null;
    if (typeof userOrId === 'string') {
      user = await UserModel.findById(userOrId);
    } else {
      user = userOrId;
    }

    if (!user) return false;

    return Boolean(
      user.merchantAccessEnabled === true &&
      user.auraAccountType === 'BUSINESS' &&
      user.merchantVerificationStatus === 'VERIFIED'
    );
  }

  /**
   * Safe, idempotent database migration for existing accounts.
   * - Existing accounts default to safe non-merchant state unless genuine verification exists.
   * - Preserves all user transactions, goals, budgets, and orders.
   * - Re-validates existing merchants (e.g. Bruce Wayne or accounts with verified sandbox business emails).
   */
  public async migrateLegacyAccounts(): Promise<{ totalUsers: number; migrated: number; verifiedPreserved: number }> {
    const users = await UserModel.find({});
    let migrated = 0;
    let verifiedPreserved = 0;

    for (const u of users) {
      let isChanged = false;

      // Check if user already has up-to-date fields
      const hasFields =
        u.auraAccountType !== undefined &&
        u.paypalAccountType !== undefined &&
        u.merchantVerificationStatus !== undefined &&
        u.merchantAccessEnabled !== undefined;

      if (!hasFields) {
        // Safe evaluation
        const eligibility = this.evaluateAccountEligibility(u);
        u.auraAccountType = eligibility.auraAccountType;
        u.paypalAccountType = eligibility.paypalAccountType;
        u.merchantVerificationStatus = eligibility.merchantVerificationStatus;
        u.merchantAccessEnabled = eligibility.merchantAccessEnabled;
        u.merchantVerifiedAt = eligibility.merchantVerifiedAt;
        u.paypalMerchantId = eligibility.paypalMerchantId;
        u.verificationMethod = eligibility.verificationMethod;
        u.verificationUpdatedAt = eligibility.verificationUpdatedAt;
        isChanged = true;
      } else {
        // Re-validate existing merchants: if merchantAccessEnabled is true, ensure it meets strict policy
        if (u.merchantAccessEnabled) {
          const recheck = this.evaluateAccountEligibility(u);
          if (!recheck.merchantAccessEnabled) {
            u.merchantAccessEnabled = false;
            u.merchantVerificationStatus = recheck.merchantVerificationStatus;
            u.auraAccountType = recheck.auraAccountType;
            u.paypalAccountType = recheck.paypalAccountType;
            isChanged = true;
          } else {
            verifiedPreserved++;
          }
        }
      }

      if (isChanged) {
        await u.save();
        migrated++;
      }
    }

    logger.info('MerchantVerificationService', 'Safe legacy account migration completed', {
      totalUsers: users.length,
      migrated,
      verifiedPreserved,
    });

    return { totalUsers: users.length, migrated, verifiedPreserved };
  }
}

export const merchantVerificationService = new MerchantVerificationService();
