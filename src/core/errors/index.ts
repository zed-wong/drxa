export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  
  // Validation errors
  INVALID_PARAMS = 'INVALID_PARAMS',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_CHAIN = 'INVALID_CHAIN',
  
  // Adapter errors
  ADAPTER_NOT_FOUND = 'ADAPTER_NOT_FOUND',
  ADAPTER_NOT_INITIALIZED = 'ADAPTER_NOT_INITIALIZED',
  ADAPTER_METHOD_NOT_IMPLEMENTED = 'ADAPTER_METHOD_NOT_IMPLEMENTED',
  
  // Transaction errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_CONFIG = 'MISSING_CONFIG',
  
  // Resource errors
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  CONNECTION_POOL_FULL = 'CONNECTION_POOL_FULL',
}

export interface ErrorContext {
  chain?: string;
  method?: string;
  params?: unknown;
  originalError?: Error;
  [key: string]: unknown;
}

export class DrxaError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    context: ErrorContext = {},
    isRetryable = false
  ) {
    super(message);
    this.name = 'DrxaError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.isRetryable = isRetryable;
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DrxaError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      stack: this.stack,
    };
  }
}

export class NetworkError extends DrxaError {
  constructor(message: string, context: ErrorContext = {}) {
    super(ErrorCode.NETWORK_ERROR, message, context, true);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends DrxaError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context, false);
    this.name = 'ValidationError';
  }
}

export class AdapterError extends DrxaError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context, false);
    this.name = 'AdapterError';
  }
}

export class TransactionError extends DrxaError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context, code === ErrorCode.INSUFFICIENT_BALANCE);
    this.name = 'TransactionError';
  }
}

export class ConfigurationError extends DrxaError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context, false);
    this.name = 'ConfigurationError';
  }
}

// Error factory for creating specific errors
export class ErrorFactory {
  static networkError(message: string, context?: ErrorContext): NetworkError {
    return new NetworkError(message, context);
  }

  static validationError(code: ErrorCode, message: string, context?: ErrorContext): ValidationError {
    return new ValidationError(code, message, context);
  }

  static adapterNotFound(chain: string): AdapterError {
    return new AdapterError(
      ErrorCode.ADAPTER_NOT_FOUND,
      `Adapter for chain '${chain}' not found`,
      { chain }
    );
  }

  static methodNotImplemented(chain: string, method: string): AdapterError {
    return new AdapterError(
      ErrorCode.ADAPTER_METHOD_NOT_IMPLEMENTED,
      `Method '${method}' is not implemented for chain '${chain}'`,
      { chain, method }
    );
  }

  static invalidParams(message: string, params: unknown): ValidationError {
    return new ValidationError(
      ErrorCode.INVALID_PARAMS,
      message,
      { params }
    );
  }

  static insufficientBalance(chain: string, required: string, available: string): TransactionError {
    return new TransactionError(
      ErrorCode.INSUFFICIENT_BALANCE,
      `Insufficient balance on ${chain}. Required: ${required}, Available: ${available}`,
      { chain, required, available }
    );
  }
}

// Retry logic helper
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = (error) => error instanceof DrxaError && error.isRetryable,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError!;
}