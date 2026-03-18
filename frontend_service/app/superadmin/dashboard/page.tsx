"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson, ApiError } from "@/lib/api";

export default function SuperadminDashboardPage() {
  const { data: session, status } = useSession();
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!session?.user?.backendToken) return;
    if (session.user.role !== "superadmin") return;

    getJson("/api/superadmin/summary", {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
    })
      .then(setSummary)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) setError("Access denied for current role.");
        else setError("Could not load superadmin data.");
      });
  }, [session]);

  if (status === "loading") return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!session) return <p className="text-sm">Please log in.</p>;
  if (session.user.role !== "superadmin") return <p className="text-sm text-destructive">Access denied.</p>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Superadmin Dashboard</h1>
        <p className="text-muted-foreground">Operational hub for institutions, roles, and platform health.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Metric title="Total institutions" value={summary.total_institutions} />
          <Metric title="Total users" value={summary.total_users} />
          <Metric title="Total admins" value={summary.total_admins} />
          <Metric title="Total quizzes" value={summary.total_quizzes_taken} />
        </div>
      ) : (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading summary…</CardContent></Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Institution management</CardTitle>
          <CardDescription>Create institutions, copy registration codes, and explicitly assign institution admins.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/superadmin/institutions">Open Institutions</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}
