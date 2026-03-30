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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
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
};

type Assignment = {
  id: number;
  title: string;
  description: string | null;
  categories: string[];
  difficulties: string[];
  question_count: number;
  mode: "practice" | "test";
  due_date: string | null;
  time_limit_minutes: number | null;
  assign_to_all: boolean;
  assigned_count: number;
  completed_count: number;
  average_score: number | null;
  missing_count: number;
  shuffle_questions: boolean;
  show_explanations: boolean;
  minimum_passing_score: number | null;
};

type QuizConfig = {
  categories: string[];
  difficulties: string[];
};

type AdminDashboardClientProps = {
  view?: "overview" | "students" | "assignments";
};

const DEFAULT_ASSIGNMENT_FORM = {
  title: "",
  description: "",
  question_count: 20,
  categories: [] as string[],
  difficulties: [] as string[],
  mode: "practice" as "practice" | "test",
  due_date: "",
  time_limit_minutes: "",
  assign_to_all: true,
  selected_user_ids: [] as number[],
  shuffle_questions: true,
  show_explanations: true,
  minimum_passing_score: "",
};

export const AdminDashboardClient = ({ view = "overview" }: AdminDashboardClientProps) => {
  const { data: session } = useSession();
  const [state, setState] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<null | "AccessDenied" | "LoadFailed">(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [config, setConfig] = useState<QuizConfig>({ categories: [], difficulties: [] });
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_ASSIGNMENT_FORM);

  const token = session?.user?.backendToken;

  const loadData = async () => {
    if (!token) return;
    try {
      const [summaryResp, assignmentResp, configResp] = await Promise.all([
        getJson<AdminSummary>("/api/admin/institution/summary", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        getJson<Assignment[]>("/api/admin/assignments", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        getJson<QuizConfig>("/api/quiz-config"),
      ]);
      setState(summaryResp);
      setAssignments(assignmentResp);
      setConfig(configResp);
      setError(null);
    } catch (e: unknown) {
      const status = e instanceof ApiError ? e.status : undefined;
      if (status === 401 || status === 403) setError("AccessDenied");
      else setError("LoadFailed");
    }
  };

  useEffect(() => {
    if (!state && token) {
      loadData();
    }
  }, [state, token]);

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

  const institutionLearners = useMemo(() => (state?.users ?? []).filter((u) => !u.is_admin), [state]);

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
      await loadData();
      setActionSuccess(`User ${isActive ? "reactivated" : "deactivated"} successfully.`);
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : "Could not update user status.");
    }
  };

  const createAssignment = async () => {
    if (!token || !assignmentForm.title.trim()) return;
    setActionError("");
    setActionSuccess("");

    try {
      await apiFetch("/api/admin/assignments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...assignmentForm,
          title: assignmentForm.title.trim(),
          description: assignmentForm.description.trim() || null,
          due_date: assignmentForm.due_date || null,
          time_limit_minutes: assignmentForm.time_limit_minutes ? Number(assignmentForm.time_limit_minutes) : null,
          minimum_passing_score: assignmentForm.minimum_passing_score ? Number(assignmentForm.minimum_passing_score) : null,
        }),
      });
      await loadData();
      setAssignmentForm(DEFAULT_ASSIGNMENT_FORM);
      setActionSuccess("Assignment created successfully.");
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e.message : "Could not create assignment.");
    }
  };

  const renderSummaryHeader = (
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
  );

  return (
    <div className="space-y-6">
      {(view === "overview" || view === "assignments") && renderSummaryHeader}

      {view === "overview" && (
        <>
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
              <CardTitle>Assignment summary</CardTitle>
              <CardDescription>Track completion, due dates, and required settings at a glance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignments.slice(0, 5).map((assignment) => (
                <div key={assignment.id} className="rounded border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{assignment.title}</span>
                    <span>{assignment.completed_count}/{assignment.assigned_count} completed</span>
                  </div>
                  <p className="text-muted-foreground">
                    {assignment.mode.toUpperCase()} · {assignment.question_count} questions · Due {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}
                  </p>
                </div>
              ))}
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
        </>
      )}

      {view === "students" && (
        <Card>
          <CardHeader>
            <CardTitle>Students / users</CardTitle>
            <CardDescription>Manage learner access for your institution.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-sm text-muted-foreground">
              {institutionLearners.filter((u) => u.is_active).length} active · {institutionLearners.filter((u) => !u.is_active).length} deactivated
            </div>
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
      )}

      {view === "assignments" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create assignment</CardTitle>
              <CardDescription>Build targeted practice or tests for all learners or selected students.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError && (
                <Alert className="border-destructive/50">
                  <AlertTitle>Couldn’t create assignment</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}
              {actionSuccess && (
                <Alert>
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{actionSuccess}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Week 3 Marketing Review"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={assignmentForm.description}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Explain the assignment objective or instructions."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Question count</Label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={assignmentForm.question_count}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, question_count: Number(e.target.value || 20) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mode</Label>
                  <RadioGroup
                    value={assignmentForm.mode}
                    onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, mode: value as "practice" | "test" }))}
                    className="flex gap-4 pt-2"
                  >
                    <div className="flex items-center gap-2"><RadioGroupItem value="practice" id="mode-practice" /><Label htmlFor="mode-practice">Practice</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="test" id="mode-test" /><Label htmlFor="mode-test">Test</Label></div>
                  </RadioGroup>
                </div>
                <div className="space-y-1">
                  <Label>Due date</Label>
                  <Input
                    type="datetime-local"
                    value={assignmentForm.due_date}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Time limit in minutes (optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={assignmentForm.time_limit_minutes}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, time_limit_minutes: e.target.value }))}
                    placeholder="e.g., 45"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded border p-3">
                  <Label className="font-medium">Categories</Label>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {config.categories.map((cat) => (
                      <div key={cat} className="flex items-center gap-2">
                        <Checkbox
                          id={`assign-cat-${cat}`}
                          checked={assignmentForm.categories.includes(cat)}
                          onCheckedChange={(checked) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              categories: checked ? [...prev.categories, cat] : prev.categories.filter((c) => c !== cat),
                            }))
                          }
                        />
                        <Label htmlFor={`assign-cat-${cat}`}>{cat}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded border p-3">
                  <Label className="font-medium">Difficulties</Label>
                  <div className="space-y-1">
                    {config.difficulties.map((diff) => (
                      <div key={diff} className="flex items-center gap-2">
                        <Checkbox
                          id={`assign-diff-${diff}`}
                          checked={assignmentForm.difficulties.includes(diff)}
                          onCheckedChange={(checked) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              difficulties: checked ? [...prev.difficulties, diff] : prev.difficulties.filter((d) => d !== diff),
                            }))
                          }
                        />
                        <Label htmlFor={`assign-diff-${diff}`}>{diff}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded border p-3">
                <Label className="font-medium">Assignment audience</Label>
                <RadioGroup
                  value={assignmentForm.assign_to_all ? "all" : "selected"}
                  onValueChange={(value) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      assign_to_all: value === "all",
                      selected_user_ids: value === "all" ? [] : prev.selected_user_ids,
                    }))
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2"><RadioGroupItem value="all" id="aud-all" /><Label htmlFor="aud-all">All learners in institution</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="selected" id="aud-selected" /><Label htmlFor="aud-selected">Selected learners only</Label></div>
                </RadioGroup>
                {!assignmentForm.assign_to_all && (
                  <div className="max-h-44 overflow-y-auto rounded border p-2 space-y-1">
                    {institutionLearners.map((user) => (
                      <div key={user.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`aud-${user.id}`}
                          checked={assignmentForm.selected_user_ids.includes(user.id)}
                          onCheckedChange={(checked) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              selected_user_ids: checked
                                ? [...prev.selected_user_ids, user.id]
                                : prev.selected_user_ids.filter((id) => id !== user.id),
                            }))
                          }
                        />
                        <Label htmlFor={`aud-${user.id}`}>{user.username}</Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3 rounded border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="shuffle">Shuffle questions</Label>
                  <Switch
                    id="shuffle"
                    checked={assignmentForm.shuffle_questions}
                    onCheckedChange={(checked) => setAssignmentForm((prev) => ({ ...prev, shuffle_questions: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="show-exp">Show explanations</Label>
                  <Switch
                    id="show-exp"
                    checked={assignmentForm.show_explanations}
                    onCheckedChange={(checked) => setAssignmentForm((prev) => ({ ...prev, show_explanations: checked }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Minimum passing score % (optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={assignmentForm.minimum_passing_score}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, minimum_passing_score: e.target.value }))}
                    placeholder="e.g., 75"
                  />
                </div>
              </div>

              <Button onClick={createAssignment}>Create assignment</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment tracking</CardTitle>
              <CardDescription>Assignment specs and completion metrics.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded border p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{assignment.title}</span>
                    <span>{assignment.completed_count}/{assignment.assigned_count} completed</span>
                  </div>
                  {assignment.description && <p className="text-muted-foreground">{assignment.description}</p>}
                  <p className="text-muted-foreground">
                    {assignment.mode.toUpperCase()} · {assignment.question_count} questions · Due {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}
                  </p>
                  <p className="text-muted-foreground">
                    Audience: {assignment.assign_to_all ? "All learners" : "Selected learners"} · Time limit: {assignment.time_limit_minutes ? `${assignment.time_limit_minutes} min` : "None"}
                  </p>
                  <p className="text-muted-foreground">
                    Categories: {assignment.categories.length ? assignment.categories.join(", ") : "Any"} · Difficulties: {assignment.difficulties.length ? assignment.difficulties.join(", ") : "Any"}
                  </p>
                  <p className="text-muted-foreground">
                    Avg score: {assignment.average_score?.toFixed(1) ?? "—"}% · Shuffle: {assignment.shuffle_questions ? "On" : "Off"} · Explanations: {assignment.show_explanations ? "On" : "Off"}
                    {assignment.minimum_passing_score ? ` · Passing target: ${assignment.minimum_passing_score}%` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
