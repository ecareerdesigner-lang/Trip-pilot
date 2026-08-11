/**
 * Skeleton for the dashboard.
 *
 * Deliberately scoped to this segment. A loading.tsx wraps its own segment
 * AND everything beneath it in Suspense, which streams the response — and a
 * streamed response has already sent its 200 by the time a page calls
 * `notFound()`. Placed at the (app) group or at trips/, this file would make
 * /trips/[tripId] answer 200 for a trip that does not exist.
 *
 * The dashboard has no children, so it is safe here. Do not add loading.tsx
 * to a segment with dynamic children; wrap the slow part in <Suspense>
 * inside the page instead.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your trips</span>
      <div className="h-9 w-64 rounded-lg bg-paper-deep" />
      <div className="h-28 rounded-card border border-line bg-card" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 rounded-card border border-line bg-card" />
        <div className="h-44 rounded-card border border-line bg-card" />
      </div>
    </div>
  );
}
