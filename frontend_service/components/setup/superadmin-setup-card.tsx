"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postJson, getJson, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BootstrapStatus = {
  needs_superadmin_bootstrap: boolean;
  bootstrap_token_required?: boolean;
};

function errorMessageForSetup(err: unknown): string {
  if (!(err instanceof ApiError)) return "Failed to create superadmin.";
  if (err.status === 409) return "Setup is already completed. Sign in to continue.";
  if (err.status === 403) return "Invalid bootstrap token.";
  if (err.status === 400) return err.message;
  return err.message || "Failed to create superadmin.";
}

export function SuperadminSetupCard() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  const setupStatusErrorMessage = (err: unknown): string => {
    if (!(err instanceof ApiError)) {
      return "Could not determine setup status. Check API configuration and try again.";
    }
    if (isDev) {
      return `Could not determine setup status (${err.status} ${err.statusText}): ${err.message}`;
    }
    return "Could not determine setup status. Check API configuration and try again.";
  };

  useEffect(() => {
    getJson<BootstrapStatus>("/api/bootstrap/status")
      .then(setStatus)
      .catch((err: unknown) => {
        setError(setupStatusErrorMessage(err));
      });
  }, [isDev]);

  const createSuperadmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      await postJson("/api/bootstrap/superadmin", {
        username,
        password,
        bootstrapToken: bootstrapToken || undefined,
      });
      setMessage("Superadmin created successfully. Continue to login.");
      setStatus((prev) => ({ ...(prev || {}), needs_superadmin_bootstrap: false }));
      setPassword("");
      setBootstrapToken("");
    } catch (err: unknown) {
      setError(errorMessageForSetup(err));
      if (err instanceof ApiError && err.status === 409) {
        setStatus((prev) => ({ ...(prev || {}), needs_superadmin_bootstrap: false }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const needsBootstrap = status?.needs_superadmin_bootstrap;
  const tokenRequired = !!status?.bootstrap_token_required;

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>One-time platform setup</CardTitle>
          <CardDescription>
            Create the first superadmin account once. After login, create institutions/programs and share registration codes with advisors, teachers, and learners.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {needsBootstrap === false ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Setup is already completed for this deployment.</p>
              <Button asChild className="w-full"><Link href="/login">Go to login</Link></Button>
            </div>
          ) : (
            <form onSubmit={createSuperadmin} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="username">Superadmin username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Superadmin password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Bootstrap token{tokenRequired ? " (required)" : " (optional)"}</Label>
                <Input id="token" type="password" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  {tokenRequired
                    ? "This deployment requires SUPERADMIN_BOOTSTRAP_TOKEN."
                    : "If SUPERADMIN_BOOTSTRAP_TOKEN is configured, enter it here."}
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-emerald-600">{message}</p>}

              <Button type="submit" className="w-full" disabled={submitting || !status || status.needs_superadmin_bootstrap !== true}>
                {submitting ? "Creating..." : "Create superadmin"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Already finished setup? <Link className="underline" href="/login">Go to login</Link>.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
