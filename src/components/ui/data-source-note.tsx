import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Honesty label.
 *
 * TripPilot never shows provider data without saying where it came from. If
 * the flight, hotel or transit numbers on screen are samples, this says so in
 * plain words rather than letting a polished layout imply live availability.
 */
export function DataSourceNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs text-signal",
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
