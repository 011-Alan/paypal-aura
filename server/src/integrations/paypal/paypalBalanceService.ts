import { UserModel } from '../../models';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { paypalProfileService } from './paypalProfileService';

export interface PayPalBalanceResult {
  available: boolean;
  balance: number | null;
  currency: string | null;
  statusMessage: string;
  details?: string;
  httpStatus?: number;
  lastSyncAt: Date | null;
}

export class PayPalBalanceService {
  /**
   * Evaluates eligibility and attempts read-only retrieval of the user's actual PayPal wallet balance.
   * Strictly adheres to PayPal API permissions:
   * - Never uses the merchant client_credentials token to misrepresent business funds as personal funds.
   * - Never substitutes fabricated or estimated balances.
   * - If third-party reporting permissions are absent, clearly communicates access unavailability.
   */
  public async getBalance(userId: string): Promise<PayPalBalanceResult> {
    const user = await UserModel.findById(userId).select('+paypalAccessToken +paypalRefreshToken');
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.paypalAccountLinked || !user.paypalUserId) {
      return {
        available: false,
        balance: null,
        currency: null,
        statusMessage: 'PayPal balance access is not currently available.',
        details: 'No linked PayPal account found for this AURA user.',
        lastSyncAt: null,
      };
    }

    const accessToken = await paypalProfileService.getValidUserAccessToken(user);
    if (!accessToken) {
      return {
        available: false,
        balance: null,
        currency: null,
        statusMessage: 'PayPal balance access is not currently available.',
        details: 'An active user-authorized PayPal OAuth access token is required.',
        lastSyncAt: user.paypalLastSyncAt || null,
      };
    }

    const balanceUrl = `${env.PAYPAL_BASE_URL}/v1/reporting/balances?currency_code=ALL`;

    try {
      logger.info('PayPalBalanceService', 'Investigating user PayPal balance via official Reporting API', {
        endpoint: balanceUrl,
        mode: env.PAYPAL_MODE,
        userId: String(user._id),
      });

      const response = await fetch(balanceUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const responseText = await response.text();
      let responseJson: any = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch {
        // non-json response
      }

      if (response.ok && responseJson && Array.isArray(responseJson.balances) && responseJson.balances.length > 0) {
        // Locate primary currency balance or the first reported currency
        const primary =
          responseJson.balances.find((b: any) => b.primary === true) || responseJson.balances[0];

        const rawVal =
          primary?.available_balance?.value ||
          primary?.total_balance?.value ||
          primary?.balance?.value;
        const currencyCode =
          primary?.available_balance?.currency_code ||
          primary?.total_balance?.currency_code ||
          primary?.currency ||
          'USD';

        const parsedBalance = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal || '0'));

        logger.info('PayPalBalanceService', 'Live PayPal balance successfully retrieved with authorized scope', {
          userId: String(user._id),
          currency: currencyCode,
        });

        return {
          available: true,
          balance: isNaN(parsedBalance) ? 0 : parsedBalance,
          currency: currencyCode,
          statusMessage: 'Live balance retrieved from PayPal.',
          lastSyncAt: new Date(),
        };
      }

      // If PayPal rejected the token (401/403/400) because standard OpenID Connect tokens lack Reporting API permissions:
      logger.info('PayPalBalanceService', 'PayPal balance access unavailable with current OpenID Connect grant', {
        httpStatus: response.status,
        apiError: responseJson?.message || responseJson?.name || responseJson?.error_description || responseText.slice(0, 100),
        userId: String(user._id),
      });

      return {
        available: false,
        balance: null,
        currency: null,
        statusMessage: 'PayPal balance access is not currently available.',
        details:
          'Retrieving an individual customer wallet balance requires specialized PayPal Partner or Reporting API permissions (https://uri.paypal.com/services/reporting/balances/read) that are not granted to standard OpenID Connect applications.',
        httpStatus: response.status,
        lastSyncAt: user.paypalLastSyncAt || new Date(),
      };
    } catch (err: any) {
      logger.warn('PayPalBalanceService', 'Network error querying PayPal Reporting Balance API', {
        userId: String(user._id),
        error: err?.message,
      });

      return {
        available: false,
        balance: null,
        currency: null,
        statusMessage: 'PayPal balance access is not currently available.',
        details: err?.message || 'Unable to connect to PayPal Reporting Balance endpoint.',
        lastSyncAt: user.paypalLastSyncAt || new Date(),
      };
    }
  }
}

export const paypalBalanceService = new PayPalBalanceService();
