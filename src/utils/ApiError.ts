class ApiError extends Error {
  statusCode: number;

  /**
   * Optional machine-readable identifier (e.g. "EMAIL_NOT_VERIFIED") for cases
   * where the client must branch on the cause and the HTTP status alone is
   * ambiguous. Messages are for humans and may be reworded freely; clients
   * should never string-match on them.
   */
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
