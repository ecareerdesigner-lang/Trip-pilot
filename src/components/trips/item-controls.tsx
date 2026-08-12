"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Editing controls for one itinerary item.
 *
 * Deliberately small: change the time, change how long it takes, push the
 * rest of the day, mark it done, or remove it. Anything more elaborate
 * belongs in the chat assistant rather than in six more buttons here.
 *
 * Every change returns the whole day from the server, because moving one item
 * reroutes the journeys around it. `router.refresh()` is what puts the
 * recalculated schedule back on screen.
 */

interface Props {
  tripId: string;
  dayId: string;
  itemId: string;
  title: string;
  startMinute: number;
  durationMinutes: number;
  completed: boolean;
}

function toClock(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function fromClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function ItemControls({
  tripId,
  dayId,
  itemId,
  title,
  startMinute,
  durationMinutes,
  completed,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(toClock(startMinute));
  const [duration, setDuration] = useState(String(durationMinutes));

  const working = busy || pending;

  async function send(
    method: "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/trips/${tripId}/itinerary/${itemId}?dayId=${dayId}`,
        {
          method,
          ...(body
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as {
          error?: { message: string; traceId: string };
        };
        setError(
          data.error
            ? `${data.error.message} (reference ${data.error.traceId})`
            : "That change did not save.",
        );
        return;
      }

      setOpen(false);
      start(() => router.refresh());
    } catch {
      setError("The request did not complete. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const minute = fromClock(time);
    if (minute === null) {
      setError("Enter a time like 14:30.");
      return;
    }

    const length = Number(duration);
    if (!Number.isInteger(length) || length < 5 || length > 720) {
      setError("Enter a length between 5 and 720 minutes.");
      return;
    }

    void send("PATCH", { startMinute: minute, durationMinutes: length });
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={working}
        >
          <Clock className="size-3.5" aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void send("PATCH", { completed: !completed })}
          disabled={working}
        >
          <Check className="size-3.5" aria-hidden />
          {completed ? "Not done" : "Done"}
        </Button>
        {error ? (
          <span className="text-xs text-alert" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-card border border-line bg-paper-deep/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          Starts
          <Input
            className="tabular mt-1 h-8 w-24"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-label={`Start time for ${title}`}
          />
        </label>

        <label className="text-xs text-muted">
          Minutes
          <Input
            className="tabular mt-1 h-8 w-20"
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-label={`Length of ${title} in minutes`}
          />
        </label>

        <Button size="sm" onClick={save} disabled={working}>
          {working ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          Save
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setTime(toClock(startMinute));
            setDuration(String(durationMinutes));
          }}
          disabled={working}
        >
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <span className="text-xs text-muted">Running late?</span>
        {[15, 30, 60].map((minutes) => (
          <Button
            key={minutes}
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => void send("PATCH", { shiftFollowingBy: minutes })}
          >
            Push this and the rest by {minutes}m
          </Button>
        ))}
      </div>

      <div className="mt-3 border-t border-line-soft pt-3">
        <Button
          variant="danger"
          size="sm"
          disabled={working}
          onClick={() => void send("DELETE")}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Remove {title}
        </Button>
        <p className="mt-1.5 text-xs text-muted">
          The journey to whatever follows is recalculated from wherever you are
          then.
        </p>
      </div>

      {error ? (
        <p className={cn("mt-2 text-xs text-alert")} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
