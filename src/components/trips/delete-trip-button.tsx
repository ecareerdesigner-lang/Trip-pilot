"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Deletes an entire trip.
 *
 * Deliberately more friction than removing one itinerary item: this is
 * irreversible and takes every day, every booked option, and every dollar
 * of planning with it. A native confirm() is a real interruption rather
 * than a second click that is easy to make on reflex.
 */
export function DeleteTripButton({
  tripId,
  tripName,
}: {
  tripId: string;
  tripName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(event: React.MouseEvent) {
    // Trip cards wrap their whole body in a Link — without this, the click
    // navigates to the trip instead of (or as well as) deleting it.
    event.preventDefault();
    event.stopPropagation();

    if (!window.confirm(`Delete "${tripName}"? This cannot be undone.`)) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as {
          error?: { message: string };
        };
        setError(data.error?.message ?? "That trip could not be deleted.");
        setBusy(false);
        return;
      }

      router.refresh();
    } catch {
      setError("The request did not complete. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={busy}
        aria-label={`Delete ${tripName}`}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
      </Button>
      {error ? (
        <span className="text-xs text-alert" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
