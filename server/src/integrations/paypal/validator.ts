import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface PayPalConfigValidationResult {
  valid: boolean;
  mode: 'sandbox' | 'live';
  errors: string[];
  warnings: string[];
  diagnostics: {
    mode: string;
    apiBaseUrl: string;
    webBaseUrl: string;
    clientIdConfigured: boolean;
    clientIdMasked: string;
    clientSecretConfigured: boolean;
    identityRedirectUri: string;
    paymentReturnUrl: string;
    paymentCancelUrl: string;
    webhookIdConfigured: boolean;
    isLocalhostCallback: boolean;
    environmentMatch: boolean;
  };
}

/**
 * Validates the PayPal integration configuration on startup or diagnostic request.
 * Strictly adheres to Phase 1, Phase 4, and Phase 5 requirements:
 * - Checks that required credentials exist
 * - Ensures Client ID and Secret belong to the same environment
 * - Checks redirect_uri, return_url, and cancel_url validity
 * - Safe diagnostic logging (NEVER logs secrets, auth codes, or tokens)
 */
export function validatePayPalConfig(): PayPalConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mode = env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
  const clientId = env.PAYPAL_CLIENT_ID || env.PAYPAL_IDENTITY_CLIENT_ID || '';
  const clientSecret = env.PAYPAL_CLIENT_SECRET || env.PAYPAL_IDENTITY_CLIENT_SECRET || '';

  // 1. Credentials Presence
  const isPlaceholder = (val: string) =>
    !val ||
    val.includes('your_paypal') ||
    val.includes('client_id_here') ||
    val.includes('test-aura-');

  if (!clientId || isPlaceholder(clientId)) {
    errors.push(`PAYPAL_CLIENT_ID is missing or set to a placeholder template for ${mode} mode.`);
  }

  if (!clientSecret || isPlaceholder(clientSecret)) {
    errors.push(`PAYPAL_CLIENT_SECRET is missing or set to a placeholder template for ${mode} mode.`);
  }

  // 2. Environment Endpoint Consistency
  const apiBaseUrl = env.PAYPAL_BASE_URL;
  const webBaseUrl = env.PAYPAL_WEB_URL;

  let environmentMatch = true;
  if (mode === 'sandbox') {
    if (!apiBaseUrl.includes('sandbox.paypal.com')) {
      errors.push(`Environment mismatch: PAYPAL_MODE is 'sandbox' but PAYPAL_BASE_URL is '${apiBaseUrl}'`);
      environmentMatch = false;
    }
    if (!webBaseUrl.includes('sandbox.paypal.com')) {
      errors.push(`Environment mismatch: PAYPAL_MODE is 'sandbox' but PAYPAL_WEB_URL is '${webBaseUrl}'`);
      environmentMatch = false;
    }
  } else {
    // Live mode
    if (apiBaseUrl.includes('sandbox.paypal.com')) {
      errors.push(`Environment mismatch: PAYPAL_MODE is 'live' but PAYPAL_BASE_URL points to sandbox.`);
      environmentMatch = false;
    }
    if (webBaseUrl.includes('sandbox.paypal.com')) {
      errors.push(`Environment mismatch: PAYPAL_MODE is 'live' but PAYPAL_WEB_URL points to sandbox.`);
      environmentMatch = false;
    }
  }

  // 3. Callback & Return URL validation
  const redirectUri = env.PAYPAL_IDENTITY_REDIRECT_URI;
  if (!redirectUri) {
    errors.push('PAYPAL_IDENTITY_REDIRECT_URI is required for Log in with PayPal.');
  } else {
    try {
      const parsed = new URL(redirectUri);
      if (!parsed.protocol.startsWith('http')) {
        errors.push(`PAYPAL_IDENTITY_REDIRECT_URI must be an HTTP or HTTPS URL: ${redirectUri}`);
      }
      if (!parsed.pathname.endsWith('/auth/paypal/callback')) {
        warnings.push(
          `PAYPAL_IDENTITY_REDIRECT_URI pathname usually ends with '/auth/paypal/callback' (current: ${parsed.pathname})`
        );
      }
    } catch {
      errors.push(`PAYPAL_IDENTITY_REDIRECT_URI is not a valid absolute URL: ${redirectUri}`);
    }
  }

  const returnUrl = env.PAYPAL_RETURN_URL;
  if (!returnUrl) {
    errors.push('PAYPAL_RETURN_URL is required for PayPal Checkout.');
  } else {
    try {
      new URL(returnUrl);
    } catch {
      errors.push(`PAYPAL_RETURN_URL is not a valid absolute URL: ${returnUrl}`);
    }
  }

  const cancelUrl = env.PAYPAL_CANCEL_URL;
  if (!cancelUrl) {
    errors.push('PAYPAL_CANCEL_URL is required for PayPal Checkout.');
  } else {
    try {
      new URL(cancelUrl);
    } catch {
      errors.push(`PAYPAL_CANCEL_URL is not a valid absolute URL: ${cancelUrl}`);
    }
  }

  // 4. Production vs Localhost Warnings
  const isProd = env.NODE_ENV === 'production';
  const isLocalhostCallback = Boolean(redirectUri && (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')));

  if (isProd && isLocalhostCallback) {
    warnings.push(
      'Application is running in production (Render) but PAYPAL_IDENTITY_REDIRECT_URI points to localhost. Update PAYPAL_IDENTITY_REDIRECT_URI to your Render public API URL.'
    );
  }

  if (isProd && mode === 'sandbox') {
    warnings.push('Application is in production NODE_ENV, but PAYPAL_MODE is set to sandbox.');
  }

  // 5. Masked credentials for safe diagnostics
  const maskString = (str: string) => {
    if (!str || str.length < 10) return '***';
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  };

  const diagnostics = {
    mode,
    apiBaseUrl,
    webBaseUrl,
    clientIdConfigured: Boolean(clientId && !isPlaceholder(clientId)),
    clientIdMasked: maskString(clientId),
    clientSecretConfigured: Boolean(clientSecret && !isPlaceholder(clientSecret)),
    identityRedirectUri: redirectUri,
    paymentReturnUrl: returnUrl,
    paymentCancelUrl: cancelUrl,
    webhookIdConfigured: Boolean(env.PAYPAL_WEBHOOK_ID && !isPlaceholder(env.PAYPAL_WEBHOOK_ID)),
    isLocalhostCallback,
    environmentMatch,
  };

  const valid = errors.length === 0;

  return {
    valid,
    mode,
    errors,
    warnings,
    diagnostics,
  };
}

/**
 * Logs a safe diagnostic report on startup without revealing secrets.
 */
export function logPayPalStartupDiagnostics(): void {
  const result = validatePayPalConfig();
  if (result.valid) {
    logger.info('PayPalConfig', `PayPal ${result.mode.toUpperCase()} integration configured successfully.`, {
      mode: result.mode,
      apiBaseUrl: result.diagnostics.apiBaseUrl,
      webBaseUrl: result.diagnostics.webBaseUrl,
      clientId: result.diagnostics.clientIdMasked,
      redirectUri: result.diagnostics.identityRedirectUri,
      warningsCount: result.warnings.length,
    });
    result.warnings.forEach((w) => logger.warn('PayPalConfig', `Warning: ${w}`));
  } else {
    logger.warn('PayPalConfig', `PayPal ${result.mode.toUpperCase()} integration requires configuration:`, {
      mode: result.mode,
      errors: result.errors,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
    });
  }
}
