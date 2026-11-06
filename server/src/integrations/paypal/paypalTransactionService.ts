import { UserModel } from '../../models';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { paypalProfileService } from './paypalProfileService';

export interface PayPalTransactionItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  description: string;
  senderOrRecipient?: string;
  fee?: number;
}

export interface PayPalTransactionsResult {
  available: boolean;
  transactions: PayPalTransactionItem[];
  totalCount: number;
  page?: number;
  totalPages?: number;
  statusMessage: string;
  details?: string;
  httpStatus?: number;
  lastSyncAt: Date | null;
}

export class PayPalTransactionService {
  /**
   * Investigates eligibility and attempts read-only retrieval of the user's transaction history.
   * Conforms strictly to PayPal API guidelines:
   * - Uses official PayPal Transaction Search API (`/v1/reporting/transactions`).
   * - Never uses the merchant's business transaction history as the customer's transaction history.
   * - If third-party reporting permissions are absent, clearly communicates the required permissions.
   */
  public async getTransactions(
    userId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<PayPalTransactionsResult> {
    const user = await UserModel.findById(userId).select('+paypalAccessToken +paypalRefreshToken');
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.paypalAccountLinked || !user.paypalUserId) {
      return {
        available: false,
        transactions: [],
        totalCount: 0,
        statusMessage: 'PayPal transaction-history access requires additional PayPal permissions or approval.',
        details: 'No linked PayPal account found for this AURA user.',
        lastSyncAt: null,
      };
    }

    const accessToken = await paypalProfileService.getValidUserAccessToken(user);
    if (!accessToken) {
      return {
        available: false,
        transactions: [],
        totalCount: 0,
        statusMessage: 'PayPal transaction-history access requires additional PayPal permissions or approval.',
        details: 'An active user-authorized PayPal OAuth access token is required.',
        lastSyncAt: user.paypalLastSyncAt || null,
      };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startDate = options?.startDate || thirtyDaysAgo.toISOString();
    const endDate = options?.endDate || now.toISOString();
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;

    const queryParams = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      page: String(page),
      page_size: String(pageSize),
      fields: 'all',
    });

    const transactionsUrl = `${env.PAYPAL_BASE_URL}/v1/reporting/transactions?${queryParams.toString()}`;

    try {
      logger.info('PayPalTransactionService', 'Investigating user PayPal transactions via Transaction Search API', {
        endpoint: transactionsUrl,
        mode: env.PAYPAL_MODE,
        userId: String(user._id),
      });

      const response = await fetch(transactionsUrl, {
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

      if (response.ok && responseJson && Array.isArray(responseJson.transaction_details)) {
        const parsedTransactions: PayPalTransactionItem[] = responseJson.transaction_details.map((item: any) => {
          const info = item.transaction_info || {};
          const payer = item.payer_info || {};
          const shipping = item.shipping_info || {};

          const rawAmount = info.transaction_amount?.value || '0';
          const amountNum = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount));

          const rawFee = info.fee_amount?.value;
          const feeNum = rawFee !== undefined ? (typeof rawFee === 'number' ? rawFee : parseFloat(String(rawFee))) : undefined;

          const senderOrRecipient =
            payer.email_address ||
            payer.payer_name?.alternate_full_name ||
            (payer.payer_name?.given_name ? `${payer.payer_name.given_name} ${payer.payer_name.surname || ''}`.trim() : '') ||
            shipping.name ||
            undefined;

          return {
            id: info.transaction_id || `txn_${Date.now()}`,
            date: info.transaction_initiation_date || info.transaction_updated_date || new Date().toISOString(),
            amount: isNaN(amountNum) ? 0 : amountNum,
            currency: info.transaction_amount?.currency_code || 'USD',
            status: info.transaction_status || 'COMPLETED',
            type: info.transaction_event_code || 'Payment',
            description: info.transaction_note || info.transaction_subject || 'PayPal Transaction',
            senderOrRecipient,
            fee: feeNum !== undefined && !isNaN(feeNum) ? feeNum : undefined,
          };
        });

        logger.info('PayPalTransactionService', 'Live PayPal transactions successfully retrieved', {
          userId: String(user._id),
          count: parsedTransactions.length,
        });

        return {
          available: true,
          transactions: parsedTransactions,
          totalCount: responseJson.total_items || parsedTransactions.length,
          page: responseJson.page || page,
          totalPages: responseJson.total_pages || 1,
          statusMessage: 'Transactions retrieved successfully.',
          lastSyncAt: new Date(),
        };
      }

      // If PayPal rejected the token (401/403/400) because standard OpenID Connect tokens lack Transaction Search scope:
      logger.info('PayPalTransactionService', 'PayPal transaction history unavailable with current OpenID Connect grant', {
        httpStatus: response.status,
        apiError: responseJson?.message || responseJson?.name || responseJson?.error_description || responseText.slice(0, 100),
        userId: String(user._id),
      });

      return {
        available: false,
        transactions: [],
        totalCount: 0,
        statusMessage: 'PayPal transaction-history access requires additional PayPal permissions or approval.',
        details:
          'Third-party account transaction search requires the https://uri.paypal.com/services/reporting/search/read scope and PayPal Partner authorization.',
        httpStatus: response.status,
        lastSyncAt: user.paypalLastSyncAt || new Date(),
      };
    } catch (err: any) {
      logger.warn('PayPalTransactionService', 'Network error querying PayPal Transaction Search API', {
        userId: String(user._id),
        error: err?.message,
      });

      return {
        available: false,
        transactions: [],
        totalCount: 0,
        statusMessage: 'PayPal transaction-history access requires additional PayPal permissions or approval.',
        details: err?.message || 'Unable to connect to PayPal Transaction Search endpoint.',
        lastSyncAt: user.paypalLastSyncAt || new Date(),
      };
    }
  }
}

export const paypalTransactionService = new PayPalTransactionService();
