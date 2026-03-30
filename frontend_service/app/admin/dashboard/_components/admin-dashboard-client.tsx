"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ApiError, getJson, apiFetch } from "@/lib/api";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type AdminSummary = {
  institution: { id: number; name: string; registration_code: string };
  totals: { total_students: number; total_quizzes_taken: number; average_score: number | null };
  users: Array<{
    id: number;
    username: string;
    is_admin: boolean;
    is_active: boolean;
    quizzes_taken: number;
    last_active: string | null;
    average_score: number | null;
  }>;
  category_performance: Record<string, { correct: number; total: number }>;
  leaderboard?: Array<{ username: string; quizzes_taken: number; average_score: number | null }>;
  recently_active_users?: Array<{ username: string; last_active: string | null }>;
  inactive_users?: Array<{ username: string; is_active: boolean; last_active: string | null }>;
};

type Assignment = {
  id: number;
  title: string;
  question_count: number;
  assigned_count: number;
  completed_count: number;
  average_score: number | null;
  due_date: string | null;
};

export const AdminDashboardClient = () => {
  const { data: session } = useSession();
  const [state, setState] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<null | "AccessDenied" | "LoadFailed">(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentCount, setAssignmentCount] = useState(20);

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
        const assignmentResp = await getJson<Assignment[]>("/api/admin/assignments", {
          headers: { Authorization: `Bearer ${session.user.backendToken}` },
        });
        setAssignments(assignmentResp);
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
  const token = session?.user?.backendToken;
  const leaderboardRows = (state.leaderboard ?? []).slice(0, 5);

  const setStudentStatus = async (userId: number, isActive: boolean) => {
    if (!token) return;
    setActionError("");
    setActionSuccess("");
    try {
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: isActive }),
      });
      const refreshed = await getJson<AdminSummary>("/api/admin/institution/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setState(refreshed);
      setActionSuccess(`User ${isActive ? "reactivated" : "deactivated"} successfully.`);
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : "Could not update user status.");
    }
  };

  const createAssignment = async () => {
    if (!token || !assignmentTitle.trim()) return;
    setActionError("");
    try {
      await apiFetch("/api/admin/assignments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: assignmentTitle.trim(),
          question_count: assignmentCount,
          assign_to_all: true,
          categories: [],
          difficulties: [],
          mode: "practice",
        }),
      });
      const refreshed = await getJson<Assignment[]>("/api/admin/assignments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssignments(refreshed);
      setAssignmentTitle("");
      setActionSuccess("Assignment created successfully.");
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : "Could not create assignment.");
    }
  };

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
          <CardTitle>Institution leaderboard</CardTitle>
          <CardDescription>Most engaged learners by quiz activity and scores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaderboardRows.map((row, idx) => (
            <div key={row.username} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>#{idx + 1} {row.username}</span>
              <span>{row.quizzes_taken} quizzes · {row.average_score?.toFixed(1) ?? "—"}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students / users</CardTitle>
          <CardDescription>Only users in your institution are visible here.</CardDescription>
        </CardHeader>
        <CardContent>
          {actionError && (
            <Alert className="mb-4 border-destructive/50">
              <AlertTitle>Couldn’t update user</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {actionSuccess && (
            <Alert className="mb-4">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{actionSuccess}</AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quizzes</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.is_admin ? "Institution Admin" : "Student"}</TableCell>
                  <TableCell>{user.is_active ? "Active" : "Deactivated"}</TableCell>
                  <TableCell className="text-right">{user.quizzes_taken}</TableCell>
                  <TableCell className="text-right">{user.average_score?.toFixed(1) ?? "—"}%</TableCell>
                  <TableCell className="text-right">{user.last_active ? new Date(user.last_active).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    {!user.is_admin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant={user.is_active ? "destructive" : "outline"}>
                            {user.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {user.is_active ? "Deactivate student account?" : "Reactivate student account?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {user.is_active
                                ? "This student will no longer be able to log in, but historical quiz data remains."
                                : "This student will be able to log in again."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => setStudentStatus(user.id, !user.is_active)}>
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
          <CardDescription>Create and track practice assignments for your institution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label>Title</Label>
              <Input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="Week 3 Marketing Review" />
            </div>
            <div className="space-y-1">
              <Label>Question count</Label>
              <Input type="number" min={5} max={100} value={assignmentCount} onChange={(e) => setAssignmentCount(Number(e.target.value || 20))} />
            </div>
          </div>
          <Button onClick={createAssignment}>Create assignment</Button>
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="rounded border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{assignment.title}</span>
                  <span>{assignment.completed_count}/{assignment.assigned_count} completed</span>
                </div>
                <p className="text-muted-foreground">Avg score: {assignment.average_score?.toFixed(1) ?? "—"} · Questions: {assignment.question_count}</p>
              </div>
            ))}
          </div>
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
