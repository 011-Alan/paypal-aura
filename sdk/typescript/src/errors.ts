export class AuraError extends Error {
  public statusCode?: number;
  public code?: string;
  public details?: any;

  constructor(message: string, statusCode?: number, code?: string, details?: any) {
    super(message);
    this.name = 'AuraError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AuraError.prototype);
  }
}

export class AuraAuthenticationError extends AuraError {
  constructor(message = 'Invalid or expired authentication credentials', details?: any) {
    super(message, 401, 'AUTHENTICATION_REQUIRED', details);
    this.name = 'AuraAuthenticationError';
    Object.setPrototypeOf(this, AuraAuthenticationError.prototype);
  }
}

export class AuraAuthorizationError extends AuraError {
  constructor(message = 'Access forbidden: Insufficient permissions', details?: any) {
    super(message, 403, 'FORBIDDEN_ACCESS', details);
    this.name = 'AuraAuthorizationError';
    Object.setPrototypeOf(this, AuraAuthorizationError.prototype);
  }
}

export class AuraNotFoundError extends AuraError {
  constructor(message = 'Requested financial resource was not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'AuraNotFoundError';
    Object.setPrototypeOf(this, AuraNotFoundError.prototype);
  }
}

export class AuraRateLimitError extends AuraError {
  constructor(message = 'Rate limit exceeded; please backoff', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    this.name = 'AuraRateLimitError';
    Object.setPrototypeOf(this, AuraRateLimitError.prototype);
  }
}
