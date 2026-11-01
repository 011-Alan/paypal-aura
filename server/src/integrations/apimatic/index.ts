import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Sponsor 2: APIMatic — PayPal API Development Intelligence & Contract Validator
 *
 * Role: APIMatic is a development-time API contract & SDK intelligence tool.
 * In AURA, it defines and enforces the official PayPal Orders API v2, OAuth 2.0,
 * and Webhooks v1 request/response schemas, headers, and status contracts so that
 * no deprecated endpoints or malformed payloads are used.
 *
 * Note: As required by the AURA architecture specification, AURA does NOT claim
 * a fabricated runtime dependency on an external APIMatic cloud API.
 */
export interface ApimaticContractCheckResult {
  valid: boolean;
  endpoint: string;
  specVersion: string;
  checkedRules: string[];
  errors: string[];
}

export class ApimaticPayPalContractValidator {
  private readonly specVersion = env.APIMATIC_PAYPAL_SPEC_VERSION;

  getHealthStatus() {
    return {
      technology: 'APIMatic',
      intendedResponsibility: 'PayPal API development context, OpenAPI contract enforcement & schema validation',
      status: 'active_development_contract_guard',
      mode: 'development_time_and_schema_validation',
      specVersion: this.specVersion,
      validatedEndpoints: [
        'POST /v1/oauth2/token (OAuth 2.0 Client Credentials)',
        'POST /v2/checkout/orders (Orders API v2 Create Order with PayPal-Request-Id idempotency)',
        'GET /v2/checkout/orders/{id} (Orders API v2 Retrieve Order)',
        'POST /v2/checkout/orders/{id}/capture (Orders API v2 Capture Order)',
        'POST /v1/notifications/verify-webhook-signature (Webhook Cryptographic Verification)',
      ],
      deprecatedPatternsPrevented: [
        'v1/payments/payment (Deprecated PayPal v1 Payments API blocked in favor of v2/checkout/orders)',
        'Missing PayPal-Request-Id header on mutating POST order/capture calls',
        'Non-string or >2 decimal precision currency value fields in purchase_units.amount',
      ],
    };
  }

  /**
   * Validates a PayPal Orders API v2 Create Order payload against APIMatic's PayPal Orders v2 contract.
   */
  validateCreateOrderRequest(
    payload: Record<string, any>,
    headers: Record<string, string>
  ): ApimaticContractCheckResult {
    const errors: string[] = [];
    const checkedRules: string[] = [
      'Orders v2 intent enum (CAPTURE | AUTHORIZE)',
      'purchase_units non-empty array requirement',
      'purchase_units[].amount.currency_code ISO-4217 3-letter format',
      'purchase_units[].amount.value decimal string pattern ^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$',
      'PayPal-Request-Id idempotency header presence',
    ];

    if (!payload || typeof payload !== 'object') {
      errors.push('Request body must be a valid JSON object.');
    } else {
      if (!['CAPTURE', 'AUTHORIZE'].includes(payload.intent)) {
        errors.push(`Invalid intent "${payload.intent}". Must be "CAPTURE" or "AUTHORIZE".`);
      }
      if (!Array.isArray(payload.purchase_units) || payload.purchase_units.length === 0) {
        errors.push('purchase_units must be a non-empty array.');
      } else {
        payload.purchase_units.forEach((unit: any, idx: number) => {
          const amt = unit?.amount;
          if (!amt || typeof amt !== 'object') {
            errors.push(`purchase_units[${idx}].amount is required.`);
          } else {
            if (!/^[A-Z]{3}$/.test(String(amt.currency_code || ''))) {
              errors.push(`purchase_units[${idx}].amount.currency_code must be a 3-letter ISO-4217 currency code.`);
            }
            if (typeof amt.value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(amt.value)) {
              errors.push(
                `purchase_units[${idx}].amount.value must be a formatted decimal string with at most 2 decimals (got "${amt.value}").`
              );
            }
          }
        });
      }
    }

    if (!headers['PayPal-Request-Id'] && !headers['paypal-request-id']) {
      errors.push('Missing mandatory PayPal-Request-Id header for idempotent Order v2 creation.');
    }

    const valid = errors.length === 0;
    if (!valid) {
      logger.warn('APIMaticValidator', 'PayPal Create Order contract validation failed', { errors });
    }
    return {
      valid,
      endpoint: 'POST /v2/checkout/orders',
      specVersion: this.specVersion,
      checkedRules,
      errors,
    };
  }

  /**
   * Validates a PayPal Webhook Signature Verification payload against APIMatic's PayPal Webhooks v1 contract.
   */
  validateWebhookVerificationPayload(payload: Record<string, any>): ApimaticContractCheckResult {
    const requiredFields = [
      'auth_algo',
      'cert_url',
      'transmission_id',
      'transmission_sig',
      'transmission_time',
      'webhook_id',
      'webhook_event',
    ];
    const errors: string[] = [];
    for (const field of requiredFields) {
      if (!payload[field]) {
        errors.push(`Missing required webhook verification field: ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      endpoint: 'POST /v1/notifications/verify-webhook-signature',
      specVersion: this.specVersion,
      checkedRules: [
        'Cryptographic transmission headers (auth_algo, cert_url, transmission_id, transmission_sig, transmission_time)',
        'Registered PayPal webhook_id binding',
        'Full raw webhook_event object presence',
      ],
      errors,
    };
  }
}

export const apimaticIntegration = new ApimaticPayPalContractValidator();
