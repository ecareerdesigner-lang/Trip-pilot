"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerateResponse {
  itemCount: number;
  legCount: number;
  plannedBy: "ai" | "heuristic";
  warnings: string[];
  summary: string;
  error?: { message: string; traceId: string };
}

/**
 * Builds the itinerary for a trip.
 *
 * Reports which planner produced the result, because "AI planned" and
 * "rule-based fallback" are different products and the traveler should know
 * which one they got.
 */
export function GenerateButton({
  tripId,
  hasItinerary,
}: {
  tripId: string;
  hasItinerary: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/trips/${tripId}/generate`, {
        method: "POST",
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok) {
        setError(
          data.error
            ? `${data.error.message} (reference ${data.error.traceId})`
            : "The itinerary could not be built.",
        );
        return;
      }

      setResult(data);
      start(() => router.refresh());
    } catch {
      setError("The request did not complete. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;

  return (
    <div>
      <Button onClick={run} disabled={working}>
        {working ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {working
          ? "Building"
          : hasItinerary
            ? "Rebuild itinerary"
            : "Build itinerary"}
      </Button>

      {hasItinerary && !working ? (
        <p className="mt-2 text-xs text-muted">
          Rebuilding replaces the generated schedule. Anything you added
          yourself is kept.
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-3 rounded-card border border-alert bg-alert-soft px-4 py-3 text-sm text-alert"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-card border border-line bg-card px-4 py-3">
          <p className="text-sm text-ink">
            {result.itemCount} items and {result.legCount} journeys scheduled.
          </p>
          <p className="mt-1 text-xs text-muted">
            {result.plannedBy === "ai"
              ? "Planned by Claude from sample travel data."
              : "Built by the rule-based planner from sample travel data."}
          </p>
          {result.summary ? (
            <p className="mt-2 text-sm text-ink-soft">{result.summary}</p>
          ) : null}
          {result.warnings.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {result.warnings.map((warning) => (
                <li key={warning} className="text-xs text-signal">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
