import Link from "next/link";
import { Compass } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5 text-ink">
        <span className="flex size-9 items-center justify-center rounded-pill bg-route text-white">
          <Compass className="size-5" aria-hidden />
        </span>
        <span className="font-display text-xl leading-none font-semibold tracking-tight">
          TripPilot
        </span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
