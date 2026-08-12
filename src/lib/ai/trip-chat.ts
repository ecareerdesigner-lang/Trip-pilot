import "server-only";
import { isAiConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { complete } from "@/lib/ai/client";
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from "@/lib/ai/chat-prompt";
import {
  describeCommand,
  parseChatResponse,
  screenCommands,
  type ChatCommand,
} from "@/lib/ai/chat-commands";
import type { BudgetReport } from "@/lib/travel/budget";
import type { ItineraryDay } from "@/types/view";

/**
 * The per-trip assistant.
 *
 * Produces a reply and a set of proposed commands. It does not apply them:
 * the caller previews them to the traveler, and applies only what is
 * approved. Rewriting somebody's Thursday on the strength of one sentence is
 * not a thing to do without asking.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatInput {
  destination: string;
  currency: string;
  days: ItineraryDay[];
  budget: BudgetReport | null;
  options: { id: string; name: string; kind: string; costCents: number }[];
  history: ChatTurn[];
  message: string;
}

export interface ChatOutcome {
  reply: string;
  /** Commands that passed screening, ready to apply if approved. */
  commands: ChatCommand[];
  /** One reviewable sentence per command, in the same order. */
  previews: string[];
  /** Commands the assistant proposed that could not be applied. */
  rejected: { description: string; reason: string }[];
  declined: boolean;
}

export async function askAssistant(input: ChatInput): Promise<ChatOutcome> {
  if (!isAiConfigured()) {
    throw new AppError(
      "AI_FAILED",
      "The travel assistant needs ANTHROPIC_API_KEY to be set. Everything else on this trip works without it.",
    );
  }

  const raw = await complete({
    system: CHAT_SYSTEM_PROMPT,
    prompt: buildChatPrompt({
      destination: input.destination,
      days: input.days,
      budget: input.budget,
      currency: input.currency,
      options: input.options,
      history: input.history,
      message: input.message,
    }),
    maxTokens: 2_000,
    temperature: 0.3,
    timeoutMs: 60_000,
  });

  let parsed;
  try {
    parsed = parseChatResponse(raw);
  } catch (error) {
    logger.warn("Assistant returned an unusable response", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      "AI_FAILED",
      "The assistant's answer could not be read. Try rephrasing.",
    );
  }

  const titleById = new Map(
    input.days.flatMap((day) => day.items.map((item) => [item.id, item.title])),
  );
  const knownItemIds = new Set(titleById.keys());
  const tripDates = new Set(input.days.map((day) => day.date));

    // The traveler's own words are passed in so a named weekday can be checked
  // against the date the assistant chose.
  const screened = screenCommands(
    parsed.commands,
    knownItemIds,
    tripDates,
    input.message,
  );

  if (screened.rejected.length > 0) {
    logger.warn("Assistant proposed commands that could not be applied", {
      count: screened.rejected.length,
    });
  }

  return {
    reply: parsed.reply,
    commands: screened.accepted,
    previews: screened.accepted.map((command) =>
      describeCommand(command, titleById),
    ),
    rejected: screened.rejected.map((entry) => ({
      description: describeCommand(entry.command, titleById),
      reason: entry.reason,
    })),
    declined: parsed.declined,
  };
}
