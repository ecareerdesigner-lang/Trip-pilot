import "server-only";
import { env, isAiConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Anthropic Messages API.
 *
 * Deliberately a thin fetch rather than an SDK: one endpoint, one shape, and
 * no dependency to keep current. The key is read here and never leaves the
 * server.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
/**
 * Model to call.
 *
 * Overridable, because a hardcoded id becomes wrong the moment Anthropic
 * publishes a new one — and the failure is an opaque 400 rather than
 * anything that names the cause.
 */
const DEFAULT_MODEL = "claude-sonnet-4-5";

function model(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}
const API_VERSION = "2023-06-01";

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Abandon the call after this long. */
  timeoutMs?: number;
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

/**
 * Turn an API failure into something the person reading it can act on.
 *
 * "Could not be reached" is wrong for a 401 — it was reached, and it said no.
 */
function explain(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return "The Anthropic API rejected the key. Check ANTHROPIC_API_KEY in .env.";
  }
  if (status === 404 || /model/i.test(detail)) {
    return `The configured model is not available on this account${
      detail ? ` (${detail})` : ""
    }. Set ANTHROPIC_MODEL in .env to one your account can use.`;
  }
  if (status === 429) {
    return "Rate limited, or the account is out of credit. Check billing at console.anthropic.com.";
  }
  if (status === 400) {
    // The API already said what was wrong. Appending a guess about
    // ANTHROPIC_MODEL to a message about billing was worse than saying
    // nothing — trust the upstream detail when there is one.
    if (detail) return `The request was rejected: ${detail}`;
    return "The request was rejected. Check ANTHROPIC_MODEL in .env — the configured model may not exist.";
  }
  if (status >= 500) {
    return "Anthropic's API is having trouble. Try again in a moment.";
  }
  return "The request to Anthropic failed. The server log has the detail.";
}

export async function complete(request: CompletionRequest): Promise<string> {
  if (!isAiConfigured()) {
    throw new AppError(
      "AI_FAILED",
      "The AI planner is not configured. Set ANTHROPIC_API_KEY to enable it.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? 120_000,
  );

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env().ANTHROPIC_API_KEY!,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: model(),
        max_tokens: request.maxTokens ?? 8_000,
        temperature: request.temperature ?? 0.4,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });

    if (!response.ok) {
      // Anthropic returns a JSON error explaining exactly what was wrong.
      // Logging only the status meant a wrong model id looked identical to a
      // dead network, which cost a debugging round.
      let detail = "";
      try {
        const body = (await response.json()) as {
          error?: { type?: string; message?: string };
        };
        detail = body.error?.message ?? "";
      } catch {
        detail = "";
      }

      logger.error("Anthropic request failed", {
        status: response.status,
        model: model(),
        detail,
      });

      throw new AppError("AI_FAILED", explain(response.status, detail));
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();

    if (text.length === 0) {
      throw new AppError("AI_FAILED", "The planner returned nothing.");
    }

    // A truncated response is not a partial itinerary, it is broken JSON.
    if (data.stop_reason === "max_tokens") {
      logger.warn("Anthropic response hit the token ceiling");
    }

    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("AI_FAILED", "The planner took too long. Try again.");
    }
    logger.error("Anthropic request threw", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("AI_FAILED", "The planner could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}
