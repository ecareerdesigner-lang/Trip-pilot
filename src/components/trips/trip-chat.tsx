"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * The per-trip assistant.
 *
 * Proposals are shown before anything is applied. The assistant is good at
 * understanding "make Friday more relaxed" and occasionally wrong about which
 * Friday — so the traveler sees plain sentences describing each change and
 * decides. Approving is one click; being surprised by a rewritten day is not
 * recoverable in one click.
 */

interface Command {
  kind: string;
  [key: string]: unknown;
}

interface Proposal {
  reply: string;
  commands: Command[];
  previews: string[];
  rejected: { description: string; reason: string }[];
  declined: boolean;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Make Friday more relaxed",
  "Add a steakhouse for dinner",
  "What is the most expensive day?",
  "Move the museum to tomorrow",
];

export function TripChat({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, startApplying] = useTransition();

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    setProposal(null);
    setMessage("");

    const asked: Turn = { role: "user", content: trimmed };
    setHistory((previous) => [...previous, asked]);

    try {
      const response = await fetch(`/api/trips/${tripId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error
            ? `${data.error.message} (reference ${data.error.traceId})`
            : "The assistant could not answer.",
        );
        return;
      }

      setHistory((previous) => [
        ...previous,
        { role: "assistant", content: data.reply },
      ]);

      // Only surface a proposal when there is something to approve.
      if (data.commands?.length > 0 || data.rejected?.length > 0) {
        setProposal(data as Proposal);
      }
    } catch {
      setError("The request did not complete. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposal || proposal.commands.length === 0) return;

    startApplying(async () => {
      try {
        const response = await fetch(`/api/trips/${tripId}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commands: proposal.commands }),
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "The changes could not be applied.");
          return;
        }

        setProposal(null);
        setHistory((previous) => [
          ...previous,
          {
            role: "assistant",
            content:
              data.failed?.length > 0
                ? `Applied ${data.appliedCount}. ${data.failed.join(" ")}`
                : `Applied ${data.appliedCount} change${
                    data.appliedCount === 1 ? "" : "s"
                  }.`,
          },
        ]);
        router.refresh();
      } catch {
        setError("The changes could not be applied.");
      }
    });
  }

  return (
    <Card className="flex flex-col">
      <div className="border-b border-line-soft px-5 py-4">
        <h2 className="text-base leading-tight">Ask about this trip</h2>
        <p className="mt-1 text-sm text-muted">
          Changes are shown before anything is altered.
        </p>
      </div>

      <div className="max-h-96 min-h-32 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {history.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="rounded-pill border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-route hover:text-route-deep"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          history.map((turn, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[85%] rounded-card px-3.5 py-2.5 text-sm",
                turn.role === "user"
                  ? "ml-auto bg-route-soft text-route-deep"
                  : "bg-paper-deep text-ink",
              )}
            >
              {turn.content}
            </div>
          ))
        )}

        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Thinking
          </p>
        ) : null}
      </div>

      {proposal && proposal.commands.length > 0 ? (
        <div className="border-t border-line-soft bg-paper-deep/40 px-5 py-4">
          <p className="text-sm font-medium text-ink-soft">
            {proposal.commands.length === 1
              ? "One change to apply"
              : `${proposal.commands.length} changes to apply`}
          </p>
          <ul className="mt-2 space-y-1">
            {proposal.previews.map((preview, index) => (
              <li key={index} className="text-sm text-ink">
                {preview}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={apply} disabled={applying}>
              {applying ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Apply
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setProposal(null)}
              disabled={applying}
            >
              <X className="size-3.5" aria-hidden />
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {proposal && proposal.rejected.length > 0 ? (
        <div className="border-t border-line-soft px-5 py-3">
          <p className="text-xs font-medium text-signal">Could not be done</p>
          <ul className="mt-1 space-y-0.5">
            {proposal.rejected.map((entry, index) => (
              <li key={index} className="text-xs text-muted">
                {entry.description} — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p
          className="border-t border-line-soft px-5 py-3 text-sm text-alert"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 border-t border-line-soft px-5 py-4">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(message);
            }
          }}
          placeholder="Move the museum to Thursday"
          aria-label="Ask the assistant about this trip"
          disabled={busy}
          className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-route disabled:opacity-60"
        />
        <Button onClick={() => void ask(message)} disabled={busy || !message.trim()}>
          <Send className="size-4" aria-hidden />
          Send
        </Button>
      </div>
    </Card>
  );
}
