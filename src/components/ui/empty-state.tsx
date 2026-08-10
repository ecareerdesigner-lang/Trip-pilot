import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * An empty screen is an invitation to act, so this always takes an action.
 * The copy explains what will exist here, not that nothing does.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-pill bg-route-soft text-route-deep">
          {icon}
        </div>
      ) : null}
      <div>
        <h3 className="text-base">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
