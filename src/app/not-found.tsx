import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-route uppercase">
          Off the route
        </p>
        <h1 className="mt-2 text-2xl">This page does not exist</h1>
        <p className="mt-2 text-sm text-muted">
          The link may be out of date, or the trip may have been deleted.
        </p>
        <Link
          href="/dashboard"
          className={buttonStyles("primary", "md", "mt-6")}
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
