"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuraRateLimitError = exports.AuraNotFoundError = exports.AuraAuthorizationError = exports.AuraAuthenticationError = exports.AuraError = void 0;
class AuraError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode, code, details) {
        super(message);
        this.name = 'AuraError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, AuraError.prototype);
    }
}
exports.AuraError = AuraError;
class AuraAuthenticationError extends AuraError {
    constructor(message = 'Invalid or expired authentication credentials', details) {
        super(message, 401, 'AUTHENTICATION_REQUIRED', details);
        this.name = 'AuraAuthenticationError';
        Object.setPrototypeOf(this, AuraAuthenticationError.prototype);
    }
}
exports.AuraAuthenticationError = AuraAuthenticationError;
class AuraAuthorizationError extends AuraError {
    constructor(message = 'Access forbidden: Insufficient permissions', details) {
        super(message, 403, 'FORBIDDEN_ACCESS', details);
        this.name = 'AuraAuthorizationError';
        Object.setPrototypeOf(this, AuraAuthorizationError.prototype);
    }
}
exports.AuraAuthorizationError = AuraAuthorizationError;
class AuraNotFoundError extends AuraError {
    constructor(message = 'Requested financial resource was not found', details) {
        super(message, 404, 'NOT_FOUND', details);
        this.name = 'AuraNotFoundError';
        Object.setPrototypeOf(this, AuraNotFoundError.prototype);
    }
}
exports.AuraNotFoundError = AuraNotFoundError;
class AuraRateLimitError extends AuraError {
    constructor(message = 'Rate limit exceeded; please backoff', details) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
        this.name = 'AuraRateLimitError';
        Object.setPrototypeOf(this, AuraRateLimitError.prototype);
    }
}
exports.AuraRateLimitError = AuraRateLimitError;
//# sourceMappingURL=errors.js.map