"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ApiError, getJson } from "@/lib/api";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type AdminSummary = {
  institution: { id: number; name: string; registration_code: string };
  totals: { total_students: number; total_quizzes_taken: number; average_score: number | null };
  users: Array<{
    id: number;
    username: string;
    is_admin: boolean;
    quizzes_taken: number;
    last_active: string | null;
    average_score: number | null;
  }>;
  category_performance: Record<string, { correct: number; total: number }>;
};

export const AdminDashboardClient = () => {
  const { data: session } = useSession();
  const [state, setState] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<null | "AccessDenied" | "LoadFailed">(null);

  useEffect(() => {
    if (state || !session?.user?.backendToken) return;

    (async () => {
      try {
        const resp = await getJson<AdminSummary>("/api/admin/institution/summary", {
          headers: {
            Authorization: `Bearer ${session.user.backendToken}`,
          },
        });
        setState(resp);
      } catch (e: unknown) {
        const status = e instanceof ApiError ? e.status : undefined;
        if (status === 401 || status === 403) setError("AccessDenied");
        else setError("LoadFailed");
      }
    })();
  }, [state, session]);

  const categoryRows = useMemo(
    () =>
      Object.entries(state?.category_performance ?? {})
        .map(([category, totals]) => ({
          category,
          accuracy: totals.total > 0 ? (totals.correct / totals.total) * 100 : 0,
        }))
        .sort((a, b) => a.accuracy - b.accuracy),
    [state]
  );

  if (error === "AccessDenied") {
    return <p className="text-sm text-destructive">Access denied. Your role does not have permission for this page.</p>;
  }

  if (error === "LoadFailed") {
    return <p className="text-sm text-muted-foreground">Could not load institution analytics. Please refresh and try again.</p>;
  }

  if (!state) {
    return <p className="text-sm text-muted-foreground">Loading institution analytics…</p>;
  }

  const { totals, users, institution } = state;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Total students</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{totals.total_students}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total quizzes taken</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{totals.total_quizzes_taken}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Average score</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{totals.average_score?.toFixed(1) ?? "—"}%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Institution</CardTitle>
          <CardDescription>Share this registration code with students in {institution.name}.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="font-mono text-lg tracking-wider">{institution.registration_code}</div>
          <Badge variant="secondary">Institution code</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students / users</CardTitle>
          <CardDescription>Only users in your institution are visible here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Quizzes</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.is_admin ? "Institution Admin" : "Student"}</TableCell>
                  <TableCell className="text-right">{user.quizzes_taken}</TableCell>
                  <TableCell className="text-right">{user.average_score?.toFixed(1) ?? "—"}%</TableCell>
                  <TableCell className="text-right">{user.last_active ? new Date(user.last_active).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category performance</CardTitle>
          <CardDescription>Focus intervention on the lowest-accuracy categories first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {categoryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed quizzes yet. Ask students to begin with a short practice set.</p>
          ) : (
            categoryRows.map((row) => (
              <div key={row.category} className="flex justify-between text-sm border rounded p-2">
                <span>{row.category}</span>
                <span className="font-medium">{row.accuracy.toFixed(1)}%</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
