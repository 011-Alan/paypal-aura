import { UserModel, IUser } from '../../models';
import { logger } from '../../config/logger';
import { paypalIdentityService, PayPalUserInfo } from './identityService';

export interface PayPalAddress {
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  formatted?: string;
}

export interface PayPalProfileData {
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  address: PayPalAddress | null;
  paypalAccountId: string;
  accountVerificationStatus: {
    verified: boolean;
    statusText: 'Verified' | 'Unverified';
  };
  accountType?: string;
  lastSyncAt: Date;
  isCachedFallback?: boolean;
}

export class PayPalProfileService {
  /**
   * Helper to ensure a fresh, valid user-authorized access token.
   * If expired, automatically utilizes the refresh token via PayPal Identity tokenservice.
   */
  public async getValidUserAccessToken(user: IUser, forceRefresh = false): Promise<string | null> {
    const now = Date.now();
    const tokenExpiresAt = user.paypalTokenExpiresAt || 0;
    const isExpiredOrClose = now >= tokenExpiresAt - 30 * 1000;

    if (!forceRefresh && user.paypalAccessToken && !isExpiredOrClose) {
      return user.paypalAccessToken;
    }

    if (user.paypalRefreshToken) {
      try {
        logger.info('PayPalProfileService', 'Refreshing user access token', {
          userId: String(user._id),
          tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt).toISOString() : 'none',
        });
        const refreshed = await paypalIdentityService.refreshUserAccessToken(user.paypalRefreshToken);
        user.paypalAccessToken = refreshed.access_token;
        user.paypalTokenExpiresAt = refreshed.expires_at;
        if (refreshed.refresh_token) {
          user.paypalRefreshToken = refreshed.refresh_token;
        }
        await user.save();
        return refreshed.access_token;
      } catch (refreshErr: any) {
        logger.warn('PayPalProfileService', 'Failed to refresh user access token', {
          userId: String(user._id),
          error: refreshErr?.message,
        });
      }
    }

    return user.paypalAccessToken || null;
  }

  /**
   * Formats a structured address object into a single readable string.
   */
  private formatAddress(addr?: {
    streetAddress?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }): string | undefined {
    if (!addr) return undefined;
    const parts = [
      addr.streetAddress,
      addr.locality,
      addr.region,
      addr.postalCode,
      addr.country,
    ].filter((p): p is string => Boolean(p && typeof p === 'string' && p.trim()));
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  /**
   * Retrieves read-only personal profile information from PayPal's official Identity API.
   * Conforms to OpenID Connect profile, email, address, and paypalattributes scopes.
   * Safe fallback preserves existing database records on transient API failure.
   */
  public async getProfile(userId: string, options?: { forceRefresh?: boolean }): Promise<PayPalProfileData> {
    const user = await UserModel.findById(userId).select('+paypalAccessToken +paypalRefreshToken');
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.paypalAccountLinked || !user.paypalUserId) {
      throw new Error('No linked PayPal account found for this user.');
    }

    const fallbackProfile: PayPalProfileData = {
      name: user.name || 'PayPal User',
      email: user.paypalEmail || user.email || '',
      address: user.paypalAddress
        ? {
            ...user.paypalAddress,
            formatted: this.formatAddress(user.paypalAddress),
          }
        : null,
      paypalAccountId: user.paypalPayerId || user.paypalUserId || '',
      accountVerificationStatus: {
        verified: Boolean(user.paypalIdentityVerified),
        statusText: user.paypalIdentityVerified ? 'Verified' : 'Unverified',
      },
      lastSyncAt: user.paypalLastSyncAt || user.updatedAt || new Date(),
      isCachedFallback: true,
    };

    try {
      const accessToken = await this.getValidUserAccessToken(user, options?.forceRefresh);
      if (!accessToken) {
        logger.info('PayPalProfileService', 'No active PayPal access token available; serving cached profile', {
          userId: String(user._id),
        });
        return fallbackProfile;
      }

      const { data: userInfo } = await paypalIdentityService.getUserInfo(accessToken, {
        tokenExpiresAt: user.paypalTokenExpiresAt,
        refreshToken: user.paypalRefreshToken,
      });

      // Extract verified profile fields according to user consent (supports both Personal and Business accounts)
      const businessName =
        (userInfo as any)?.business_name ||
        (userInfo as any)?.company_name ||
        (userInfo as any)?.legal_name ||
        (userInfo as any)?.organization_name;

      const fullName =
        userInfo.name ||
        businessName ||
        (userInfo.given_name ? `${userInfo.given_name} ${userInfo.family_name || ''}`.trim() : '') ||
        (user.name && user.name !== 'PayPal User' && user.name !== 'Denied Scopes User' ? user.name : '') ||
        'PayPal User';

      const firstName = userInfo.given_name || undefined;
      const lastName = userInfo.family_name || undefined;

      let email = '';
      if (typeof userInfo.email === 'string' && userInfo.email.trim()) {
        email = userInfo.email.trim();
      } else if (typeof (userInfo as any)?.business_email === 'string' && (userInfo as any).business_email.trim()) {
        email = (userInfo as any).business_email.trim();
      } else if (Array.isArray(userInfo.emails) && userInfo.emails.length > 0) {
        const primary = userInfo.emails.find((e: any) => e.primary)?.value || userInfo.emails[0]?.value;
        if (primary) email = String(primary).trim();
      } else {
        email = user.paypalEmail || user.email || '';
      }

      const rawAddress = userInfo.address;
      let addressObj: PayPalAddress | null = null;
      if (rawAddress && typeof rawAddress === 'object') {
        const street = rawAddress.street_address || (rawAddress as any).streetAddress;
        const locality = rawAddress.locality;
        const region = rawAddress.region;
        const postalCode = rawAddress.postal_code || (rawAddress as any).postalCode;
        const country = rawAddress.country;

        if (street || locality || region || postalCode || country) {
          addressObj = {
            streetAddress: street,
            locality,
            region,
            postalCode,
            country,
            formatted: this.formatAddress({ streetAddress: street, locality, region, postalCode, country }),
          };
        }
      }

      // Preserve previously saved address if PayPal did not return address in this response
      if (!addressObj && user.paypalAddress && Object.values(user.paypalAddress).some(Boolean)) {
        addressObj = {
          ...user.paypalAddress,
          formatted: this.formatAddress(user.paypalAddress),
        };
      }

      const payerId =
        (typeof userInfo.payer_id === 'string' && userInfo.payer_id.trim() ? userInfo.payer_id.trim() : undefined) ||
        (typeof (userInfo as any).account_id === 'string' ? (userInfo as any).account_id.trim() : undefined) ||
        user.paypalPayerId ||
        user.paypalUserId;

      const isVerified = Boolean(
        userInfo.verified_account === true ||
          userInfo.verified_account === 'true' ||
          userInfo.email_verified === true ||
          userInfo.email_verified === 'true' ||
          user.paypalIdentityVerified
      );

      // Safe update: Update with live verified values returned by PayPal
      if (email && email.trim() && !email.includes('@user.aura')) {
        user.paypalEmail = email;
      }
      if (fullName && fullName !== 'PayPal User' && fullName !== 'Denied Scopes User') {
        user.name = fullName;
      }
      if (payerId) user.paypalPayerId = payerId;
      user.paypalIdentityVerified = isVerified;
      if (addressObj) {
        user.paypalAddress = {
          streetAddress: addressObj.streetAddress,
          locality: addressObj.locality,
          region: addressObj.region,
          postalCode: addressObj.postalCode,
          country: addressObj.country,
        };
      }
      user.paypalLastSyncAt = new Date();
      await user.save();

      return {
        name: fullName,
        firstName,
        lastName,
        email,
        address: addressObj,
        paypalAccountId: payerId,
        accountVerificationStatus: {
          verified: isVerified,
          statusText: isVerified ? 'Verified' : 'Unverified',
        },
        accountType: userInfo.account_type,
        lastSyncAt: user.paypalLastSyncAt,
        isCachedFallback: false,
      };
    } catch (err: any) {
      logger.warn('PayPalProfileService', 'Error retrieving live PayPal profile; returning cached profile', {
        userId: String(user._id),
        error: err?.message,
      });
      return fallbackProfile;
    }
  }
}

export const paypalProfileService = new PayPalProfileService();
