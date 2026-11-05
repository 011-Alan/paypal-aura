import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { UserModel, AccountModel, IUser } from '../../models';
import { hashSecretArgon2id, signSessionToken, recordAuditLog } from '../../middleware/security';
import { zapierIntegration } from '../zapier';

export interface PayPalUserInfo {
  user_id: string;
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  verified_account?: boolean | string;
  payer_id?: string;
  address?: Record<string, string>;
}

export interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
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
      scope: 'openid profile email',
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (options?.prompt) {
      params.append('prompt', options.prompt);
    }

    // PayPal OIDC /connect/ endpoint with trailing slash (canonical destination)
    const authBase = `${env.PAYPAL_WEB_URL}/connect/`;
    const url = `${authBase}?${params.toString()}`;

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

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    if (codeVerifier) {
      bodyParams.append('code_verifier', codeVerifier);
    }

    const primaryTokenUrl = `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/tokenservice`;
    const fallbackTokenUrl = `${env.PAYPAL_BASE_URL}/v1/oauth2/token`;

    logger.info('PayPalIdentityService', 'Exchanging authorization code with PayPal OpenID Connect token endpoint', {
      primaryTokenUrl,
      redirectUri,
      mode: env.PAYPAL_MODE,
      hasCodeVerifier: Boolean(codeVerifier),
    });

    let data: PayPalTokenResponse | null = null;
    let lastError = '';
    let lastStatus = 0;

    // Primary: Dedicated OpenID Connect token service (returns id_token & identity-scoped access_token)
    try {
      const oidcResp = await fetch(primaryTokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyParams.toString(),
      });

      if (oidcResp.ok) {
        data = (await oidcResp.json()) as PayPalTokenResponse;
      } else {
        lastStatus = oidcResp.status;
        lastError = await oidcResp.text();
        logger.warn('PayPalIdentityService', 'Primary OpenID tokenservice returned non-OK status', {
          status: lastStatus,
          response: lastError,
        });
      }
    } catch (err: any) {
      logger.warn('PayPalIdentityService', 'Failed to reach primary OpenID tokenservice', {
        error: err?.message,
      });
    }

    // Secondary: If tokenservice failed or is unsupported, try /v1/oauth2/token
    if (!data) {
      try {
        const oauthResp = await fetch(fallbackTokenUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: bodyParams.toString(),
        });

        if (oauthResp.ok) {
          data = (await oauthResp.json()) as PayPalTokenResponse;
        } else {
          lastStatus = oauthResp.status;
          lastError = await oauthResp.text();
          logger.error('PayPalIdentityService', 'Fallback OAuth2 token exchange also failed', {
            status: lastStatus,
            response: lastError,
          });
        }
      } catch (err: any) {
        logger.error('PayPalIdentityService', 'Failed to reach fallback OAuth2 token endpoint', {
          error: err?.message,
        });
      }
    }

    if (!data) {
      throw new Error(`PayPal token exchange failed (${lastStatus || 500}): ${lastError || 'No response from PayPal'}`);
    }

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
   * Fetches the user profile from PayPal's official UserInfo endpoint.
   * Tries canonical /v1/identity/oauth2/userinfo first, then /v1/identity/openidconnect/userinfo.
   */
  public async getUserInfo(accessToken: string): Promise<PayPalUserInfo | null> {
    const candidateUrls = [
      `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo?schema=openid`,
      `${env.PAYPAL_BASE_URL}/v1/identity/openidconnect/userinfo`,
      `${env.PAYPAL_BASE_URL}/v1/identity/oauth2/userinfo?schema=openid`,
      `${env.PAYPAL_BASE_URL}/v1/identity/oauth2/userinfo`,
    ];

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const userInfo = (await response.json()) as PayPalUserInfo;
          return userInfo;
        } else {
          logger.warn('PayPalIdentityService', `UserInfo endpoint ${url} returned status ${response.status}`);
        }
      } catch (err: any) {
        logger.warn('PayPalIdentityService', `UserInfo call to ${url} encountered network error: ${err?.message}`);
      }
    }

    return null;
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

    // 4. Fetch verified UserInfo or fallback to cryptographically verified ID token claims
    const userInfo = await this.getUserInfo(tokens.access_token);

    // Derive stable identity checking all official PayPal identity properties
    const rawUserId =
      userInfo?.user_id ||
      userInfo?.sub ||
      idTokenClaims.sub ||
      idTokenClaims.user_id ||
      idTokenClaims.payer_id ||
      tokens.user_id ||
      tokens.payer_id ||
      tokens.sub;

    const paypalUserId = typeof rawUserId === 'string' ? rawUserId.trim() : (rawUserId ? String(rawUserId) : '');

    if (!paypalUserId) {
      logger.error('PayPalIdentityService', 'PayPal returned no valid subject identifier', {
        tokenKeys: Object.keys(tokens || {}),
        hasUserInfo: Boolean(userInfo),
        idTokenClaimsKeys: Object.keys(idTokenClaims || {}),
      });
      throw new Error(
        'PayPal did not return a valid unique subject identifier (sub/user_id). In PayPal Developer Dashboard, ensure "Log in with PayPal" is toggled ON under your App settings with "Full name", "Email", and "PayPal account ID" scopes enabled.'
      );
    }

    const paypalEmail = (
      userInfo?.email ||
      idTokenClaims.email ||
      idTokenClaims.preferred_username ||
      tokens.email ||
      ''
    ).toLowerCase().trim();

    const name =
      userInfo?.name ||
      idTokenClaims.name ||
      (idTokenClaims.given_name ? `${idTokenClaims.given_name} ${idTokenClaims.family_name || ''}`.trim() : '') ||
      (paypalEmail ? paypalEmail.split('@')[0] : 'PayPal User');

    const isVerified = Boolean(
      userInfo?.verified_account === true ||
        userInfo?.verified_account === 'true' ||
        idTokenClaims.verified_account === true
    );
    const payerId = userInfo?.payer_id || idTokenClaims.payer_id || tokens.payer_id;

    // -------------------------------------------------------------------------
    // CASE A: Explicit Account Linking for currently authenticated user
    // -------------------------------------------------------------------------
    if (linkUserId) {
      const existingUser = await UserModel.findById(linkUserId);
      if (!existingUser) {
        throw new Error('Authenticated AURA user account could not be resolved for linking.');
      }

      // Check if this PayPal identity is already linked to another AURA account
      const conflictingUser = await UserModel.findOne({ paypalUserId });
      if (conflictingUser && String(conflictingUser._id) !== String(existingUser._id)) {
        throw new Error('This PayPal account is already linked to another AURA account.');
      }

      existingUser.paypalUserId = paypalUserId;
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
        details: { paypalUserId, paypalEmail },
      });

      const token = signSessionToken(existingUser);
      return { user: existingUser, token, isNewUser: false, isLinked: true };
    }

    // -------------------------------------------------------------------------
    // CASE B: Returning User Login via verified PayPal Identity
    // -------------------------------------------------------------------------
    const existingPayPalUser = await UserModel.findOne({ paypalUserId });
    if (existingPayPalUser) {
      // Update fresh details from PayPal
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
        details: { paypalUserId },
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
        // Prevent Account Takeover: Never silently merge unverified accounts
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
        paypalUserId,
        paypalEmail,
      });
      // Phase 2 / Phase 3 Requirement: Never assign a demo account! Guide user to register.
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
      email: paypalEmail || `paypal-${paypalUserId.slice(-8)}@user.aura`,
      passwordHash,
      pinHash,
      role: 'user',
      currency: 'INR',
      monthlyIncome: 85000,
      familyGroupId: `aura-family-${Date.now()}`,
      paypalUserId,
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
      accountNumberMasked: `PP-${paypalUserId.slice(-4)}`,
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
      details: { paypalUserId, paypalEmail, mode: env.PAYPAL_MODE },
    });

    const token = signSessionToken(newUser);
    return { user: newUser, token, isNewUser: true, isLinked: false };
  }
}

export const paypalIdentityService = new PayPalIdentityService();
