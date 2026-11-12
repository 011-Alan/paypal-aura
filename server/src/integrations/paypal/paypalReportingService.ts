import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface CurrencyBalanceDetail {
  currency: string;
  primary: boolean;
  totalBalance: number;
  availableBalance: number;
  withheldBalance: number;
  lastRefreshTime?: string;
}

export interface MerchantBalanceResponse {
  available: boolean;
  accountType: 'PayPal Sandbox Business Account' | 'PayPal Live Business Account';
  mode: 'sandbox' | 'live';
  primaryBalance: number | null;
  primaryCurrency: string | null;
  balances: CurrencyBalanceDetail[];
  lastRefreshedAt: string | null;
  statusMessage: string;
  details?: string;
  missingScope?: string;
  httpStatus?: number;
  grantedScopes?: string[];
}

export interface MerchantTransactionItem {
  id: string;
  date: string;
  grossAmount: number;
  currency: string;
  fee?: number;
  netAmount?: number;
  status: string;
  rawStatus: string;
  type: string;
  eventCode?: string;
  description: string;
  payerName?: string;
  payerEmail?: string;
  payerAccountId?: string;
  shippingName?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  orderNumber?: string;
  isAuthorization?: boolean;
  cartItems?: Array<{ name: string; quantity: number; amount?: number }>;
}

export interface MerchantTransactionsResponse {
  available: boolean;
  accountType: 'PayPal Sandbox Business Account' | 'PayPal Live Business Account';
  mode: 'sandbox' | 'live';
  transactions: MerchantTransactionItem[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  statusMessage: string;
  details?: string;
  missingScope?: string;
  httpStatus?: number;
  reportingDelayNotice: string;
  grantedScopes?: string[];
}

interface CachedToken {
  accessToken: string;
  scopes: string[];
  expiresAt: number;
}

export class PayPalReportingService {
  private cachedToken: CachedToken | null = null;

  public static readonly SCOPE_BALANCES = 'https://uri.paypal.com/services/reporting/balances/read';
  public static readonly SCOPE_SEARCH = 'https://uri.paypal.com/services/reporting/search/read';

  /**
   * Resets the cached token (useful in tests or when refreshing credentials)
   */
  public clearTokenCache(): void {
    this.cachedToken = null;
  }

  /**
   * Checks if sandbox/live REST credentials are configured.
   */
  public isConfigured(): boolean {
    return Boolean(
      env.PAYPAL_CLIENT_ID &&
        env.PAYPAL_CLIENT_SECRET &&
        env.PAYPAL_CLIENT_ID !== 'your_paypal_client_id_here' &&
        env.PAYPAL_CLIENT_ID !== 'your_paypal_sandbox_client_id'
    );
  }

  /**
   * Obtains an Application Access Token via OAuth 2.0 Client Credentials Grant.
   * Caches token until 60 seconds prior to expiration.
   * Inspects and returns granted scopes from the PayPal token response.
   */
  public async getAppAccessToken(): Promise<{ accessToken: string; scopes: string[] }> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return {
        accessToken: this.cachedToken.accessToken,
        scopes: this.cachedToken.scopes,
      };
    }

    if (!this.isConfigured()) {
      throw new Error(
        `PAYPAL_CREDENTIALS_MISSING: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for ${env.PAYPAL_MODE} reporting access.`
      );
    }

    const tokenUrl = `${env.PAYPAL_BASE_URL}/v1/oauth2/token`;
    const basicAuth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');

    logger.info('PayPalReportingService', 'Requesting Client Credentials token from PayPal', {
      tokenUrl,
      mode: env.PAYPAL_MODE,
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (!resp.ok) {
      const errText = await resp.text();
      logger.error('PayPalReportingService', 'Client Credentials token request failed', {
        status: resp.status,
        errText,
      });
      throw new Error(`PayPal OAuth 2.0 Client Credentials failed (${resp.status}): ${errText}`);
    }

    const data: any = await resp.json();
    const accessToken = String(data.access_token);
    const scopeStr = typeof data.scope === 'string' ? data.scope : '';
    const scopes = scopeStr.split(/\s+/).filter(Boolean);
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 32400; // default 9h

    this.cachedToken = {
      accessToken,
      scopes,
      expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
    };

    logger.info('PayPalReportingService', 'Client Credentials token obtained successfully', {
      mode: env.PAYPAL_MODE,
      scopeCount: scopes.length,
      expiresIn: expiresInSec,
    });

    return {
      accessToken,
      scopes,
    };
  }

  /**
   * Retrieves the actual balance from the PayPal Sandbox Business / Merchant Account.
   * Endpoint: GET /v1/reporting/balances?currency_code=ALL
   * Scope: https://uri.paypal.com/services/reporting/balances/read
   */
  public async getMerchantBalances(): Promise<MerchantBalanceResponse> {
    const mode = (env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox') as 'sandbox' | 'live';
    const accountType =
      mode === 'live' ? 'PayPal Live Business Account' : 'PayPal Sandbox Business Account';

    if (!this.isConfigured()) {
      return {
        available: false,
        accountType,
        mode,
        primaryBalance: null,
        primaryCurrency: null,
        balances: [],
        lastRefreshedAt: null,
        statusMessage: 'PayPal credentials are not configured.',
        details:
          'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required in environment variables to retrieve Sandbox Business Account balances.',
      };
    }

    let tokenData: { accessToken: string; scopes: string[] };
    try {
      tokenData = await this.getAppAccessToken();
    } catch (err: any) {
      return {
        available: false,
        accountType,
        mode,
        primaryBalance: null,
        primaryCurrency: null,
        balances: [],
        lastRefreshedAt: null,
        statusMessage: 'Unable to authenticate with PayPal API.',
        details: err?.message || 'Client Credentials token exchange failed.',
      };
    }

    // Verify whether required balance reporting scope is granted in application token
    const hasBalanceScope =
      tokenData.scopes.length === 0 || // If PayPal token omits granular scope listing
      tokenData.scopes.includes(PayPalReportingService.SCOPE_BALANCES) ||
      tokenData.scopes.some((s) => s.includes('reporting/balances'));

    if (tokenData.scopes.length > 0 && !hasBalanceScope) {
      logger.warn('PayPalReportingService', 'Application token lacks reporting/balances scope', {
        grantedScopes: tokenData.scopes,
      });
      return {
        available: false,
        accountType,
        mode,
        primaryBalance: null,
        primaryCurrency: null,
        balances: [],
        lastRefreshedAt: null,
        statusMessage: 'Reporting permission missing on application token.',
        missingScope: PayPalReportingService.SCOPE_BALANCES,
        httpStatus: 403,
        details:
          'The application access token does not include the https://uri.paypal.com/services/reporting/balances/read scope. Please verify in PayPal Developer Dashboard that Balance reporting permissions are enabled for your REST App and refresh your token.',
        grantedScopes: tokenData.scopes,
      };
    }

    const balanceUrl = `${env.PAYPAL_BASE_URL}/v1/reporting/balances?currency_code=ALL`;

    try {
      const resp = await fetch(balanceUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const responseText = await resp.text();
      let responseJson: any = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch {
        // non-json response
      }

      if (resp.ok && responseJson && Array.isArray(responseJson.balances)) {
        const balances: CurrencyBalanceDetail[] = responseJson.balances.map((b: any) => {
          const parseVal = (obj: any): number => {
            if (!obj) return 0;
            const v = obj.value ?? obj;
            const parsed = typeof v === 'number' ? v : parseFloat(String(v || 0));
            return isNaN(parsed) ? 0 : parsed;
          };

          return {
            currency: b.currency || b.available_balance?.currency_code || b.total_balance?.currency_code || 'USD',
            primary: Boolean(b.primary),
            totalBalance: parseVal(b.total_balance),
            availableBalance: parseVal(b.available_balance),
            withheldBalance: parseVal(b.withheld_balance),
            lastRefreshTime: b.last_refresh_time || responseJson.as_of_time,
          };
        });

        // Determine primary currency or first currency
        const primary = balances.find((b) => b.primary) || balances[0] || null;

        logger.info('PayPalReportingService', 'Sandbox Business Account balances retrieved successfully', {
          count: balances.length,
          primaryCurrency: primary?.currency,
          primaryAvailable: primary?.availableBalance,
        });

        return {
          available: true,
          accountType,
          mode,
          primaryBalance: primary ? primary.availableBalance : 0,
          primaryCurrency: primary ? primary.currency : 'USD',
          balances,
          lastRefreshedAt: primary?.lastRefreshTime || responseJson.as_of_time || new Date().toISOString(),
          statusMessage: 'Sandbox Business Account balance retrieved successfully.',
          grantedScopes: tokenData.scopes,
        };
      }

      // Handle 403 Forbidden or scope rejections
      if (resp.status === 403) {
        logger.warn('PayPalReportingService', 'HTTP 403 Forbidden on balance reporting', {
          status: resp.status,
          apiError: responseJson?.message || responseText,
        });

        return {
          available: false,
          accountType,
          mode,
          primaryBalance: null,
          primaryCurrency: null,
          balances: [],
          lastRefreshedAt: null,
          statusMessage: 'Insufficient permissions for PayPal Reporting Balances API.',
          missingScope: PayPalReportingService.SCOPE_BALANCES,
          httpStatus: 403,
          details:
            'The PayPal application lacks the required scope (https://uri.paypal.com/services/reporting/balances/read). Please verify in PayPal Developer Dashboard that Balance reporting permissions are enabled for this REST app.',
          grantedScopes: tokenData.scopes,
        };
      }

      return {
        available: false,
        accountType,
        mode,
        primaryBalance: null,
        primaryCurrency: null,
        balances: [],
        lastRefreshedAt: null,
        statusMessage: `PayPal Balance API responded with status ${resp.status}.`,
        details: responseJson?.message || responseText || 'Failed to fetch merchant balances.',
        httpStatus: resp.status,
        grantedScopes: tokenData.scopes,
      };
    } catch (err: any) {
      logger.error('PayPalReportingService', 'Error calling PayPal Reporting Balances API', {
        error: err?.message,
      });

      return {
        available: false,
        accountType,
        mode,
        primaryBalance: null,
        primaryCurrency: null,
        balances: [],
        lastRefreshedAt: null,
        statusMessage: 'Network error connecting to PayPal Reporting Balances endpoint.',
        details: err?.message,
      };
    }
  }

  /**
   * Translates PayPal transaction status codes into clear human-readable status labels.
   */
  private formatTransactionStatus(statusCode?: string): { readable: string; raw: string } {
    const raw = (statusCode || 'S').toUpperCase();
    const map: Record<string, string> = {
      S: 'Success / Completed',
      P: 'Pending',
      V: 'Reversed',
      D: 'Denied',
      F: 'Failed',
      COMPLETED: 'Completed',
      PENDING: 'Pending',
      DENIED: 'Denied',
      REFUNDED: 'Refunded',
    };
    return {
      readable: map[raw] || raw,
      raw,
    };
  }

  /**
   * Retrieves actual transaction history from the Sandbox Business Account.
   * Endpoint: GET /v1/reporting/transactions
   * Scope: https://uri.paypal.com/services/reporting/search/read
   */
  public async getMerchantTransactions(options?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    transactionStatus?: string;
  }): Promise<MerchantTransactionsResponse> {
    const mode = (env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox') as 'sandbox' | 'live';
    const accountType =
      mode === 'live' ? 'PayPal Live Business Account' : 'PayPal Sandbox Business Account';
    const reportingDelayNotice =
      'PayPal reporting data may take up to 3 hours to reflect newly executed transactions or updated balances.';

    const now = new Date();
    // Default 30-day window
    const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startDate = options?.startDate || defaultStart.toISOString();
    const endDate = options?.endDate || now.toISOString();
    const page = Math.max(1, Number(options?.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(options?.pageSize || 20)));

    if (!this.isConfigured()) {
      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalItems: 0,
        totalPages: 0,
        page,
        pageSize,
        startDate,
        endDate,
        statusMessage: 'PayPal credentials are not configured.',
        details:
          'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required in environment variables to retrieve Sandbox Business Account transactions.',
        reportingDelayNotice,
      };
    }

    let tokenData: { accessToken: string; scopes: string[] };
    try {
      tokenData = await this.getAppAccessToken();
    } catch (err: any) {
      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalItems: 0,
        totalPages: 0,
        page,
        pageSize,
        startDate,
        endDate,
        statusMessage: 'Unable to authenticate with PayPal API.',
        details: err?.message || 'Client Credentials token exchange failed.',
        reportingDelayNotice,
      };
    }

    // Verify whether required transaction search reporting scope is granted in application token
    const hasSearchScope =
      tokenData.scopes.length === 0 || // If PayPal token omits granular scope listing
      tokenData.scopes.includes(PayPalReportingService.SCOPE_SEARCH) ||
      tokenData.scopes.some((s) => s.includes('reporting/search'));

    if (tokenData.scopes.length > 0 && !hasSearchScope) {
      logger.warn('PayPalReportingService', 'Application token lacks reporting/search scope', {
        grantedScopes: tokenData.scopes,
      });
      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalItems: 0,
        totalPages: 0,
        page,
        pageSize,
        startDate,
        endDate,
        statusMessage: 'Transaction Search permission missing on application token.',
        missingScope: PayPalReportingService.SCOPE_SEARCH,
        httpStatus: 403,
        details:
          'The application access token does not include the https://uri.paypal.com/services/reporting/search/read scope. In PayPal Developer Dashboard, ensure "Transaction search" capability is checked for your REST App and refresh your token.',
        reportingDelayNotice,
        grantedScopes: tokenData.scopes,
      };
    }

    const query = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      fields: 'all',
      page_size: String(pageSize),
      page: String(page),
    });

    if (options?.transactionStatus) {
      query.set('transaction_status', options.transactionStatus);
    }

    const transactionsUrl = `${env.PAYPAL_BASE_URL}/v1/reporting/transactions?${query.toString()}`;

    try {
      logger.info('PayPalReportingService', 'Querying PayPal Transaction Search API', {
        transactionsUrl,
        page,
        pageSize,
        startDate,
        endDate,
      });

      const resp = await fetch(transactionsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const responseText = await resp.text();
      let responseJson: any = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch {
        // non-json
      }

      if (resp.ok && responseJson && Array.isArray(responseJson.transaction_details)) {
        const transactions: MerchantTransactionItem[] = responseJson.transaction_details.map((item: any) => {
          const info = item.transaction_info || {};
          const payer = item.payer_info || {};
          const shipping = item.shipping_info || {};

          const rawGross = info.transaction_amount?.value ?? 0;
          const grossNum = typeof rawGross === 'number' ? rawGross : parseFloat(String(rawGross));

          const rawFee = info.fee_amount?.value;
          const feeNum =
            rawFee !== undefined && rawFee !== null
              ? typeof rawFee === 'number'
                ? rawFee
                : parseFloat(String(rawFee))
              : undefined;

          const rawNet = info.net_amount?.value;
          const netNum =
            rawNet !== undefined && rawNet !== null
              ? typeof rawNet === 'number'
                ? rawNet
                : parseFloat(String(rawNet))
              : feeNum !== undefined && !isNaN(grossNum) && !isNaN(feeNum)
              ? grossNum - Math.abs(feeNum)
              : grossNum;

          const statusObj = this.formatTransactionStatus(info.transaction_status);

          const cart = item.cart_info || {};

          let payerFullName: string | undefined = undefined;
          if (payer.payer_name) {
            const given = payer.payer_name.given_name || '';
            const surname = payer.payer_name.surname || '';
            payerFullName =
              payer.payer_name.alternate_full_name ||
              (given || surname ? `${given} ${surname}`.trim() : undefined);
          }

          // Extract PayPal Order ID & Capture ID
          let paypalOrderId: string | undefined = undefined;
          let paypalCaptureId: string | undefined = undefined;
          if (info.paypal_reference_id_type === 'ODR') {
            paypalOrderId = info.paypal_reference_id;
          } else if (info.paypal_reference_id_type === 'TXN') {
            paypalCaptureId = info.paypal_reference_id;
          }
          if (!paypalOrderId && typeof info.custom_field === 'string' && !info.custom_field.startsWith('ORD-')) {
            paypalOrderId = info.custom_field;
          }

          // Extract Order Number (e.g. ORD-12345 or from note/subject)
          let orderNumber: string | undefined = undefined;
          if (typeof info.custom_field === 'string' && info.custom_field.startsWith('ORD-')) {
            orderNumber = info.custom_field;
          } else {
            const subjectMatch = (info.transaction_subject || info.transaction_note || '').match(/ORD-[A-Za-z0-9_-]+/);
            if (subjectMatch) {
              orderNumber = subjectMatch[0];
            }
          }

          // Identify Authorizations
          const eventCode = info.transaction_event_code || '';
          const isAuthorization = eventCode.startsWith('T01') || (info.transaction_status === 'P' && eventCode === 'T0100');

          // Parse cart line items
          const cartItems = Array.isArray(cart.item_details)
            ? cart.item_details.map((ci: any) => ({
                name: ci.item_name || 'Item',
                quantity: Number(ci.item_quantity || 1),
                amount: ci.item_unit_price?.value ? parseFloat(String(ci.item_unit_price.value)) : undefined,
              }))
            : undefined;

          return {
            id: info.transaction_id || `txn_${Date.now()}`,
            date: info.transaction_initiation_date || info.transaction_updated_date || new Date().toISOString(),
            grossAmount: isNaN(grossNum) ? 0 : grossNum,
            currency: info.transaction_amount?.currency_code || 'USD',
            fee: feeNum !== undefined && !isNaN(feeNum) ? feeNum : undefined,
            netAmount: netNum !== undefined && !isNaN(netNum) ? netNum : undefined,
            status: statusObj.readable,
            rawStatus: statusObj.raw,
            type: info.transaction_event_code || 'Payment / Financial Transaction',
            eventCode: info.transaction_event_code,
            description: info.transaction_note || info.transaction_subject || 'PayPal Transaction',
            payerName: payerFullName,
            payerEmail: payer.email_address,
            payerAccountId: payer.account_id,
            shippingName: shipping.name,
            paypalOrderId,
            paypalCaptureId,
            orderNumber,
            isAuthorization,
            cartItems,
          };
        });

        // Sort descending by date
        transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalItems = typeof responseJson.total_items === 'number' ? responseJson.total_items : transactions.length;
        const totalPages =
          typeof responseJson.total_pages === 'number'
            ? responseJson.total_pages
            : Math.ceil(totalItems / pageSize) || 1;

        logger.info('PayPalReportingService', 'Sandbox Business Account transactions retrieved successfully', {
          count: transactions.length,
          totalItems,
          totalPages,
          page,
        });

        return {
          available: true,
          accountType,
          mode,
          transactions,
          totalItems,
          totalPages,
          page,
          pageSize,
          startDate,
          endDate,
          statusMessage: 'Sandbox Business Account transactions retrieved successfully.',
          reportingDelayNotice,
          grantedScopes: tokenData.scopes,
        };
      }

      if (resp.status === 403) {
        logger.warn('PayPalReportingService', 'HTTP 403 Forbidden on transaction search', {
          status: resp.status,
          apiError: responseJson?.message || responseText,
        });

        return {
          available: false,
          accountType,
          mode,
          transactions: [],
          totalItems: 0,
          totalPages: 0,
          page,
          pageSize,
          startDate,
          endDate,
          statusMessage: 'Insufficient permissions for PayPal Transaction Search API.',
          missingScope: PayPalReportingService.SCOPE_SEARCH,
          httpStatus: 403,
          details:
            'The PayPal application lacks the required scope (https://uri.paypal.com/services/reporting/search/read). Please verify in PayPal Developer Dashboard that "Transaction search" capability is checked for your REST App.',
          reportingDelayNotice,
          grantedScopes: tokenData.scopes,
        };
      }

      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalItems: 0,
        totalPages: 0,
        page,
        pageSize,
        startDate,
        endDate,
        statusMessage: `PayPal Transaction Search API responded with status ${resp.status}.`,
        details: responseJson?.message || responseText || 'Failed to fetch transactions.',
        httpStatus: resp.status,
        reportingDelayNotice,
        grantedScopes: tokenData.scopes,
      };
    } catch (err: any) {
      logger.error('PayPalReportingService', 'Error querying PayPal Transaction Search API', {
        error: err?.message,
      });

      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalItems: 0,
        totalPages: 0,
        page,
        pageSize,
        startDate,
        endDate,
        statusMessage: 'Network error connecting to PayPal Transaction Search endpoint.',
        details: err?.message,
        reportingDelayNotice,
      };
    }
  }

  /**
   * Retrieves historical merchant transactions across a multi-month date range.
   * PayPal's Transaction Search API strictly limits date ranges to 31 days per request.
   * This method chunks the requested date span into contiguous <= 30-day windows,
   * pages through all results (iterating page 1..totalPages for each window),
   * and deduplicates transactions by ID.
   */
  public async getMerchantTransactionsHistorical(options?: {
    startDate?: string;
    endDate?: string;
    pageSize?: number;
    monthsBack?: number;
    transactionStatus?: string;
  }): Promise<{
    available: boolean;
    accountType: 'PayPal Sandbox Business Account' | 'PayPal Live Business Account';
    mode: 'sandbox' | 'live';
    transactions: MerchantTransactionItem[];
    totalRetrieved: number;
    windowsProcessed: number;
    pagesProcessed: number;
    startDate: string;
    endDate: string;
    statusMessage: string;
    details?: string;
    reportingDelayNotice: string;
    grantedScopes?: string[];
  }> {
    const mode = (env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox') as 'sandbox' | 'live';
    const accountType =
      mode === 'live' ? 'PayPal Live Business Account' : 'PayPal Sandbox Business Account';
    const reportingDelayNotice =
      'PayPal reporting data may take up to 3 hours to reflect newly executed transactions or updated balances.';

    const now = new Date();
    const monthsBack = Math.max(1, Math.min(36, Number(options?.monthsBack || 3)));
    const calculatedStart = new Date(Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000);
    const startDateObj = options?.startDate ? new Date(options.startDate) : calculatedStart;
    const endDateObj = options?.endDate ? new Date(options.endDate) : now;

    const startDate = startDateObj.toISOString();
    const endDate = endDateObj.toISOString();

    // Generate 30-day windows (PayPal Transaction Search requires max 31 days per request)
    const windows: Array<{ start: string; end: string }> = [];
    let currentEnd = new Date(endDateObj.getTime());
    const minStart = startDateObj.getTime();

    while (currentEnd.getTime() > minStart) {
      const windowStart = new Date(Math.max(minStart, currentEnd.getTime() - 30 * 24 * 60 * 60 * 1000));
      windows.push({
        start: windowStart.toISOString(),
        end: currentEnd.toISOString(),
      });
      currentEnd = new Date(windowStart.getTime() - 1000);
    }

    if (windows.length === 0) {
      windows.push({ start: startDate, end: endDate });
    }

    if (!this.isConfigured()) {
      return {
        available: false,
        accountType,
        mode,
        transactions: [],
        totalRetrieved: 0,
        windowsProcessed: windows.length,
        pagesProcessed: 0,
        startDate,
        endDate,
        statusMessage: 'PayPal credentials are not configured.',
        details: 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.',
        reportingDelayNotice,
      };
    }

    const pageSize = Math.min(500, Math.max(1, Number(options?.pageSize || 100)));
    const txMap = new Map<string, MerchantTransactionItem>();
    let pagesProcessed = 0;
    let grantedScopes: string[] | undefined;
    let anyWindowAvailable = false;
    let lastStatusMsg = 'No transactions found.';

    for (const w of windows) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= 50) {
        const resp = await this.getMerchantTransactions({
          startDate: w.start,
          endDate: w.end,
          page,
          pageSize,
          transactionStatus: options?.transactionStatus,
        });

        pagesProcessed++;
        if (resp.grantedScopes) {
          grantedScopes = resp.grantedScopes;
        }

        if (!resp.available) {
          if (!anyWindowAvailable && txMap.size === 0) {
            return {
              available: false,
              accountType,
              mode,
              transactions: [],
              totalRetrieved: 0,
              windowsProcessed: windows.indexOf(w) + 1,
              pagesProcessed,
              startDate,
              endDate,
              statusMessage: resp.statusMessage,
              details: resp.details,
              reportingDelayNotice,
              grantedScopes: resp.grantedScopes,
            };
          }
          break;
        }

        anyWindowAvailable = true;
        lastStatusMsg = resp.statusMessage;
        totalPages = resp.totalPages || 1;

        for (const tx of resp.transactions) {
          if (!txMap.has(tx.id)) {
            txMap.set(tx.id, tx);
          }
        }

        page++;
      }
    }

    const transactions = Array.from(txMap.values());
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      available: anyWindowAvailable,
      accountType,
      mode,
      transactions,
      totalRetrieved: transactions.length,
      windowsProcessed: windows.length,
      pagesProcessed,
      startDate,
      endDate,
      statusMessage: anyWindowAvailable
        ? `Retrieved ${transactions.length} historical merchant transactions across ${windows.length} date windows.`
        : lastStatusMsg,
      reportingDelayNotice,
      grantedScopes,
    };
  }
}

export const paypalReportingService = new PayPalReportingService();
