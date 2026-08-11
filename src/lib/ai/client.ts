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
const MODEL = "claude-sonnet-4-6";
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
        model: MODEL,
        max_tokens: request.maxTokens ?? 8_000,
        temperature: request.temperature ?? 0.4,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });

    if (!response.ok) {
      // The body may contain the request echoed back; log the status only.
      logger.error("Anthropic request failed", { status: response.status });
      throw new AppError(
        "AI_FAILED",
        response.status === 429
          ? "The planner is busy right now. Try again in a moment."
          : "The planner could not be reached. Try again in a moment.",
      );
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
