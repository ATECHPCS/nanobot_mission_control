'use client'

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
      {/* Row 1: icon + name + dot */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-muted" />
        <div className="h-3.5 w-24 rounded bg-muted" />
        <div className="ml-auto w-2.5 h-2.5 rounded-full bg-muted" />
      </div>

      {/* Row 2: activity text */}
      <div className="h-3 w-full rounded bg-muted mb-2" />
      <div className="h-3 w-3/4 rounded bg-muted mb-2" />

      {/* Row 3: last active */}
      <div className="h-2.5 w-20 rounded bg-muted mb-3" />

      {/* Row 4: channels */}
      <div className="flex gap-3">
        <div className="h-2.5 w-24 rounded bg-muted" />
        <div className="h-2.5 w-28 rounded bg-muted" />
      </div>
    </div>
  )
}

export function AgentSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
