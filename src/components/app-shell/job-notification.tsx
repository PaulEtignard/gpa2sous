"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { getJobStatus } from "@/app/(app)/transactions/actions";

const STORAGE_KEY = "gpadesous_pending_jobs";
const POLL_INTERVAL_MS = 3000;

interface Notification {
  jobId: string;
  status: "running" | "done" | "error";
  categorized?: number;
  scanned?: number;
  errorMsg?: string;
}

function getPendingJobs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function removePendingJob(jobId: string) {
  try {
    const jobs = getPendingJobs().filter((id) => id !== jobId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

export function JobNotification() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function addOrUpdate(n: Notification) {
    setNotifications((prev) => {
      const existing = prev.find((x) => x.jobId === n.jobId);
      if (existing) return prev.map((x) => (x.jobId === n.jobId ? n : x));
      return [...prev, n];
    });
  }

  useEffect(() => {
    async function poll() {
      const pending = getPendingJobs();
      if (pending.length === 0) return;

      for (const jobId of pending) {
        try {
          const data = await getJobStatus(jobId);
          if (!data) {
            removePendingJob(jobId);
            continue;
          }

          if (data.status === "done") {
            addOrUpdate({
              jobId,
              status: "done",
              categorized: data.result?.categorized,
              scanned: data.result?.scanned,
            });
            removePendingJob(jobId);
            router.refresh();
          } else if (data.status === "error") {
            addOrUpdate({
              jobId,
              status: "error",
              errorMsg: data.result?.error ?? "Erreur inconnue",
            });
            removePendingJob(jobId);
          } else {
            // still pending or running
            addOrUpdate({ jobId, status: "running" });
          }
        } catch {
          // network hiccup — ignore, try again next tick
        }
      }
    }

    // Poll immediately on mount, then every 3s
    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [router]);

  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2 px-3 pb-2">
      {notifications.map((n) => (
        <div
          key={n.jobId}
          className="flex items-start gap-2 rounded-md border border-border bg-background p-2 text-xs"
        >
          {n.status === "running" && (
            <>
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <span className="text-muted-foreground">Catégorisation IA en cours…</span>
            </>
          )}
          {n.status === "done" && (
            <>
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">Catégorisation terminée</span>
                <span className="text-muted-foreground">
                  {n.categorized}/{n.scanned} transactions catégorisées
                </span>
              </div>
              <button
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setNotifications((p) => p.filter((x) => x.jobId !== n.jobId))
                }
              >
                ✕
              </button>
            </>
          )}
          {n.status === "error" && (
            <>
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-destructive">Erreur</span>
                <span className="text-muted-foreground">{n.errorMsg}</span>
              </div>
              <button
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setNotifications((p) => p.filter((x) => x.jobId !== n.jobId))
                }
              >
                ✕
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
