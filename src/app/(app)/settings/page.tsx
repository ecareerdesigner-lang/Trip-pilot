import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { isAiConfigured, providerMode } from "@/lib/env";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/settings/profile-form";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { COVERED_CITY_NAMES } from "@/lib/providers/mock/cities";

export const metadata: Metadata = { title: "Settings" };

/**
 * What the app is currently connected to.
 *
 * Stated plainly, because the difference between sample data and live prices
 * is the difference between a plan and a booking — and it should not require
 * reading the source to find out which one you are looking at.
 */
const PROVIDERS = [
  { kind: "flights", label: "Flights", key: "FLIGHT_API_KEY" },
  { kind: "hotels", label: "Hotels", key: "HOTEL_API_KEY" },
  { kind: "restaurants", label: "Restaurants", key: "RESTAURANT_API_KEY" },
  { kind: "activities", label: "Activities", key: "ACTIVITY_API_KEY" },
  { kind: "transit", label: "Local transport", key: "TRANSIT_API_KEY" },
  { kind: "weather", label: "Weather", key: "WEATHER_API_KEY" },
] as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const prisma = getPrisma();

  const profile = prisma
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { homeCity: true },
      })
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Your details, and what this app is connected to."
      />

      <div className="space-y-6">
        <ProfileForm
          initial={{
            name: user.name,
            homeCity: profile?.homeCity ?? "",
            currency: user.currency,
            timezone: user.timezone,
          }}
          action={saveProfileAction}
        />

        <Card>
          <CardHeader
            title="Travel data"
            description="Where hotels, restaurants and prices come from."
          />
          <div className="divide-y divide-line-soft">
            {PROVIDERS.map((provider) => {
              const live = providerMode(provider.kind) !== "mock";
              return (
                <div
                  key={provider.kind}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm text-ink">{provider.label}</span>
                  {live ? (
                    <Badge tone="route">Live</Badge>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Badge tone="signal">Sample data</Badge>
                      <code className="text-xs text-muted">{provider.key}</code>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <CardBody className="border-t border-line-soft">
            <p className="text-sm text-muted">
              Sample data covers {COVERED_CITY_NAMES.length} cities:{" "}
              {COVERED_CITY_NAMES.join(", ")}. Trips to anywhere else can be
              created, but there is nothing to suggest until a provider is
              connected.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Assistant"
            description="Planning itineraries and answering questions about a trip."
          />
          <CardBody className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">Claude</span>
            {isAiConfigured() ? (
              <Badge tone="route">Connected</Badge>
            ) : (
              <span className="flex items-center gap-2">
                <Badge tone="quiet">Not connected</Badge>
                <code className="text-xs text-muted">ANTHROPIC_API_KEY</code>
              </span>
            )}
          </CardBody>
          {!isAiConfigured() ? (
            <CardBody className="border-t border-line-soft">
              <p className="text-sm text-muted">
                Without it, itineraries are built by a rule-based planner and
                the per-trip assistant is hidden. Everything else works.
              </p>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd className="text-ink">{user.email}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Changing your email or password is not built yet.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
