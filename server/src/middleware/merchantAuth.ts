import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './security';
import { UserModel } from '../models';

/**
 * Reusable server-side authorization guard enforcing mandatory merchant access control.
 *
 * CONCEPTUAL ENFORCEMENT:
 * 1. Authenticates the AURA user.
 * 2. Loads authoritative account and verification records directly from MongoDB.
 * 3. Confirms that merchantAccessEnabled is TRUE.
 * 4. Confirms that auraAccountType is 'BUSINESS' and merchantVerificationStatus is 'VERIFIED'.
 * 5. Rejects any attempt to spoof access via frontend state, local storage, headers, or query parameters.
 *
 * If any condition fails, immediately returns HTTP 403 Forbidden.
 */
export const requireMerchantAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return;
  }

  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      res.status(401).json({ success: false, error: 'User account not found.' });
      return;
    }

    const isVerifiedMerchant =
      user.merchantAccessEnabled === true &&
      user.auraAccountType === 'BUSINESS' &&
      user.merchantVerificationStatus === 'VERIFIED';

    if (!isVerifiedMerchant) {
      res.status(403).json({
        success: false,
        error:
          'Access denied: Verified PayPal Business account required to access Merchant Hub. Please complete business verification in Settings.',
        code: 'MERCHANT_VERIFICATION_REQUIRED',
        merchantVerificationStatus: user.merchantVerificationStatus || 'UNVERIFIED',
        auraAccountType: user.auraAccountType || 'UNVERIFIED',
        paypalAccountType: user.paypalAccountType || 'UNKNOWN',
      });
      return;
    }

    (req as any).merchantUser = user;
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Merchant authorization verification failed.',
    });
  }
};
