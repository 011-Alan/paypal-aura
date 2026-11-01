import { Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { AuditLogModel, UserModel, IUser } from '../models';
import { logger } from '../config/logger';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  userId?: string;
}

// ============================================================================
// Argon2id Password and PIN Hashing (OWASP Recommended Parameters)
// ============================================================================
export async function hashSecretArgon2id(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifySecretArgon2id(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

// ============================================================================
// JWT Session Token Management
// ============================================================================
export function signSessionToken(user: { _id: unknown; email: string; role: string }): string {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

// ============================================================================
// Short-Lived Payment Approval Tokens (Bound to User + PaymentRequest + Amount)
// ============================================================================
export function issuePaymentApprovalToken(params: {
  userId: string;
  paymentRequestId: string;
  amountInr: number;
}): { token: string; tokenHash: string; expiresAt: Date } {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + env.APPROVAL_TOKEN_TTL_SECONDS * 1000);
  const token = jwt.sign(
    {
      sub: params.userId,
      paymentRequestId: params.paymentRequestId,
      amountInr: params.amountInr,
      nonce,
      purpose: 'paypal_execution_approval',
    },
    env.APPROVAL_TOKEN_SECRET,
    { expiresIn: env.APPROVAL_TOKEN_TTL_SECONDS }
  );
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash, expiresAt };
}

export function verifyPaymentApprovalToken(
  token: string,
  expected: { userId: string; paymentRequestId: string; amountInr: number; storedHash?: string }
): { valid: boolean; reason?: string } {
  try {
    const decoded = jwt.verify(token, env.APPROVAL_TOKEN_SECRET) as {
      sub: string;
      paymentRequestId: string;
      amountInr: number;
      purpose: string;
    };
    if (decoded.purpose !== 'paypal_execution_approval') {
      return { valid: false, reason: 'Invalid approval token purpose' };
    }
    if (decoded.sub !== expected.userId) {
      return { valid: false, reason: 'Approval token user mismatch' };
    }
    if (decoded.paymentRequestId !== expected.paymentRequestId) {
      return { valid: false, reason: 'Approval token payment request mismatch' };
    }
    if (Math.abs(decoded.amountInr - expected.amountInr) > 0.01) {
      return { valid: false, reason: 'Approval token amount mismatch' };
    }
    if (expected.storedHash) {
      const providedHash = crypto.createHash('sha256').update(token).digest('hex');
      if (providedHash !== expected.storedHash) {
        return { valid: false, reason: 'Approval token hash mismatch' };
      }
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: err?.message || 'Approval token expired or invalid' };
  }
}

// ============================================================================
// Authentication & Role-Based Authorization Middleware
// ============================================================================
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Bearer token.',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; email: string; role: string };
    const user = await UserModel.findById(payload.sub);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User account not found or session invalidated.',
      });
      return;
    }

    req.user = user;
    req.userId = String(user._id);
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token.',
    });
  }
}

export function requireRole(allowedRoles: Array<'user' | 'family_admin' | 'family_member'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient role permissions for this operation.',
      });
      return;
    }
    next();
  };
}

// ============================================================================
// Rate Limiters
// ============================================================================
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again in a minute.',
  },
});

export const strictAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication or PIN verification attempts. Please wait before retrying.',
  },
});

// ============================================================================
// Structured Security & Financial Audit Logger
// ============================================================================
export async function recordAuditLog(params: {
  userId?: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status?: 'success' | 'blocked' | 'failure';
  ipAddress?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AuditLogModel.create({
      userId: params.userId || undefined,
      actor: params.actor,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      status: params.status || 'success',
      ipAddress: params.ipAddress || '127.0.0.1',
      details: params.details || {},
    });
  } catch (err: any) {
    logger.warn('AuditLog', 'Failed to persist audit log entry', { error: err?.message });
  }
}

// ============================================================================
// Untrusted External Content Sanitizer (For KERNEL & Channel3 Content)
// ============================================================================
export function sanitizeUntrustedExternalText(raw: string, maxLength = 1500): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    // Strip prompt-injection style directives from untrusted web pages
    .replace(/ignore (all )?(previous|prior) instructions/gi, '[filtered]')
    .replace(/system prompt/gi, '[filtered]')
    .replace(/execute payment/gi, '[filtered]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
