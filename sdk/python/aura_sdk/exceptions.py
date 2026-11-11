class AuraError(Exception):
    def __init__(self, message: str, status_code: int = None, code: str = None, details: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details or {}

class AuraAuthenticationError(AuraError):
    def __init__(self, message="Authentication required or token expired", details=None):
        super().__init__(message, 401, "AUTHENTICATION_REQUIRED", details)

class AuraAuthorizationError(AuraError):
    def __init__(self, message="Access denied: Insufficient permissions", details=None):
        super().__init__(message, 403, "FORBIDDEN_ACCESS", details)

class AuraNotFoundError(AuraError):
    def __init__(self, message="Requested financial resource not found", details=None):
        super().__init__(message, 404, "NOT_FOUND", details)

class AuraRateLimitError(AuraError):
    def __init__(self, message="Rate limit exceeded", details=None):
        super().__init__(message, 429, "RATE_LIMIT_EXCEEDED", details)
