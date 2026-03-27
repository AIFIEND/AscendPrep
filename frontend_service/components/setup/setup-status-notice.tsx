"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getJson } from "@/lib/api";

type BootstrapStatus = {
  needs_superadmin_bootstrap: boolean;
};

export function SetupStatusNotice() {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getJson<BootstrapStatus>("/api/bootstrap/status")
      .then((data) => setNeedsBootstrap(!!data.needs_superadmin_bootstrap))
      .finally(() => setReady(true));
  }, []);

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
