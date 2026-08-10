import { Hammer } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

/**
 * A placeholder that says what it is.
 *
 * The build rules forbid screens that look finished but do nothing. Anywhere
 * a route exists before its feature does, this panel names the phase that
 * will fill it in, so nothing on screen implies working functionality.
 */
export function NotBuiltYet({
  feature,
  phase,
  detail,
}: {
  feature: string;
  phase: string;
  detail: string;
}) {
  return (
    <Card>
      <CardBody className="flex gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-signal-soft text-signal">
          <Hammer className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base leading-tight">{feature} is not built yet</h2>
          <p className="mt-1 text-sm text-muted">{detail}</p>
          <p className="mt-2 text-xs text-muted">
            Scheduled for <span className="font-medium text-ink-soft">{phase}</span>.
            The route exists so navigation and layout can be checked now.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
