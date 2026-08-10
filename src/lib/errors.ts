import { ZodError } from "zod";
import { logger } from "@/lib/logger";

/**
 * Centralized error handling.
 *
 * Rules this file enforces:
 *   * Every failure produces a user-facing message that is safe to display.
 *   * Stack traces and provider payloads are logged, never returned.
 *   * Unknown throws become a 500 with a generic message and a trace id, so
 *     nothing silently fails and nothing leaks.
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "AI_FAILED"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  AI_FAILED: 502,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  /** Field-level detail, safe to show the user. */
  details?: Record<string, string[]>;
  /** Logged, never serialized to the client. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, string[]> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
  }
}

export const badRequest = (message: string, options?: AppErrorOptions) =>
  new AppError("BAD_REQUEST", message, options);

export const unauthorized = (message = "Sign in to continue.") =>
  new AppError("UNAUTHORIZED", message);

export const forbidden = (message = "You do not have access to this trip.") =>
  new AppError("FORBIDDEN", message);

export const notFound = (message = "We could not find that.") =>
  new AppError("NOT_FOUND", message);

export const rateLimited = (message: string) =>
  new AppError("RATE_LIMITED", message);

export const providerUnavailable = (
  provider: string,
  options?: AppErrorOptions,
) =>
  new AppError(
    "PROVIDER_UNAVAILABLE",
    `${provider} is not responding right now. Try again in a moment.`,
    options,
  );

export const databaseUnavailable = () =>
  new AppError(
    "DATABASE_UNAVAILABLE",
    "The database is not connected. Set DATABASE_URL and run `npm run db:push`.",
  );

/** Shape returned to the client for every failed request. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
    traceId: string;
  };
}

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `trace_${Date.now()}`;
}

function fieldErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Convert anything thrown into a safe response body plus HTTP status.
 * Logs the full error server-side under the same trace id shown to the user.
 */
export function toErrorBody(
  error: unknown,
  context: Record<string, unknown> = {},
): { body: ErrorBody; status: number } {
  const id = traceId();

  if (error instanceof AppError) {
    logger.warn("Handled application error", {
      traceId: id,
      code: error.code,
      message: error.message,
      ...context,
    });
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          traceId: id,
        },
      },
    };
  }

  if (error instanceof ZodError) {
    logger.warn("Validation failed", { traceId: id, ...context });
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Some fields need attention.",
          details: fieldErrors(error),
          traceId: id,
        },
      },
    };
  }

  logger.error("Unhandled error", {
    traceId: id,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL",
        message:
          "Something went wrong on our side. Nothing was saved. Try again.",
        traceId: id,
      },
    },
  };
}
