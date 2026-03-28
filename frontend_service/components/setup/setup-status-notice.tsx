"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError, getJson } from "@/lib/api";

type BootstrapStatus = {
  needs_superadmin_bootstrap: boolean;
};

export function SetupStatusNotice() {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>("");
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    getJson<BootstrapStatus>("/api/bootstrap/status")
      .then((data) => setNeedsBootstrap(!!data.needs_superadmin_bootstrap))
      .catch((err: unknown) => {
        if (isDev && err instanceof ApiError) {
          setError(`Setup status unavailable (${err.status} ${err.statusText}): ${err.message}`);
        } else if (isDev) {
          setError("Setup status unavailable due to unexpected network error.");
        }
      })
      .finally(() => setReady(true));
  }, [isDev]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Setup status error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!ready || !needsBootstrap) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5">
      <AlertTitle>First-time deployment?</AlertTitle>
      <AlertDescription>
        Finish one-time setup at <Link href="/setup" className="underline font-medium">/setup</Link> to create the first superadmin.
      </AlertDescription>
    </Alert>
  );
}
