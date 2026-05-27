"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCategorizationJob, getJobStatus } from "@/app/(app)/transactions/actions";

// ── localStorage helpers (shared with sidebar's JobNotification) ──────────────
const STORAGE_KEY = "gpadesous_pending_jobs";

function addPendingJob(jobId: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!list.includes(jobId)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, jobId]));
  } catch {}
}

function removePendingJob(jobId: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((id) => id !== jobId)));
  } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = "idle" | "launching" | "running" | "done" | "error";

interface Result {
  scanned?: number;
  categorized?: number;
  errorMsg?: string;
}

const POLL_MS = 3000;

// ── Component ─────────────────────────────────────────────────────────────────
export function AiCategorizeButton({
  uncategorizedCount,
  activeJobId,
}: {
  uncategorizedCount: number;
  activeJobId: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(activeJobId ? "running" : "idle");
  const [result, setResult] = useState<Result | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(activeJobId);

  // Start polling whenever we have an active jobId
  function startPolling(jobId: string) {
    jobIdRef.current = jobId;
    setPhase("running");
    if (pollingRef.current) clearInterval(pollingRef.current);

    async function tick() {
      const data = await getJobStatus(jobId).catch(() => null);
      if (!data) return;

      if (data.status === "done") {
        stop();
        removePendingJob(jobId);
        setResult({ scanned: data.result?.scanned, categorized: data.result?.categorized });
        setPhase("done");
        router.refresh();
      } else if (data.status === "error") {
        stop();
        removePendingJob(jobId);
        setResult({ errorMsg: data.result?.error ?? "Erreur inconnue" });
        setPhase("error");
      }
      // pending/running → keep polling
    }

    tick(); // immediate first check
    pollingRef.current = setInterval(tick, POLL_MS);
  }

  function stop() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // On mount: resume polling if the server told us a job is active,
  // or if one was stored in localStorage (e.g. user navigated away & back)
  useEffect(() => {
    if (activeJobId) {
      startPolling(activeJobId);
    } else {
      try {
        const list: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (list.length > 0) startPolling(list[list.length - 1]);
      } catch {}
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function launch() {
    setPhase("launching");
    setResult(null);
    try {
      const { jobId } = await startCategorizationJob();
      addPendingJob(jobId);
      startPolling(jobId);

      // Fire-and-forget: the Route Handler does the actual AI work.
      // keepalive: true → the browser sends this even if the user navigates away.
      fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
        keepalive: true,
      }).catch(() => {
        // The Route Handler will have marked the job as error — polling will catch it.
      });
    } catch (e) {
      setResult({ errorMsg: e instanceof Error ? e.message : String(e) });
      setPhase("error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (phase === "running" || phase === "launching") {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Catégorisation IA en cours…
        </div>
        <p className="text-xs text-muted-foreground">Tu peux naviguer — tu seras notifié ici et dans la barre.</p>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {result.categorized}/{result.scanned} transactions catégorisées
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-auto py-0 text-xs text-muted-foreground"
          onClick={() => setPhase("idle")}
        >
          Relancer
        </Button>
      </div>
    );
  }

  if (phase === "error" && result) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          {result.errorMsg}
        </div>
        <Button size="sm" variant="ghost" className="h-auto py-0 text-xs" onClick={() => setPhase("idle")}>
          Réessayer
        </Button>
      </div>
    );
  }

  // idle
  return (
    <Button onClick={launch} disabled={uncategorizedCount === 0} size="sm">
      <Sparkles className="h-4 w-4" />
      Catégoriser avec l'IA ({uncategorizedCount})
    </Button>
  );
}
