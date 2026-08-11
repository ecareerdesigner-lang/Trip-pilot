import { AlertTriangle, CircleAlert, Info, CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ValidationReport, ValidationWarning } from "@/lib/travel/validate-itinerary";
import type { ValidationSeverity } from "@/types/domain";

/**
 * What is wrong with this trip.
 *
 * Errors first, because an error means the traveler will miss something.
 * Every entry says what the problem is and, where there is one, what to do
 * about it — a warning the reader cannot act on is just anxiety.
 */

const STYLE: Record<
  ValidationSeverity,
  { border: string; text: string; icon: typeof Info }
> = {
  ERROR: {
    border: "border-alert bg-alert-soft",
    text: "text-alert",
    icon: CircleAlert,
  },
  WARNING: {
    border: "border-signal bg-signal-soft",
    text: "text-signal",
    icon: AlertTriangle,
  },
  INFO: { border: "border-line bg-card", text: "text-muted", icon: Info },
};

const ORDER: ValidationSeverity[] = ["ERROR", "WARNING", "INFO"];

function Warning({ warning }: { warning: ValidationWarning }) {
  const style = STYLE[warning.severity];
  const Icon = style.icon;

  return (
    <li className={cn("rounded-card border px-4 py-3", style.border)}>
      <div className="flex gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", style.text)} aria-hidden />
        <div className="min-w-0">
          <p className={cn("text-sm", style.text)}>{warning.message}</p>
          {warning.suggestion ? (
            <p className="mt-1 text-xs text-muted">{warning.suggestion}</p>
          ) : null}
          {warning.dayNumber !== null ? (
            <p className="mt-1 text-[0.6875rem] tracking-wide text-muted uppercase">
              Day {warning.dayNumber}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ValidationPanel({ report }: { report: ValidationReport }) {
  if (report.warnings.length === 0) {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-route" aria-hidden />
          <div>
            <p className="text-sm text-ink">This schedule holds up.</p>
            <p className="mt-0.5 text-xs text-muted">
              Nothing overlaps, every journey fits the time it has, and the plan
              is inside its budget.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const sorted = [...report.warnings].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="text-base leading-tight">
          {report.possible
            ? "Worth knowing before you go"
            : "This schedule will not work as planned"}
        </h2>
        <p className="tabular text-xs text-muted">
          {report.counts.ERROR > 0 ? `${report.counts.ERROR} blocking · ` : ""}
          {report.counts.WARNING} to check
          {report.counts.INFO > 0 ? ` · ${report.counts.INFO} note` : ""}
        </p>
      </div>
      <ul className="space-y-2">
        {sorted.map((warning, index) => (
          <Warning key={`${warning.code}-${index}`} warning={warning} />
        ))}
      </ul>
    </section>
  );
}
