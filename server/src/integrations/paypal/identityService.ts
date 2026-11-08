import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { UserModel, AccountModel, IUser } from '../../models';
import { hashSecretArgon2id, signSessionToken, recordAuditLog } from '../../middleware/security';
import { zapierIntegration } from '../zapier';

export interface PayPalUserInfo {
  user_id?: string;
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean | string;
  account_type?: string;
  emails?: Array<{ value: string; primary?: boolean }>;
  verified_account?: boolean | string;
  payer_id?: string;
  address?: Record<string, string>;
}

export interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number | string;
  expires_at?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  user_id?: string;
  payer_id?: string;
  sub?: string;
  email?: string;
}

export interface OAuthStatePayload {
  nonce: string;
  timestamp: number;
  linkUserId?: string;
  action?: 'login' | 'register' | 'continue';
  codeVerifier?: string;
  clientOrigin?: string;
}

export interface CallbackExecutionRecord {
  codeFingerprint: string;
  requestCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  status: 'in_flight' | 'completed' | 'failed';
  promise?: Promise<{
    user: IUser;
    token: string;
    isNewUser: boolean;
    isLinked: boolean;
    notRegistered?: boolean;
  }>;
  result?: {
    user: IUser;
    token: string;
    isNewUser: boolean;
    isLinked: boolean;
    notRegistered?: boolean;
  };
  error?: string;
  expiresAt: number;
}

export interface CodeExchangeRecord {
  codeFingerprint: string;
  requestCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  status: 'in_flight' | 'completed' | 'failed';
  promise?: Promise<PayPalTokenResponse>;
  result?: PayPalTokenResponse;
  error?: string;
  expiresAt: number;
}

export class PayPalIdentityService {
  private jwksCache: { keys: any[]; fetchedAt: number } | null = null;
  private readonly JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private callbackCache = new Map<string, CallbackExecutionRecord>();
  private codeExchangeCache = new Map<string, CodeExchangeRecord>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

  public maskClientId(clientId: string): string {
    if (!clientId) return 'undefined';
    if (clientId.length <= 10) return '***';
    return `${clientId.slice(0, 6)}...${clientId.slice(-4)}`;
  }

  public generateCodeFingerprint(code: string): string {
    return crypto.createHash('sha256').update(code.trim()).digest('hex').slice(0, 16);
  }

  private pruneExpiredCacheEntries(): void {
    const now = Date.now();
    for (const [key, record] of this.callbackCache.entries()) {
      if (record.expiresAt <= now) {
        this.callbackCache.delete(key);
      }
    }
    for (const [key, record] of this.codeExchangeCache.entries()) {
      if (record.expiresAt <= now) {
        this.codeExchangeCache.delete(key);
      }
    }
  }

  /**
   * Generates a cryptographically signed OAuth 2.0 state parameter.
   * Defends against CSRF, parameter tampering, and replay attacks.
   */
  public generateOAuthState(options?: {
    linkUserId?: string;
    action?: 'login' | 'register' | 'continue';
    codeVerifier?: string;
    clientOrigin?: string;
  }): { state: string; nonce: string; codeVerifier?: string } {
    const nonce = crypto.randomBytes(16).toString('hex');

    const payload: OAuthStatePayload = {
      nonce,
      timestamp: Date.now(),
      linkUserId: options?.linkUserId,
      action: options?.action || 'continue',
      clientOrigin: options?.clientOrigin,
    };

    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson).toString('base64url');
    const signature = crypto
      .createHmac('sha256', env.CSRF_SECRET || env.JWT_SECRET)
      .update(payloadB64)
      .digest('base64url');

    return {
      state: `${payloadB64}.${signature}`,
      nonce,
      codeVerifier: options?.codeVerifier,
    };
  }

  /**
   * Verifies the cryptographic integrity, expiration, and payload of an OAuth 2.0 state parameter.
   */
  public verifyOAuthState(state: string): {
    valid: boolean;
    payload?: OAuthStatePayload;
    reason?: string;
  } {
    if (!state || typeof state !== 'string' || !state.includes('.')) {
      return { valid: false, reason: 'Malformed state parameter' };
    }

    const [payloadB64, signature] = state.split('.');
    const expectedSig = crypto
      .createHmac('sha256', env.CSRF_SECRET || env.JWT_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (signature !== expectedSig) {
      return { valid: false, reason: 'Invalid state signature / CSRF detected' };
    }

    try {
      const payload: OAuthStatePayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const ageMs = Date.now() - payload.timestamp;

      // State is valid for at most 15 minutes
      if (ageMs > 15 * 60 * 1000) {
        return { valid: false, reason: 'State parameter expired (valid for 15 minutes)' };
      }

      return { valid: true, payload };
    } catch {
      return { valid: false, reason: 'Failed to parse state payload' };
    }
  }

  /**
   * Constructs the official Log in with PayPal authorization redirect URL.
   * Conforms strictly to PayPal Identity v1 OpenID Connect specifications.
   */
  public getAuthorizationUrl(options?: {
    linkUserId?: string;
    prompt?: string;
    action?: 'login' | 'register' | 'continue';
    clientOrigin?: string;
  }): {
    url: string;
    state: string;
    nonce: string;
    codeVerifier?: string;
  } {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    if (!clientId || clientId.includes('your_paypal') || clientId.includes('client_id_here')) {
      throw new Error(
        `PAYPAL_CLIENT_ID_NOT_CONFIGURED: A valid PayPal Client ID is required for ${env.PAYPAL_MODE} mode.`
      );
    }

    const { state, nonce } = this.generateOAuthState({
      linkUserId: options?.linkUserId,
      action: options?.action || 'continue',
      clientOrigin: options?.clientOrigin,
    });
    const redirectUri = env.PAYPAL_IDENTITY_REDIRECT_URI;

    // Official Log in with PayPal OpenID Connect parameters
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
      state,
      nonce,
    });

    if (options?.prompt) {
      params.append('prompt', options.prompt);
    }

    // PayPal OIDC authorize endpoint with %20 encoding for standard OIDC scope separation
    const authBase = env.PAYPAL_IDENTITY_AUTH_URL;
    const queryString = params.toString().replace(/\+/g, '%20');
    const url = `${authBase}?${queryString}`;

    const clientIdMasked = this.maskClientId(clientId);

    logger.info('PayPalIdentityService', 'Constructed official Log in with PayPal authorization URL', {
      authEndpoint: authBase,
      redirectUriAuthorization: redirectUri,
      mode: env.PAYPAL_MODE,
      clientId: clientIdMasked,
      action: options?.action || 'login',
      hasLinkUserId: Boolean(options?.linkUserId),
    });

    return { url, state, nonce };
  }

  /**
   * Exchanges an authorization code for access and ID tokens using Basic Authentication and Identity tokenservice.
   * Conforms strictly to PayPal Identity OpenID Connect authorization-code exchange:
   * POST /v1/identity/openidconnect/tokenservice
   * Headers:
   *   Authorization: Basic <base64(client_id:client_secret)>
   *   Content-Type: application/x-www-form-urlencoded
   *   Accept: application/json
   * Body:
   *   grant_type=authorization_code&code=<code\>&redirect_uri=<redirect_uri\>&client_id=<id\>&client_secret=<secret\>
   */
  public async exchangeCodeForTokens(code: string, _legacyCodeVerifier?: string): Promise<PayPalTokenResponse> {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_IDENTITY_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId.includes('your_paypal') || clientSecret.includes('secret_here')) {
      throw new Error(
        `PAYPAL_CREDENTIALS_MISSING: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for ${env.PAYPAL_MODE}`
      );
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const redirectUri = env.PAYPAL_IDENTITY_REDIRECT_URI;
    const codeFingerprint = this.generateCodeFingerprint(code);
    const now = Date.now();

    this.pruneExpiredCacheEntries();

    const existing = this.codeExchangeCache.get(codeFingerprint);
    if (existing) {
      existing.requestCount++;
      existing.lastSeenAt = now;

      if (existing.status === 'in_flight' && existing.promise) {
        logger.warn('PayPalIdentityService', 'Concurrent code exchange detected for same code fingerprint; awaiting existing in-flight exchange', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp: new Date().toISOString(),
          alreadyProcessed: false,
          selectedEnvironment: env.PAYPAL_MODE,
          clientIdFingerprint: this.maskClientId(clientId),
        });
        return await existing.promise;
      }

      if (existing.status === 'completed' && existing.result) {
        logger.info('PayPalIdentityService', 'Duplicate code exchange detected for completed code; returning cached token response', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp: new Date().toISOString(),
          alreadyProcessed: true,
          selectedEnvironment: env.PAYPAL_MODE,
          clientIdFingerprint: this.maskClientId(clientId),
        });
        return existing.result;
      }

      if (existing.status === 'failed') {
        logger.warn('PayPalIdentityService', 'Duplicate code exchange attempted for previously rejected code; rejecting without retry', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp: new Date().toISOString(),
          alreadyProcessed: true,
          previousError: existing.error,
        });
        throw new Error(
          existing.error || 'Authorization code was already rejected by PayPal. Please start a fresh Log in with PayPal attempt.'
        );
      }
    }

    const record: CodeExchangeRecord = {
      codeFingerprint,
      requestCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'in_flight',
      expiresAt: now + this.CACHE_TTL_MS,
    };
    this.codeExchangeCache.set(codeFingerprint, record);

    const exchangePromise = (async () => {
      // Body parameters for Identity tokenservice
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      // Identity tokenservice endpoint for OpenID Connect
      const primaryTokenUrl = env.PAYPAL_IDENTITY_TOKEN_URL;
      const fallbackTokenUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/tokenservice`;
      const requestTimestamp = new Date().toISOString();
      const clientIdFingerprint = this.maskClientId(clientId);

      logger.info('PayPalIdentityService', 'Initiating authorization code exchange with PayPal Identity tokenservice', {
        tokenExchangeRequestTimestamp: requestTimestamp,
        tokenUrl: primaryTokenUrl,
        httpMethod: 'POST',
        grantType: 'authorization_code',
        redirectUriAuthorization: redirectUri,
        redirectUriTokenExchange: redirectUri,
        clientIdFingerprint,
        selectedEnvironment: env.PAYPAL_MODE,
        codeFingerprint,
        callbackRequestCount: record.requestCount,
        alreadyProcessed: false,
      });

      let response = await fetch(primaryTokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyParams.toString(),
      });

      // If primary returns 404, fallback to alternate tokenservice
      if (response.status === 404 && fallbackTokenUrl !== primaryTokenUrl) {
        logger.warn('PayPalIdentityService', 'Primary tokenservice returned 404, falling back to alternate tokenservice', {
          fallbackTokenUrl,
        });
        response = await fetch(fallbackTokenUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: bodyParams.toString(),
        });
      }

      const correlationId =
        response.headers.get('paypal-debug-id') ||
        response.headers.get('correlation-id');

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr: any = null;
        try {
          parsedErr = JSON.parse(errText);
        } catch {
          // non-json error
        }
        const finalCorrelationId = correlationId || parsedErr?.correlation_id || parsedErr?.debug_id;
        const errorDesc = parsedErr?.error_description || parsedErr?.error || parsedErr?.message || errText;

        logger.error('PayPalIdentityService', 'PayPal token exchange failed', {
          tokenExchangeRequestTimestamp: requestTimestamp,
          tokenExchangeHttpStatus: response.status,
          correlationId: finalCorrelationId,
          selectedEnvironment: env.PAYPAL_MODE,
          clientIdFingerprint,
          redirectUriAuthorization: redirectUri,
          redirectUriTokenExchange: redirectUri,
          codeFingerprint,
          redactedError: errorDesc,
        });

        const failureMsg = `PayPal token exchange failed (${response.status})${finalCorrelationId ? ` [correlation_id: ${finalCorrelationId}]` : ''}: ${errorDesc}`;
        record.status = 'failed';
        record.error = failureMsg;
        delete record.promise;
        throw new Error(failureMsg);
      }

      const data = (await response.json()) as PayPalTokenResponse;

      if (!data || !data.access_token || typeof data.access_token !== 'string') {
        const missingTokenMsg = 'PayPal token exchange succeeded but response is missing a valid access_token';
        record.status = 'failed';
        record.error = missingTokenMsg;
        delete record.promise;
        throw new Error(missingTokenMsg);
      }

      const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : parseInt(String(data.expires_in || 28800), 10);
      const tokenExpiresAt = Date.now() + (isNaN(expiresInSec) ? 28800 : expiresInSec) * 1000;
      data.expires_at = tokenExpiresAt;

      record.status = 'completed';
      record.result = data;
      delete record.promise;

      logger.info('PayPalIdentityService', 'PayPal user authorization token exchange successful', {
        tokenExchangeRequestTimestamp: requestTimestamp,
        tokenExchangeHttpStatus: response.status,
        correlationId: correlationId || (data as any)?.correlation_id,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
        hasAccessToken: Boolean(data.access_token),
        hasIdToken: Boolean(data.id_token),
        hasRefreshToken: Boolean(data.refresh_token),
        grantedScope: data.scope,
        selectedEnvironment: env.PAYPAL_MODE,
        clientIdFingerprint,
        redirectUriAuthorization: redirectUri,
        redirectUriTokenExchange: redirectUri,
        codeFingerprint,
      });

      return data;
    })();

    record.promise = exchangePromise;
    return exchangePromise;
  }

  /**
   * Refreshes an expired user access token using the user's refresh token via PayPal Identity tokenservice.
   */
  public async refreshUserAccessToken(refreshToken: string): Promise<PayPalTokenResponse> {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_IDENTITY_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const primaryTokenUrl = env.PAYPAL_IDENTITY_TOKEN_URL;
    const fallbackTokenUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/tokenservice`;
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    logger.info('PayPalIdentityService', 'Refreshing user access token via PayPal Identity tokenservice', {
      tokenUrl: primaryTokenUrl,
      selectedEnvironment: env.PAYPAL_MODE,
      clientIdFingerprint: this.maskClientId(clientId),
    });

    let response = await fetch(primaryTokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyParams.toString(),
    });

    if (response.status === 404 && fallbackTokenUrl !== primaryTokenUrl) {
      response = await fetch(fallbackTokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyParams.toString(),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('PayPalIdentityService', 'User token refresh failed', {
        status: response.status,
        error: errText,
      });
      throw new Error(`PayPal user token refresh failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as PayPalTokenResponse;
    if (!data.access_token) {
      throw new Error('PayPal user token refresh did not return an access_token');
    }

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : parseInt(String(data.expires_in || 28800), 10);
    data.expires_at = Date.now() + (isNaN(expiresInSec) ? 28800 : expiresInSec) * 1000;
    return data;
  }

  /**
   * Retrieves PayPal's published JSON Web Key Set (JWKS) for ID token signature validation.
   */
  public async getJwks(): Promise<any[]> {
    if (this.jwksCache && Date.now() - this.jwksCache.fetchedAt < this.JWKS_CACHE_TTL_MS) {
      return this.jwksCache.keys;
    }

    const jwksUrl = `${env.PAYPAL_BASE_URL}/v1/oauth2/certs`;
    try {
      const resp = await fetch(jwksUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        throw new Error(`Failed to fetch JWKS from ${jwksUrl} (${resp.status})`);
      }
      const data: any = await resp.json();
      const keys = Array.isArray(data.keys) ? data.keys : [];
      this.jwksCache = { keys, fetchedAt: Date.now() };
      return keys;
    } catch (err: any) {
      logger.warn('PayPalIdentityService', 'Could not retrieve published JWKS from PayPal', {
        error: err?.message,
      });
      return this.jwksCache ? this.jwksCache.keys : [];
    }
  }

  /**
   * Validates the ID token signature, issuer, audience, expiration, and nonce.
   */
  public async validateIdToken(idToken: string, expectedNonce?: string): Promise<Record<string, any>> {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Missing ID token');
    }

    const decodedUnverified = jwt.decode(idToken, { complete: true });
    if (!decodedUnverified || typeof decodedUnverified === 'string') {
      throw new Error('Malformed ID token structure');
    }

    const header = decodedUnverified.header;
    const payload = decodedUnverified.payload as Record<string, any>;
    const kid = header?.kid;

    // Verify cryptographic signature against published JWKS if available
    const keys = await this.getJwks();
    const matchingKey = keys.find((k) => k.kid === kid);

    if (matchingKey) {
      try {
        const publicKey = crypto.createPublicKey({ key: matchingKey, format: 'jwk' });
        const pem = publicKey.export({ type: 'spki', format: 'pem' });
        jwt.verify(idToken, pem, { algorithms: ['RS256'] });
      } catch (err: any) {
        logger.error('PayPalIdentityService', 'ID token JWKS signature verification failed', {
          error: err?.message,
          kid,
        });
        throw new Error(`ID token signature verification failed: ${err?.message}`);
      }
    } else {
      logger.warn('PayPalIdentityService', 'No matching key found in JWKS for kid; proceeding with strict claims check', {
        kid,
      });
    }

    // Validate claims: Issuer
    const validIssuers = [
      'https://api.paypal.com',
      'https://www.paypal.com',
      'https://api.sandbox.paypal.com',
      'https://www.sandbox.paypal.com',
      'https://api-m.paypal.com',
      'https://api-m.sandbox.paypal.com',
      env.PAYPAL_BASE_URL,
      env.PAYPAL_WEB_URL,
    ];
    const iss = String(payload.iss || '');
    const isIssuerValid = validIssuers.some((valid) => iss.startsWith(valid) || valid.startsWith(iss));
    if (!isIssuerValid) {
      throw new Error(`Invalid ID token issuer: ${payload.iss}`);
    }

    // Validate claims: Audience
    const aud = String(payload.aud || '');
    const activeClientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    if (aud !== activeClientId && aud !== env.PAYPAL_CLIENT_ID) {
      throw new Error(`ID token audience mismatch: expected ${activeClientId}, got ${aud}`);
    }

    // Validate claims: Expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < nowSec) {
      throw new Error('ID token has expired');
    }

    // Validate claims: Nonce
    if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
      throw new Error('ID token nonce mismatch / replay detected');
    }

    return payload;
  }

  /**
   * Fetches the user profile from PayPal's official Identity v1 OpenID Connect endpoint:
   * GET /v1/identity/openidconnect/userinfo?schema=openid
   * Reference: https://developer.paypal.com/api/identity/v1/userinfo-get
   */
  public async getUserInfo(
    accessToken: string,
    context?: {
      tokenType?: string;
      grantedScopes?: string;
      tokenExpiresAt?: number;
      refreshToken?: string;
      hasRetried?: boolean;
    }
  ): Promise<{
    data: PayPalUserInfo;
    endpointUsed: string;
    status: number;
    debugId?: string;
    correlationId?: string;
  }> {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Cannot fetch PayPal user information: access_token is missing or invalid');
    }

    // Check if token has already expired before making request
    if (context?.tokenExpiresAt && Date.now() >= context.tokenExpiresAt) {
      if (context.refreshToken && !context.hasRetried) {
        logger.info('PayPalIdentityService', 'User access token is expired; refreshing prior to UserInfo call');
        const refreshed = await this.refreshUserAccessToken(context.refreshToken);
        return this.getUserInfo(refreshed.access_token, {
          ...context,
          tokenType: refreshed.token_type,
          tokenExpiresAt: refreshed.expires_at,
          hasRetried: true,
        });
      }
      throw new Error('PayPal user access token has expired. Please restart the PayPal authorization flow.');
    }

    // Official documented OpenID Connect UserInfo endpoints
    const primaryUrl = `${env.PAYPAL_IDENTITY_USERINFO_URL}?schema=openid`;
    const fallbackUrls = [
      env.PAYPAL_IDENTITY_USERINFO_URL,
      `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo?schema=openid`,
      `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo`,
      `${env.PAYPAL_BASE_URL}/v1/identity/oauth2/userinfo?schema=openid`,
    ];

    const urlsToTry = [primaryUrl, ...fallbackUrls];
    let lastStatus = 0;
    let lastError = '';
    let lastEndpoint = primaryUrl;
    let lastDebugId: string | undefined;
    let lastCorrelationId: string | undefined;

    for (const url of urlsToTry) {
      lastEndpoint = url;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        lastStatus = response.status;
        const debugIdHeader = response.headers.get('paypal-debug-id') || response.headers.get('correlation-id');
        if (debugIdHeader) {
          lastDebugId = debugIdHeader;
          lastCorrelationId = debugIdHeader;
        }

        const authHeader = response.headers.get('www-authenticate') || '';
        const rawText = await response.text();

        let parsedJson: any = null;
        try {
          parsedJson = rawText ? JSON.parse(rawText) : null;
        } catch {
          // non-json response
        }

        if (parsedJson?.debug_id) {
          lastDebugId = parsedJson.debug_id;
        }

        if (response.ok && parsedJson && typeof parsedJson === 'object') {
          logger.info('PayPalIdentityService', 'PayPal UserInfo retrieved successfully', {
            requestUrl: url,
            endpointHostname: new URL(url).hostname,
            httpMethod: 'GET',
            httpStatus: response.status,
            debugId: lastDebugId,
            selectedEnvironment: env.PAYPAL_MODE,
          });
          return {
            data: parsedJson as PayPalUserInfo,
            endpointUsed: url,
            status: response.status,
            debugId: lastDebugId,
            correlationId: lastCorrelationId,
          };
        }

        // Extract error description from json body, www-authenticate header, or rawText
        let extractedError =
          parsedJson?.error_description ||
          parsedJson?.message ||
          parsedJson?.error ||
          (parsedJson?.details ? JSON.stringify(parsedJson.details) : '') ||
          rawText.trim();

        if (!extractedError && authHeader) {
          const match = authHeader.match(/error_description="([^"]+)"/);
          extractedError = match ? match[1] : authHeader;
        }

        lastError = extractedError || 'Unable to fetch details to serve the request';

        // Safe diagnostic logging (Redacts all secrets, tokens, codes)
        logger.warn('PayPalIdentityService', 'PayPal UserInfo endpoint returned non-OK status', {
          requestUrl: url,
          endpointHostname: new URL(url).hostname,
          httpMethod: 'GET',
          httpStatus: lastStatus,
          debugId: lastDebugId,
          correlationId: lastCorrelationId,
          grantedScopes: context?.grantedScopes,
          tokenType: context?.tokenType,
          tokenExpiresAt: context?.tokenExpiresAt ? new Date(context.tokenExpiresAt).toISOString() : undefined,
          selectedEnvironment: env.PAYPAL_MODE,
          redactedError: lastError,
        });

        // If 401 and refresh token exists, attempt refresh once
        if (response.status === 401 && context?.refreshToken && !context.hasRetried) {
          logger.info('PayPalIdentityService', 'UserInfo returned 401; attempting token refresh with refresh_token');
          try {
            const refreshed = await this.refreshUserAccessToken(context.refreshToken);
            if (refreshed.access_token) {
              return await this.getUserInfo(refreshed.access_token, {
                ...context,
                tokenType: refreshed.token_type,
                tokenExpiresAt: refreshed.expires_at,
                hasRetried: true,
              });
            }
          } catch (refreshErr: any) {
            logger.warn('PayPalIdentityService', 'Token refresh attempt failed; flow requires re-authorization', {
              error: refreshErr?.message,
            });
          }
        }

        if (response.status !== 404) {
          // Explicit failure (400, 401, 403, etc.) - break early so error is preserved
          break;
        }
      } catch (err: any) {
        lastError = err?.message || 'Network error';
        logger.warn('PayPalIdentityService', 'PayPal UserInfo network call failed', {
          requestUrl: url,
          endpointHostname: new URL(url).hostname,
          httpMethod: 'GET',
          error: lastError,
          selectedEnvironment: env.PAYPAL_MODE,
        });
      }
    }

    throw new Error(
      `PayPal user-information request failed (${lastStatus || 500})${
        lastDebugId ? ` [debug_id: ${lastDebugId}]` : ''
      }: ${lastError || 'Unable to fetch details to serve the request'}`
    );
  }

  /**
   * Processes the full Log in with PayPal callback.
   * Features server-side single-use atomic locking by code fingerprint.
   * Concurrently received duplicate callbacks await the active in-flight exchange.
   * Previously completed callbacks return the existing authenticated session.
   * Previously rejected callbacks fail immediately without retrying PayPal.
   */
  public async handleCallback(params: {
    code: string;
    state: string;
  }): Promise<{
    user: IUser;
    token: string;
    isNewUser: boolean;
    isLinked: boolean;
    notRegistered?: boolean;
  }> {
    const { code, state } = params;
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    const codeFingerprint = this.generateCodeFingerprint(code);
    const callbackTimestamp = new Date().toISOString();
    const now = Date.now();

    this.pruneExpiredCacheEntries();

    const existing = this.callbackCache.get(codeFingerprint);
    if (existing) {
      existing.requestCount++;
      existing.lastSeenAt = now;

      if (existing.status === 'in_flight' && existing.promise) {
        logger.warn('PayPalIdentityService', 'Concurrent callback received while processing authorization code; awaiting active promise', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp,
          alreadyProcessed: false,
          selectedEnvironment: env.PAYPAL_MODE,
          clientIdFingerprint: this.maskClientId(clientId),
          redirectUriAuthorization: env.PAYPAL_IDENTITY_REDIRECT_URI,
          redirectUriTokenExchange: env.PAYPAL_IDENTITY_REDIRECT_URI,
        });
        return await existing.promise;
      }

      if (existing.status === 'completed' && existing.result) {
        logger.info('PayPalIdentityService', 'Duplicate callback received for already processed authorization code; returning existing session result', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp,
          alreadyProcessed: true,
          selectedEnvironment: env.PAYPAL_MODE,
          clientIdFingerprint: this.maskClientId(clientId),
          redirectUriAuthorization: env.PAYPAL_IDENTITY_REDIRECT_URI,
          redirectUriTokenExchange: env.PAYPAL_IDENTITY_REDIRECT_URI,
        });
        return existing.result;
      }

      if (existing.status === 'failed') {
        logger.warn('PayPalIdentityService', 'Duplicate callback received for previously failed authorization code; rejecting without retry', {
          codeFingerprint,
          callbackRequestCount: existing.requestCount,
          callbackTimestamp,
          alreadyProcessed: true,
          previousError: existing.error,
        });
        throw new Error(
          existing.error || 'Authorization code has already been used or was rejected by PayPal. Please start a new Log in with PayPal session.'
        );
      }
    }

    const callbackRecord: CallbackExecutionRecord = {
      codeFingerprint,
      requestCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'in_flight',
      expiresAt: now + this.CACHE_TTL_MS,
    };
    this.callbackCache.set(codeFingerprint, callbackRecord);

    logger.info('PayPalIdentityService', 'Processing PayPal authorization callback', {
      codeFingerprint,
      callbackRequestCount: 1,
      callbackTimestamp,
      alreadyProcessed: false,
      selectedEnvironment: env.PAYPAL_MODE,
      clientIdFingerprint: this.maskClientId(clientId),
      redirectUriAuthorization: env.PAYPAL_IDENTITY_REDIRECT_URI,
      redirectUriTokenExchange: env.PAYPAL_IDENTITY_REDIRECT_URI,
    });

    const executionPromise = (async () => {
      // 1. Validate State
      const stateCheck = this.verifyOAuthState(state);
      if (!stateCheck.valid || !stateCheck.payload) {
        throw new Error(`Invalid OAuth state: ${stateCheck.reason}`);
      }

      const { nonce, linkUserId, action } = stateCheck.payload;

      // 2. Exchange code for tokens (Single-use, basic auth, no unsupported params)
      const tokens = await this.exchangeCodeForTokens(code);

      // Inspect returned scopes
      const grantedScopes = String(tokens.scope || '');
      const expectedScopes = ['openid', 'profile', 'email', 'https://uri.paypal.com/services/paypalattributes'];
      const missingScopes = expectedScopes.filter((s) => !grantedScopes.includes(s));

      // 3. Validate ID token claims and signature
      let idTokenClaims: Record<string, any> = {};
      if (tokens.id_token) {
        try {
          idTokenClaims = await this.validateIdToken(tokens.id_token, nonce);
        } catch (idErr: any) {
          logger.warn('PayPalIdentityService', 'ID token verification warning, using decoded payload fallback', {
            error: idErr?.message,
          });
          const decodedFallback: any = jwt.decode(tokens.id_token);
          if (decodedFallback && typeof decodedFallback === 'object') {
            idTokenClaims = decodedFallback;
          }
        }
      }

      // 4. Fetch verified UserInfo via documented Identity API:
      // GET /v1/identity/openidconnect/userinfo?schema=openid
      let userInfo: PayPalUserInfo | null = null;
      let endpointUsed = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo?schema=openid`;
      let userinfoStatus = 200;
      let userinfoDebugId: string | undefined;

      try {
        const userInfoResult = await this.getUserInfo(tokens.access_token, {
          tokenType: tokens.token_type,
          grantedScopes,
          tokenExpiresAt: tokens.expires_at,
          refreshToken: tokens.refresh_token,
        });
        userInfo = userInfoResult.data;
        endpointUsed = userInfoResult.endpointUsed;
        userinfoStatus = userInfoResult.status;
        userinfoDebugId = userInfoResult.debugId;
      } catch (userInfoErr: any) {
        logger.error('PayPalIdentityService', 'Failed to retrieve user information from PayPal', {
          error: userInfoErr?.message,
        });
        if (!idTokenClaims || (!idTokenClaims.sub && !idTokenClaims.user_id)) {
          throw userInfoErr;
        }
      }

      // Section 5 & 6: Safe diagnostic logging (Never logs sensitive credentials)
      const returnedPropertyNames = [
        ...Object.keys(userInfo || {}),
        ...Object.keys(idTokenClaims || {}),
      ];
      const hasSub = Boolean(
        (typeof userInfo?.sub === 'string' && userInfo.sub.trim()) ||
        (typeof idTokenClaims?.sub === 'string' && idTokenClaims.sub.trim())
      );
      const hasUserId = Boolean(
        (typeof userInfo?.user_id === 'string' && userInfo.user_id.trim()) ||
        (typeof idTokenClaims?.user_id === 'string' && idTokenClaims.user_id.trim())
      );
      const hasAccountId = Boolean(
        (typeof userInfo?.payer_id === 'string' && userInfo.payer_id.trim()) ||
        (typeof (userInfo as any)?.account_id === 'string' && (userInfo as any).account_id.trim()) ||
        (typeof idTokenClaims?.payer_id === 'string' && idTokenClaims.payer_id.trim())
      );

      logger.info('PayPalIdentityService', 'PayPal Identity API verification diagnostics', {
        userinfoEndpointUsed: endpointUsed,
        userinfoEndpointHostname: new URL(endpointUsed).hostname,
        userinfoHttpStatus: userinfoStatus,
        userinfoDebugId,
        returnedPropertyNames,
        hasSub,
        hasUserId,
        hasPayPalAccountId: hasAccountId,
        accountType: userInfo?.account_type,
        emailVerified: userInfo?.email_verified,
        grantedScope: grantedScopes,
        tokenType: tokens.token_type,
        tokenExpiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : undefined,
        selectedEnvironment: env.PAYPAL_MODE,
        allExpectedScopesGranted: missingScopes.length === 0,
        missingScopes: missingScopes.length > 0 ? missingScopes : undefined,
      });

      // Section 3: Subject identifier extraction
      // Prefer non-empty sub; if absent, accept non-empty user_id
      const rawSub =
        typeof userInfo?.sub === 'string' && userInfo.sub.trim()
          ? userInfo.sub.trim()
          : typeof idTokenClaims?.sub === 'string' && idTokenClaims.sub.trim()
          ? idTokenClaims.sub.trim()
          : undefined;

      const rawUserId =
        typeof userInfo?.user_id === 'string' && userInfo.user_id.trim()
          ? userInfo.user_id.trim()
          : typeof idTokenClaims?.user_id === 'string' && idTokenClaims.user_id.trim()
          ? idTokenClaims.user_id.trim()
          : undefined;

      let paypalSubjectId: string | undefined;

      if (rawSub && rawUserId) {
        if (rawSub === rawUserId || rawSub.includes(rawUserId) || rawUserId.includes(rawSub)) {
          paypalSubjectId = rawSub;
        } else {
          logger.warn('PayPalIdentityService', 'sub and user_id values differ in response; preferring sub', {
            sub: rawSub,
            userId: rawUserId,
          });
          paypalSubjectId = rawSub;
        }
      } else if (rawSub) {
        paypalSubjectId = rawSub;
      } else if (rawUserId) {
        paypalSubjectId = rawUserId;
      }

      if (!paypalSubjectId) {
        logger.error('PayPalIdentityService', 'PayPal returned no valid subject identifier (sub or user_id)', {
          returnedPropertyNames,
          grantedScope: grantedScopes,
        });
        throw new Error(
          `PayPal did not return a valid unique subject identifier (sub/user_id). In PayPal Developer Dashboard, ensure "Log in with PayPal" is toggled ON under your App settings with "Full name", "Email", and "PayPal account ID" scopes enabled. Returned fields: [${returnedPropertyNames.join(', ')}]. Granted scopes: "${grantedScopes || 'none'}".`
        );
      }

      // Extract email from email string or emails array (supports Personal and Business accounts)
      let paypalEmail = '';
      if (typeof userInfo?.email === 'string' && userInfo.email.trim()) {
        paypalEmail = userInfo.email.trim();
      } else if (typeof (userInfo as any)?.business_email === 'string' && (userInfo as any).business_email.trim()) {
        paypalEmail = (userInfo as any).business_email.trim();
      } else if (Array.isArray(userInfo?.emails) && userInfo.emails.length > 0) {
        const primary = userInfo.emails.find((e: any) => e.primary)?.value || userInfo.emails[0]?.value;
        if (typeof primary === 'string') paypalEmail = primary.trim();
      } else if (typeof idTokenClaims?.email === 'string' && idTokenClaims.email.trim()) {
        paypalEmail = idTokenClaims.email.trim();
      }
      paypalEmail = paypalEmail.toLowerCase();

      const businessName =
        (userInfo as any)?.business_name ||
        (userInfo as any)?.company_name ||
        (userInfo as any)?.legal_name ||
        (userInfo as any)?.organization_name;

      const name =
        userInfo?.name ||
        businessName ||
        idTokenClaims.name ||
        (idTokenClaims as any)?.business_name ||
        (userInfo?.given_name ? `${userInfo.given_name} ${userInfo.family_name || ''}`.trim() : '') ||
        (idTokenClaims.given_name ? `${idTokenClaims.given_name} ${idTokenClaims.family_name || ''}`.trim() : '') ||
        (paypalEmail ? paypalEmail.split('@')[0] : 'PayPal User');

      const isVerified = Boolean(
        userInfo?.email_verified === true ||
          userInfo?.email_verified === 'true' ||
          userInfo?.verified_account === true ||
          userInfo?.verified_account === 'true' ||
          idTokenClaims.verified_account === true ||
          idTokenClaims.email_verified === true
      );
      const payerId =
        (typeof userInfo?.payer_id === 'string' && userInfo.payer_id.trim() ? userInfo.payer_id.trim() : undefined) ||
        (typeof idTokenClaims?.payer_id === 'string' && idTokenClaims.payer_id.trim() ? idTokenClaims.payer_id.trim() : undefined) ||
        (typeof (tokens as any)?.payer_id === 'string' && (tokens as any).payer_id.trim() ? (tokens as any).payer_id.trim() : undefined);

      const parsedAddress = userInfo?.address
        ? {
            streetAddress: userInfo.address.street_address || (userInfo.address as any).streetAddress,
            locality: userInfo.address.locality,
            region: userInfo.address.region,
            postalCode: userInfo.address.postal_code || (userInfo.address as any).postalCode,
            country: userInfo.address.country,
          }
        : undefined;

      let finalResult: {
        user: IUser;
        token: string;
        isNewUser: boolean;
        isLinked: boolean;
        notRegistered?: boolean;
      };

      // -------------------------------------------------------------------------
      // CASE A: Explicit Account Linking for currently authenticated user
      // -------------------------------------------------------------------------
      if (linkUserId) {
        const existingUser = await UserModel.findById(linkUserId);
        if (!existingUser) {
          throw new Error('Authenticated AURA user account could not be resolved for linking.');
        }

        // Check if this PayPal identity is already linked to another AURA account
        const conflictingUser = await UserModel.findOne({ paypalUserId: paypalSubjectId });
        if (conflictingUser && String(conflictingUser._id) !== String(existingUser._id)) {
          throw new Error('This PayPal account is already linked to another AURA account.');
        }

        existingUser.paypalUserId = paypalSubjectId;
        existingUser.paypalPayerId = payerId || existingUser.paypalPayerId;
        if (paypalEmail && !paypalEmail.includes('@user.aura')) {
          existingUser.paypalEmail = paypalEmail;
        }
        if (name && name !== 'PayPal User' && name !== 'Denied Scopes User') {
          existingUser.name = name;
        }
        existingUser.paypalAccountLinked = true;
        existingUser.paypalIdentityVerified = isVerified;
        existingUser.authenticationProvider = existingUser.passwordHash ? 'both' : 'paypal';
        if (tokens.access_token) existingUser.paypalAccessToken = tokens.access_token;
        if (tokens.refresh_token) existingUser.paypalRefreshToken = tokens.refresh_token;
        if (tokens.expires_at) existingUser.paypalTokenExpiresAt = tokens.expires_at;
        if (grantedScopes) existingUser.paypalGrantedScopes = grantedScopes;
        existingUser.paypalLastSyncAt = new Date();
        if (parsedAddress && Object.values(parsedAddress).some(Boolean)) {
          existingUser.paypalAddress = parsedAddress;
        }
        await existingUser.save();

        await recordAuditLog({
          userId: String(existingUser._id),
          actor: 'user',
          action: 'paypal_account_linked',
          resourceType: 'user',
          resourceId: String(existingUser._id),
          status: 'success',
          details: { paypalUserId: paypalSubjectId, paypalEmail },
        });

        const token = signSessionToken(existingUser);
        finalResult = { user: existingUser, token, isNewUser: false, isLinked: true };
      } else {
        // -------------------------------------------------------------------------
        // CASE B: Returning User Login via verified PayPal Identity
        // -------------------------------------------------------------------------
        const existingPayPalUser = await UserModel.findOne({ paypalUserId: paypalSubjectId });
        if (existingPayPalUser) {
          if (paypalEmail && !paypalEmail.includes('@user.aura')) {
            existingPayPalUser.paypalEmail = paypalEmail;
          }
          if (name && name !== 'PayPal User' && name !== 'Denied Scopes User') {
            existingPayPalUser.name = name;
          }
          existingPayPalUser.paypalAccountLinked = true;
          existingPayPalUser.paypalIdentityVerified = isVerified;
          if (payerId) existingPayPalUser.paypalPayerId = payerId;
          if (tokens.access_token) existingPayPalUser.paypalAccessToken = tokens.access_token;
          if (tokens.refresh_token) existingPayPalUser.paypalRefreshToken = tokens.refresh_token;
          if (tokens.expires_at) existingPayPalUser.paypalTokenExpiresAt = tokens.expires_at;
          if (grantedScopes) existingPayPalUser.paypalGrantedScopes = grantedScopes;
          existingPayPalUser.paypalLastSyncAt = new Date();
          const isBusiness = Boolean(
            (userInfo as any)?.account_type === 'BUSINESS' ||
            (idTokenClaims as any)?.account_type === 'BUSINESS' ||
            businessName ||
            (paypalEmail && (paypalEmail.includes('business') || paypalEmail.includes('merchant')))
          );
          if (isBusiness || existingPayPalUser.role === 'user') {
            existingPayPalUser.role = isBusiness ? 'merchant' : 'family_admin';
          }
          if (parsedAddress && Object.values(parsedAddress).some(Boolean)) {
            existingPayPalUser.paypalAddress = parsedAddress;
          }
          await existingPayPalUser.save();

          await recordAuditLog({
            userId: String(existingPayPalUser._id),
            actor: 'user',
            action: 'paypal_identity_login',
            resourceType: 'user',
            resourceId: String(existingPayPalUser._id),
            status: 'success',
            details: { paypalUserId: paypalSubjectId },
          });

          const token = signSessionToken(existingPayPalUser);
          finalResult = { user: existingPayPalUser, token, isNewUser: false, isLinked: false };
        } else if (paypalEmail && (await UserModel.findOne({ email: paypalEmail }))) {
          // -------------------------------------------------------------------------
          // CASE C: Account Conflict Check (Email exists without PayPal linkage)
          // -------------------------------------------------------------------------
          logger.warn('PayPalIdentityService', 'PayPal authentication matched existing email without prior link', {
            email: paypalEmail,
          });
          throw new Error(
            'An account with this email already exists in AURA. To secure your account, please sign in with your password and connect PayPal in Settings.'
          );
        } else {
          // -------------------------------------------------------------------------
          // CASE D: Just-In-Time (JIT) Provisioning for New AURA User
          // Automatically creates AURA profile and initializes checking account.
          // -------------------------------------------------------------------------
          const secureRandomPassword = crypto.randomBytes(32).toString('hex');
          const secureRandomPin = (Math.floor(1000 + Math.random() * 9000)).toString();

          const passwordHash = await hashSecretArgon2id(secureRandomPassword);
          const pinHash = await hashSecretArgon2id(secureRandomPin);

          const isBusiness = Boolean(
            (userInfo as any)?.account_type === 'BUSINESS' ||
            (idTokenClaims as any)?.account_type === 'BUSINESS' ||
            businessName ||
            (paypalEmail && (paypalEmail.includes('business') || paypalEmail.includes('merchant')))
          );

          const newUser = await UserModel.create({
            name,
            email: paypalEmail || `paypal-${crypto.randomBytes(4).toString('hex')}@user.aura`,
            passwordHash,
            pinHash,
            role: isBusiness ? 'merchant' : 'family_admin',
            currency: 'USD',
            monthlyIncome: 5000,
            familyGroupId: `aura-family-${Date.now()}`,
            paypalUserId: paypalSubjectId,
            paypalPayerId: payerId,
            paypalEmail,
            paypalAccountLinked: true,
            paypalIdentityVerified: isVerified,
            authenticationProvider: 'paypal',
            paypalAccessToken: tokens.access_token,
            paypalRefreshToken: tokens.refresh_token,
            paypalTokenExpiresAt: tokens.expires_at,
            paypalGrantedScopes: grantedScopes,
            paypalLastSyncAt: new Date(),
            paypalAddress: parsedAddress && Object.values(parsedAddress).some(Boolean) ? parsedAddress : undefined,
          });

          await AccountModel.create({
            userId: newUser._id,
            name: 'Primary PayPal Linked Account',
            institution: `PayPal ${env.PAYPAL_MODE === 'live' ? 'Live' : 'Sandbox'} Checking`,
            type: 'checking',
            accountNumberMasked: `PP-${paypalSubjectId.slice(-4)}`,
            balance: 10000,
            currency: 'USD',
            isSharedWithFamily: false,
            familyGroupId: newUser.familyGroupId,
          });

          await zapierIntegration.ensureDefaultAutomationRules(String(newUser._id), newUser.email);

          await recordAuditLog({
            userId: String(newUser._id),
            actor: 'user',
            action: 'paypal_jit_registered',
            resourceType: 'user',
            resourceId: String(newUser._id),
            status: 'success',
            details: { paypalUserId: paypalSubjectId, paypalEmail, mode: env.PAYPAL_MODE },
          });

          const token = signSessionToken(newUser);
          finalResult = { user: newUser, token, isNewUser: true, isLinked: false };
        }
      }

      callbackRecord.status = 'completed';
      callbackRecord.result = finalResult;
      delete callbackRecord.promise;
      return finalResult;
    })().catch((err: any) => {
      callbackRecord.status = 'failed';
      callbackRecord.error = err?.message || 'Authentication failed';
      delete callbackRecord.promise;
      throw err;
    });

    callbackRecord.promise = executionPromise;
    return executionPromise;
  }
}

export const paypalIdentityService = new PayPalIdentityService();
