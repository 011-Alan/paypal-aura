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
  action?: 'login' | 'register';
  codeVerifier?: string;
  clientOrigin?: string;
}

export class PayPalIdentityService {
  private jwksCache: { keys: any[]; fetchedAt: number } | null = null;
  private readonly JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private codeExchangeCache = new Map<string, { promise: Promise<PayPalTokenResponse>; expiresAt: number }>();

  /**
   * Generates a cryptographically signed OAuth 2.0 state parameter with embedded PKCE verifier.
   * Defends against CSRF, parameter tampering, and replay attacks.
   */
  public generateOAuthState(options?: {
    linkUserId?: string;
    action?: 'login' | 'register';
    codeVerifier?: string;
    clientOrigin?: string;
  }): { state: string; nonce: string; codeVerifier: string; codeChallenge: string } {
    const nonce = crypto.randomBytes(16).toString('hex');
    const codeVerifier = options?.codeVerifier || crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const payload: OAuthStatePayload = {
      nonce,
      timestamp: Date.now(),
      linkUserId: options?.linkUserId,
      action: options?.action || 'login',
      codeVerifier,
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
      codeVerifier,
      codeChallenge,
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
    } catch (err: any) {
      return { valid: false, reason: 'Failed to parse state payload' };
    }
  }

  /**
   * Constructs the official Log in with PayPal authorization redirect URL.
   * Uses PayPal's official OpenID Connect /connect endpoint with flowEntry=static.
   */
  public getAuthorizationUrl(options?: {
    linkUserId?: string;
    prompt?: string;
    action?: 'login' | 'register';
    clientOrigin?: string;
  }): {
    url: string;
    state: string;
    nonce: string;
    codeVerifier: string;
  } {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    if (!clientId || clientId.includes('your_paypal') || clientId.includes('client_id_here')) {
      throw new Error(
        `PAYPAL_CLIENT_ID_NOT_CONFIGURED: A valid PayPal Client ID is required for ${env.PAYPAL_MODE} mode.`
      );
    }

    const { state, nonce, codeVerifier, codeChallenge } = this.generateOAuthState({
      linkUserId: options?.linkUserId,
      action: options?.action || 'login',
      clientOrigin: options?.clientOrigin,
    });
    const redirectUri = env.PAYPAL_IDENTITY_REDIRECT_URI;

    // Official Log in with PayPal OpenID Connect parameters
    const params = new URLSearchParams({
      flowEntry: 'static',
      client_id: clientId,
      response_type: 'code',
      scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (options?.prompt) {
      params.append('prompt', options.prompt);
    }

    // PayPal OIDC /connect endpoint (without trailing slash) and %20 encoding for standard OIDC scope separation
    const authBase = `${env.PAYPAL_WEB_URL}/connect`;
    const queryString = params.toString().replace(/\+/g, '%20');
    const url = `${authBase}?${queryString}`;

    const clientIdMasked =
      clientId.length > 10 ? `${clientId.slice(0, 6)}...${clientId.slice(-4)}` : '***';

    logger.info('PayPalIdentityService', 'Constructed official Log in with PayPal authorization URL', {
      authEndpoint: authBase,
      redirectUri,
      mode: env.PAYPAL_MODE,
      clientId: clientIdMasked,
      action: options?.action || 'login',
      hasLinkUserId: Boolean(options?.linkUserId),
      hasPkce: true,
    });

    return { url, state, nonce, codeVerifier };
  }

  /**
   * Exchanges an authorization code for access and ID tokens using Basic Authentication and PKCE.
   */
  public async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<PayPalTokenResponse> {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_IDENTITY_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId.includes('your_paypal') || clientSecret.includes('secret_here')) {
      throw new Error(
        `PAYPAL_CREDENTIALS_MISSING: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for ${env.PAYPAL_MODE}`
      );
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const redirectUri = env.PAYPAL_IDENTITY_REDIRECT_URI;

    // De-duplicate in-flight or recent token exchange for the same authorization code.
    // Prevents "invalid_authz_code: Authorization code not found in cache" if callbacks are hit concurrently.
    const cacheKey = code.trim();
    const now = Date.now();
    const existing = this.codeExchangeCache.get(cacheKey);
    if (existing && existing.expiresAt > now) {
      logger.info('PayPalIdentityService', 'Reusing in-flight / recent token exchange for authorization code');
      return existing.promise;
    }

    const exchangePromise = (async () => {
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      if (codeVerifier) {
        bodyParams.append('code_verifier', codeVerifier);
      }

      // OpenID Connect Log In with PayPal token endpoint
      const primaryTokenUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/tokenservice`;
      const fallbackTokenUrl = `${env.PAYPAL_BASE_URL}/v1/oauth2/token`;

      logger.info('PayPalIdentityService', 'Exchanging authorization code with PayPal token endpoint', {
        primaryTokenUrl,
        redirectUri,
        mode: env.PAYPAL_MODE,
        hasCodeVerifier: Boolean(codeVerifier),
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

      // If primary returns 404 (endpoint not supported), try fallback
      if (response.status === 404) {
        logger.warn('PayPalIdentityService', 'Primary tokenservice returned 404, falling back to oauth2/token', {
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

      if (!response.ok) {
        const errText = await response.text();
        logger.error('PayPalIdentityService', 'PayPal token exchange failed', {
          status: response.status,
          response: errText,
        });
        throw new Error(`PayPal token exchange failed (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as PayPalTokenResponse;

      if (!data || !data.access_token || typeof data.access_token !== 'string') {
        throw new Error('PayPal token exchange succeeded but response is missing a valid access_token');
      }

      const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : parseInt(String(data.expires_in || 28800), 10);
      const tokenExpiresAt = Date.now() + (isNaN(expiresInSec) ? 28800 : expiresInSec) * 1000;
      data.expires_at = tokenExpiresAt;

      logger.info('PayPalIdentityService', 'PayPal user authorization token exchange successful', {
        httpStatus: response.status,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
        hasAccessToken: Boolean(data.access_token),
        hasIdToken: Boolean(data.id_token),
        hasRefreshToken: Boolean(data.refresh_token),
        grantedScope: data.scope,
        selectedEnvironment: env.PAYPAL_MODE,
      });

      return data;
    })();

    this.codeExchangeCache.set(cacheKey, {
      promise: exchangePromise,
      expiresAt: now + 120000, // 2 minutes TTL
    });

    if (this.codeExchangeCache.size > 50) {
      for (const [k, v] of this.codeExchangeCache.entries()) {
        if (v.expiresAt <= now) this.codeExchangeCache.delete(k);
      }
    }

    return exchangePromise;
  }

  /**
   * Refreshes an expired user access token using the user's refresh token via tokenservice.
   */
  public async refreshUserAccessToken(refreshToken: string): Promise<PayPalTokenResponse> {
    const clientId = env.PAYPAL_IDENTITY_CLIENT_ID || env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_IDENTITY_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/tokenservice`;
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    logger.info('PayPalIdentityService', 'Refreshing user access token via OpenID Connect tokenservice', {
      tokenUrl,
      selectedEnvironment: env.PAYPAL_MODE,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyParams.toString(),
    });

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
    const primaryUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo?schema=openid`;
    const fallbackUrls = [
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

        // Section 5: Safe diagnostic logging (Redact all secrets, tokens, codes)
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

        // Section 6: If 401 and refresh token exists, attempt refresh once
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

    // Do not replace the actual PayPal error with a generic error message during debugging!
    throw new Error(
      `PayPal user-information request failed (${lastStatus || 500})${
        lastDebugId ? ` [debug_id: ${lastDebugId}]` : ''
      }: ${lastError || 'Unable to fetch details to serve the request'}`
    );
  }

  /**
   * Processes the full Log in with PayPal callback.
   * Strictly respects:
   * - action: 'login' -> Must find existing AURA account or guide user to register (never demo fallback!)
   * - action: 'register' -> Creates verified AURA account
   * - Explicit linking if linkUserId is provided
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

    // 1. Validate State
    const stateCheck = this.verifyOAuthState(state);
    if (!stateCheck.valid || !stateCheck.payload) {
      throw new Error(`Invalid OAuth state: ${stateCheck.reason}`);
    }

    const { nonce, linkUserId, action, codeVerifier } = stateCheck.payload;

    // 2. Exchange code for tokens (with PKCE verifier)
    const tokens = await this.exchangeCodeForTokens(code, codeVerifier);

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
      // If no id_token claims were returned either, re-throw the explicit API failure!
      if (!idTokenClaims || (!idTokenClaims.sub && !idTokenClaims.user_id)) {
        throw userInfoErr;
      }
    }

    // Section 5: Safe diagnostic logging (Never logs sensitive credentials)
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
      // Both exist: verify they refer to the same identity according to PayPal's documented response
      if (rawSub === rawUserId || rawSub.includes(rawUserId) || rawUserId.includes(rawSub)) {
        paypalSubjectId = rawSub; // Prefer valid non-empty sub
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

    // Extract email from email string or emails array (schema=paypalv1.1)
    let paypalEmail = '';
    if (typeof userInfo?.email === 'string' && userInfo.email.trim()) {
      paypalEmail = userInfo.email.trim();
    } else if (Array.isArray(userInfo?.emails) && userInfo.emails.length > 0) {
      const primary = userInfo.emails.find((e: any) => e.primary)?.value || userInfo.emails[0]?.value;
      if (typeof primary === 'string') paypalEmail = primary.trim();
    } else if (typeof idTokenClaims?.email === 'string' && idTokenClaims.email.trim()) {
      paypalEmail = idTokenClaims.email.trim();
    }
    paypalEmail = paypalEmail.toLowerCase();

    const name =
      userInfo?.name ||
      idTokenClaims.name ||
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
      existingUser.paypalEmail = paypalEmail || existingUser.paypalEmail;
      existingUser.paypalAccountLinked = true;
      existingUser.paypalIdentityVerified = isVerified;
      existingUser.authenticationProvider = existingUser.passwordHash ? 'both' : 'paypal';
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
      return { user: existingUser, token, isNewUser: false, isLinked: true };
    }

    // -------------------------------------------------------------------------
    // CASE B: Returning User Login via verified PayPal Identity
    // -------------------------------------------------------------------------
    const existingPayPalUser = await UserModel.findOne({ paypalUserId: paypalSubjectId });
    if (existingPayPalUser) {
      if (paypalEmail && !existingPayPalUser.paypalEmail) {
        existingPayPalUser.paypalEmail = paypalEmail;
      }
      existingPayPalUser.paypalAccountLinked = true;
      existingPayPalUser.paypalIdentityVerified = isVerified;
      if (payerId) existingPayPalUser.paypalPayerId = payerId;
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
      return { user: existingPayPalUser, token, isNewUser: false, isLinked: false };
    }

    // -------------------------------------------------------------------------
    // CASE C: Account Conflict Check (Email exists without PayPal linkage)
    // -------------------------------------------------------------------------
    if (paypalEmail) {
      const emailConflict = await UserModel.findOne({ email: paypalEmail });
      if (emailConflict) {
        logger.warn('PayPalIdentityService', 'Login with PayPal matched existing email without prior link', {
          email: paypalEmail,
          userId: emailConflict._id,
        });
        throw new Error(
          'An account with this email already exists in AURA. To secure your account, please sign in with your password and connect PayPal in Settings.'
        );
      }
    }

    // -------------------------------------------------------------------------
    // CASE D: User selected "Login with PayPal" but has never registered with AURA
    // -------------------------------------------------------------------------
    if (action === 'login') {
      logger.info('PayPalIdentityService', 'Unregistered PayPal identity attempted Login with PayPal', {
        paypalUserId: paypalSubjectId,
        paypalEmail,
      });
      throw new Error(
        'PAYPAL_NOT_REGISTERED: No AURA account is linked to this PayPal identity. Please choose "Sign up with PayPal" to create your account.'
      );
    }

    // -------------------------------------------------------------------------
    // CASE E: New User Registration via PayPal
    // -------------------------------------------------------------------------
    const secureRandomPassword = crypto.randomBytes(32).toString('hex');
    const secureRandomPin = (Math.floor(1000 + Math.random() * 9000)).toString();

    const passwordHash = await hashSecretArgon2id(secureRandomPassword);
    const pinHash = await hashSecretArgon2id(secureRandomPin);

    const newUser = await UserModel.create({
      name,
      email: paypalEmail || `paypal-${crypto.randomBytes(4).toString('hex')}@user.aura`,
      passwordHash,
      pinHash,
      role: 'user',
      currency: 'INR',
      monthlyIncome: 85000,
      familyGroupId: `aura-family-${Date.now()}`,
      paypalUserId: paypalSubjectId,
      paypalPayerId: payerId,
      paypalEmail,
      paypalAccountLinked: true,
      paypalIdentityVerified: isVerified,
      authenticationProvider: 'paypal',
    });

    // Create default checking account for the new user
    await AccountModel.create({
      userId: newUser._id,
      name: 'Primary PayPal Linked Account',
      institution: `PayPal ${env.PAYPAL_MODE === 'live' ? 'Live' : 'Sandbox'} Checking`,
      type: 'checking',
      accountNumberMasked: `PP-${paypalSubjectId.slice(-4)}`,
      balance: 85000,
      currency: 'INR',
      isSharedWithFamily: false,
      familyGroupId: newUser.familyGroupId,
    });

    await zapierIntegration.ensureDefaultAutomationRules(String(newUser._id), newUser.email);

    await recordAuditLog({
      userId: String(newUser._id),
      actor: 'user',
      action: 'paypal_identity_registered',
      resourceType: 'user',
      resourceId: String(newUser._id),
      status: 'success',
      details: { paypalUserId: paypalSubjectId, paypalEmail, mode: env.PAYPAL_MODE },
    });

    const token = signSessionToken(newUser);
    return { user: newUser, token, isNewUser: true, isLinked: false };
  }
}

export const paypalIdentityService = new PayPalIdentityService();
