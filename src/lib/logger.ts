/**
 * Minimal structured logger.
 *
 * Server-side only in practice. Emits single-line JSON so hosting platforms
 * can index the fields. Never logs values from `context` keys that look like
 * secrets — an accidental `apiKey` in a log is a leaked credential.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY_PATTERN =
  /(key|token|secret|password|authorization|cookie|credential)/i;

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVEL_WEIGHT ? (raw as LogLevel) : "info";
}

function redact(context: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : value;
  }
  return safe;
}

function emit(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel()]) return;

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...redact(context),
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (typeof process !== "undefined" && process.stdout?.write) {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    emit("error", message, context),
};
