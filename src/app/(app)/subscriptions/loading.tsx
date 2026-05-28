import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-10 animate-pulse rounded bg-white/[0.04]" />
          </div>
          <div className="h-4 w-14 animate-pulse rounded bg-white/[0.04]" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-44 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-4 w-64 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-white/[0.06]" />
      </div>

      {/* AI banner */}
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
        <p className="text-sm text-zinc-400">L&apos;IA identifie vos abonnements…</p>
        <div className="ml-auto flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-8 w-16 animate-pulse rounded bg-white/[0.06]" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Card skeletons */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
