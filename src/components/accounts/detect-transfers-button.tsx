"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectTransfers } from "@/app/(app)/accounts/actions";

export function DetectTransfersButton() {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<number | null>(null);

  function handleClick() {
    startTransition(async () => {
      try {
        const { pairs } = await detectTransfers();
        setLastResult(pairs);
      } catch (e) {
        console.error(e);
        setLastResult(-1);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {lastResult !== null && lastResult >= 0 && (
        <span className="text-xs text-muted-foreground">
          {lastResult === 0
            ? "Aucune nouvelle paire trouvée."
            : `${lastResult} nouvelle${lastResult > 1 ? "s" : ""} paire${lastResult > 1 ? "s" : ""} appairée${lastResult > 1 ? "s" : ""}.`}
        </span>
      )}
      {lastResult === -1 && (
        <span className="text-xs text-destructive">Erreur — voir la console.</span>
      )}
      <Button onClick={handleClick} disabled={isPending} size="sm" variant="outline">
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse…
          </>
        ) : (
          <>
            <ArrowLeftRight className="h-3.5 w-3.5" /> Détecter les virements
          </>
        )}
      </Button>
    </div>
  );
}
