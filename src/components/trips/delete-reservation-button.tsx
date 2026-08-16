"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReservationResult } from "@/app/(app)/trips/[tripId]/reservations/actions";

export function DeleteReservationButton({
  tripId,
  reservationId,
  title,
  action,
}: {
  tripId: string;
  reservationId: string;
  title: string;
  action: (tripId: string, reservationId: string) => Promise<ReservationResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Remove "${title}"?`)) return;

    setBusy(true);
    const result = await action(tripId, reservationId);
    if (result.ok) {
      router.refresh();
      return;
    }
    setBusy(false);
    window.alert(result.message);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={busy}
      aria-label={`Remove ${title}`}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}
