"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/**
 * Errors explain what happened and what to do about it. They do not
 * apologize, and they never show a stack trace. The digest is Next.js's
 * server-side correlation id — it matches a line in the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Client render error", { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-alert uppercase">
          Something broke
        </p>
        <h1 className="mt-2 text-2xl">This page could not load</h1>
        <p className="mt-2 text-sm text-muted">
          Nothing was saved. Try again, and if it keeps happening the server log
          has the detail.
        </p>
        {error.digest ? (
          <p className="tabular mt-3 text-xs text-muted">
            Reference: {error.digest}
          </p>
        ) : null}
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
