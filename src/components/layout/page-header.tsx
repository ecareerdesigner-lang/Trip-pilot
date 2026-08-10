import type { ReactNode } from "react";

/**
 * Every page opens with the same three things: where you are, what this page
 * is for, and the one action it exists to start.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-route uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl leading-tight sm:text-[1.75rem]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
