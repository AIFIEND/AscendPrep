"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postJson, getJson, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SuperadminBootstrapPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getJson<{ needs_superadmin_bootstrap: boolean }>("/api/bootstrap/status")
      .then((d) => setNeedsBootstrap(d.needs_superadmin_bootstrap))
      .catch(() => {
        setError("Could not determine bootstrap status. Verify frontend is using the multi-tenant backend.");
      });
  }, []);

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
      setMessage("Superadmin created. You can now log in from the login page.");
      setNeedsBootstrap(false);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to create superadmin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Initial superadmin setup</CardTitle>
          <CardDescription>
            This one-time setup is available only when no superadmin exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {needsBootstrap === false ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Superadmin already configured for this environment.</p>
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
                <Label htmlFor="token">Bootstrap token (optional)</Label>
                <Input id="token" type="password" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} />
                <p className="text-xs text-muted-foreground">Required only when SUPERADMIN_BOOTSTRAP_TOKEN is configured on backend.</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-emerald-600">{message}</p>}

              <Button type="submit" className="w-full" disabled={submitting || needsBootstrap === null}>
                {submitting ? "Creating..." : "Create superadmin"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
