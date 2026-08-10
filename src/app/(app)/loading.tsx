export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-64 rounded-lg bg-paper-deep" />
      <div className="h-28 rounded-card border border-line bg-card" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 rounded-card border border-line bg-card" />
        <div className="h-44 rounded-card border border-line bg-card" />
      </div>
    </div>
  );
}
