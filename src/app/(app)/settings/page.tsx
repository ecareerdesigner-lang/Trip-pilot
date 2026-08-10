import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotBuiltYet } from "@/components/ui/not-built-yet";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Home city, currency, timezone, default travel preferences and connected providers."
      />
      <NotBuiltYet
        feature="Settings"
        phase="Phase 22"
        detail="Account details and provider connections, alongside authentication."
      />
    </>
  );
}
