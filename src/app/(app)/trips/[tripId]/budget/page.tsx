import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getItinerary, getTripBudget, getTripSummary } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { TripTabs } from "@/components/trips/trip-tabs";
import { BUDGET_CATEGORY_LABEL } from "@/lib/constants";
import { formatDateRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { BudgetStatus } from "@/lib/travel/budget";

export const metadata: Metadata = { title: "Budget" };

const TONE: Record<BudgetStatus, "route" | "signal" | "alert"> = {
  under: "route",
  tight: "signal",
  over: "alert",
  unset: "route",
};

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);
  if (!trip) notFound();

  const report = await getTripBudget(user.id, tripId);
  const itinerary = await getItinerary(user.id, tripId);

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={formatDateRange(trip.startDate, trip.endDate)}
      />
      <TripTabs tripId={tripId} active="Budget" />

      {itinerary?.containsMockData ? (
        <DataSourceNote className="mt-6">
          These figures come from sample travel data, not live prices.
        </DataSourceNote>
      ) : null}

      {report === null ? (
        <Card className="mt-6">
          <CardBody>
            <p className="text-sm text-muted">
              Budget tracking needs a database connection.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardBody>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted uppercase">
                    Planned
                  </p>
                  <p className="tabular mt-1 text-2xl leading-none">
                    {formatMoney(report.totalPlannedCents, trip.currency)}
                  </p>
                </div>
                <p className="tabular text-sm text-muted">
                  {report.totalAllocatedCents === null
                    ? "No total budget set"
                    : `of ${formatMoney(report.totalAllocatedCents, trip.currency)}`}
                </p>
              </div>

              {report.totalAllocatedCents !== null ? (
                <>
                  <ProgressBar
                    className="mt-3"
                    value={report.totalPlannedCents}
                    max={report.totalAllocatedCents}
                    tone={TONE[report.totalStatus]}
                    label="Planned spending against the total budget"
                  />
                  <p className="tabular mt-2 text-sm text-muted">
                    {report.totalRemainingCents !== null &&
                    report.totalRemainingCents >= 0
                      ? `${formatMoney(report.totalRemainingCents, trip.currency)} left`
                      : `${formatMoney(
                          Math.abs(report.totalRemainingCents ?? 0),
                          trip.currency,
                        )} over`}
                  </p>
                </>
              ) : null}
            </CardBody>
          </Card>

          {report.warnings.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {report.warnings.map((warning) => (
                <li
                  key={warning.message}
                  className={
                    warning.severity === "ERROR"
                      ? "rounded-card border border-alert bg-alert-soft px-4 py-3 text-sm text-alert"
                      : warning.severity === "WARNING"
                        ? "rounded-card border border-signal bg-signal-soft px-4 py-3 text-sm text-signal"
                        : "rounded-card border border-line bg-card px-4 py-3 text-sm text-muted"
                  }
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}

          <Card className="mt-6">
            <div className="divide-y divide-line-soft">
              {report.categories.map((entry) => (
                <div key={entry.category} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-soft">
                      {BUDGET_CATEGORY_LABEL[entry.category]}
                    </h3>
                    <p className="tabular text-sm text-ink">
                      {formatMoney(entry.plannedCents, trip.currency)}
                      {entry.allocatedCents !== null ? (
                        <span className="text-muted">
                          {" "}
                          / {formatMoney(entry.allocatedCents, trip.currency)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {entry.allocatedCents !== null ? (
                    <ProgressBar
                      className="mt-2"
                      value={entry.plannedCents}
                      max={entry.allocatedCents}
                      tone={TONE[entry.status]}
                      label={`${BUDGET_CATEGORY_LABEL[entry.category]} spending`}
                    />
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      No allocation set — measured, not budgeted.
                    </p>
                  )}

                  {entry.varianceCents !== null && entry.varianceCents > 0 ? (
                    <p className="tabular mt-1.5 text-xs text-alert">
                      {formatMoney(entry.varianceCents, trip.currency)} over
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
