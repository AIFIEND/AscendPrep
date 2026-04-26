"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Progress } from "@/components/ui/progress";
import { SectionBlock } from "@/components/ui/page-shell";
import { Activity, Building2, Users, ClipboardCheck } from "lucide-react";
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

type AdminRoleplayPracticeSummary = {
  total_students: number;
  students_with_attempts: number;
  students_without_attempts: number;
  total_attempts: number;
  average_score_percent: number | null;
  recent_activity: Array<{
    attempt_id: number;
    student_id: number;
    student_name: string;
    roleplay_id: number;
    business_name: string | null;
    event: string | null;
    score_percent: number | null;
    completed_at: string | null;
  }>;
  students: Array<{
    student_id: number;
    student_name: string;
    attempts: number;
    roleplays_practiced_count: number;
    average_score_percent: number | null;
    best_score_percent: number | null;
    last_practiced_at: string | null;
  }>;
};

type AdminDashboardClientProps = {
  view?: "overview" | "students" | "assignments";
};

type RoleplayListItem = {
  id: number;
  business_name: string;
  event: string;
};

type RoleplayAssignment = {
  id: number;
  title: string;
  instructions: string | null;
  due_date: string | null;
  assignment_type: "mcq_drill" | "full_roleplay";
  drill_type: string | null;
  drill_label: string | null;
  roleplay_id: number;
  roleplay: RoleplayListItem | null;
  advisor: string | null;
  created_at: string | null;
  assigned_count: number;
  completed_count: number;
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
  const [objectiveActionError, setObjectiveActionError] = useState<string>("");
  const [objectiveActionSuccess, setObjectiveActionSuccess] = useState<string>("");
  const [roleplayActionError, setRoleplayActionError] = useState<string>("");
  const [roleplayActionSuccess, setRoleplayActionSuccess] = useState<string>("");
  const [creatingObjectiveAssignment, setCreatingObjectiveAssignment] = useState(false);
  const [creatingRoleplayAssignment, setCreatingRoleplayAssignment] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [config, setConfig] = useState<QuizConfig>({ categories: [], difficulties: [] });
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_ASSIGNMENT_FORM);
  const [roleplaySummary, setRoleplaySummary] = useState<AdminRoleplayPracticeSummary | null>(null);
  const [roleplays, setRoleplays] = useState<RoleplayListItem[]>([]);
  const [roleplayAssignments, setRoleplayAssignments] = useState<RoleplayAssignment[]>([]);
  const [roleplayForm, setRoleplayForm] = useState({
    title: "",
    instructions: "",
    due_date: "",
    roleplay_id: "",
    assignment_type: "mcq_drill" as "mcq_drill" | "full_roleplay",
    drill_type: "determine_objective",
    student_ids: [] as number[],
  });

  const token = session?.user?.backendToken;

  const loadData = async () => {
    if (!token) return;
    try {
      const [summaryResp, assignmentResp, configResp, roleplayCatalogResp, roleplayAssignmentsResp] = await Promise.all([
        getJson<AdminSummary>("/api/admin/institution/summary", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        getJson<Assignment[]>("/api/admin/assignments", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        getJson<QuizConfig>("/api/quiz-config"),
        getJson<RoleplayListItem[]>("/api/roleplays?active=1"),
        getJson<RoleplayAssignment[]>("/api/admin/roleplay-assignments", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setState(summaryResp);
      setAssignments(assignmentResp);
      setConfig(configResp);
      setRoleplays(roleplayCatalogResp ?? []);
      setRoleplayAssignments(roleplayAssignmentsResp ?? []);
      setError(null);
      try {
        const roleplayResp = await getJson<AdminRoleplayPracticeSummary>("/api/admin/roleplay-practice-summary", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoleplaySummary(roleplayResp);
      } catch {
        setRoleplaySummary(null);
      }
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
    if (!token || !assignmentForm.title.trim() || creatingObjectiveAssignment) return;
    setObjectiveActionError("");
    setObjectiveActionSuccess("");
    setCreatingObjectiveAssignment(true);

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
      setObjectiveActionSuccess("Objective test assignment created successfully.");
    } catch (e: unknown) {
      setObjectiveActionError(e instanceof ApiError ? e.message : "Could not create objective test assignment.");
    } finally {
      setCreatingObjectiveAssignment(false);
    }
  };

  const createRoleplayAssignment = async () => {
    if (!token || !roleplayForm.roleplay_id || roleplayForm.student_ids.length === 0 || creatingRoleplayAssignment) return;
    setRoleplayActionError("");
    setRoleplayActionSuccess("");
    setCreatingRoleplayAssignment(true);
    try {
      await apiFetch("/api/admin/roleplay-assignments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          roleplay_id: Number(roleplayForm.roleplay_id),
          assignment_type: roleplayForm.assignment_type,
          drill_type: roleplayForm.assignment_type === "mcq_drill" ? roleplayForm.drill_type : null,
          title: roleplayForm.title.trim() || null,
          instructions: roleplayForm.instructions.trim() || null,
          due_date: roleplayForm.due_date || null,
          student_ids: roleplayForm.student_ids,
        }),
      });
      setRoleplayForm({
        title: "",
        instructions: "",
        due_date: "",
        roleplay_id: "",
        assignment_type: "mcq_drill",
        drill_type: "determine_objective",
        student_ids: [],
      });
      await loadData();
      setRoleplayActionSuccess("Roleplay assignment created successfully.");
    } catch (e: unknown) {
      setRoleplayActionError(e instanceof ApiError ? e.message : "Could not create roleplay assignment.");
    } finally {
      setCreatingRoleplayAssignment(false);
    }
  };

  const renderSummaryHeader = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="border-border/70 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total learners</p>
            <p className="text-2xl font-bold">{totals.total_students}</p>
          </div>
          <Users className="h-5 w-5 text-primary" />
        </CardContent>
      </Card>
      <Card className="border-border/70 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sessions completed</p>
            <p className="text-2xl font-bold">{totals.total_quizzes_taken}</p>
          </div>
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </CardContent>
      </Card>
      <Card className="border-border/70 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average score</p>
            <p className="text-2xl font-bold">{totals.average_score == null ? "—" : `${totals.average_score.toFixed(1)}%`}</p>
          </div>
          <Activity className="h-5 w-5 text-primary" />
        </CardContent>
      </Card>
      <Card className="border-border/70 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Institution</p>
            <p className="max-w-[12rem] truncate text-lg font-bold">{institution.name}</p>
          </div>
          <Building2 className="h-5 w-5 text-primary" />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {(view === "overview" || view === "assignments") && renderSummaryHeader}

      {view === "overview" && (
        <>
          <SectionBlock>
            <CardHeader>
              <CardTitle>Your Institution</CardTitle>
              <CardDescription>Share this registration code with learners in {institution.name}.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="font-mono text-lg tracking-wider">{institution.registration_code}</div>
              <Badge variant="secondary">Institution code</Badge>
            </CardContent>
          </SectionBlock>

          <SectionBlock>
            <CardHeader>
              <CardTitle>Learner leaderboard</CardTitle>
              <CardDescription>Most engaged learners by quiz activity and scores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaderboardRows.map((row, idx) => (
                <div key={row.username} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span>#{idx + 1} {row.username}</span>
                  <span>{row.quizzes_taken} quizzes · {row.average_score == null ? "—" : `${row.average_score.toFixed(1)}%`}</span>
                </div>
              ))}
            </CardContent>
          </SectionBlock>

          <SectionBlock>
            <CardHeader>
              <CardTitle>Assignment summary</CardTitle>
              <CardDescription>Track completion, due dates, and required settings at a glance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No objective assignments have been created yet. Use the Assignments tab to create the first one.</p>
              ) : (
                assignments.slice(0, 5).map((assignment) => (
                  <div key={assignment.id} className="rounded-xl border border-border/70 bg-secondary/25 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{assignment.title}</span>
                      <span>{assignment.completed_count}/{assignment.assigned_count} completed</span>
                    </div>
                    <p className="text-muted-foreground">
                      {assignment.mode.toUpperCase()} · {assignment.question_count} questions · Due {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </SectionBlock>

          <SectionBlock>
            <CardHeader>
              <CardTitle>Roleplay Practice Activity</CardTitle>
              <CardDescription>Recent roleplay practice completion and learner progress.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!roleplaySummary ? (
                <p className="text-sm text-muted-foreground">Roleplay activity is unavailable right now.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded border p-3 text-sm"><p className="text-muted-foreground">Total Attempts</p><p className="text-xl font-semibold">{roleplaySummary.total_attempts}</p></div>
                    <div className="rounded border p-3 text-sm"><p className="text-muted-foreground">Students With Attempts</p><p className="text-xl font-semibold">{roleplaySummary.students_with_attempts}</p></div>
                    <div className="rounded border p-3 text-sm"><p className="text-muted-foreground">Students Without Attempts</p><p className="text-xl font-semibold">{roleplaySummary.students_without_attempts}</p></div>
                    <div className="rounded border p-3 text-sm"><p className="text-muted-foreground">Average Score</p><p className="text-xl font-semibold">{roleplaySummary.average_score_percent == null ? "—" : `${roleplaySummary.average_score_percent.toFixed(1)}%`}</p></div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Recent Activity</p>
                    {roleplaySummary.recent_activity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent roleplay practice activity yet. Encourage learners to start a roleplay to populate activity.</p>
                    ) : (
                      <div className="space-y-2">
                        {roleplaySummary.recent_activity.map((item) => (
                          <div key={item.attempt_id} className="rounded border p-2 text-sm flex items-center justify-between gap-2">
                            <span>{item.student_name} · {item.business_name ?? `Roleplay #${item.roleplay_id}`}</span>
                            <span className="text-muted-foreground">{item.score_percent == null ? "—" : `${item.score_percent}%`} {item.completed_at ? `· ${new Date(item.completed_at).toLocaleString()}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Student Summary</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Attempts</TableHead>
                          <TableHead>Roleplays</TableHead>
                          <TableHead>Average Score</TableHead>
                          <TableHead>Best Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roleplaySummary.students.map((student) => (
                          <TableRow key={student.student_id}>
                            <TableCell>{student.student_name}</TableCell>
                            <TableCell>{student.attempts}</TableCell>
                            <TableCell>{student.roleplays_practiced_count}</TableCell>
                            <TableCell>{student.average_score_percent == null ? "—" : `${student.average_score_percent.toFixed(1)}%`}</TableCell>
                            <TableCell>{student.best_score_percent == null ? "—" : `${student.best_score_percent.toFixed(1)}%`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </SectionBlock>

          <SectionBlock>
            <CardHeader>
              <CardTitle>Category performance</CardTitle>
              <CardDescription>Focus intervention on the lowest-accuracy categories first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoryRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed quizzes yet. Ask students to begin with a short practice set.</p>
              ) : (
                categoryRows.map((row) => (
                  <div key={row.category} className="space-y-1 rounded-lg border border-border/70 bg-secondary/25 p-3">
                    <div className="flex justify-between text-sm">
                      <span>{row.category}</span>
                      <span className="font-medium">{row.accuracy.toFixed(1)}%</span>
                    </div>
                    <Progress value={row.accuracy} className="h-2" />
                  </div>
                ))
              )}
            </CardContent>
          </SectionBlock>
        </>
      )}

      {view === "students" && (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Learners</CardTitle>
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
                    <TableCell className="text-right">{user.average_score == null ? "—" : `${user.average_score.toFixed(1)}%`}</TableCell>
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
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Create assignment</CardTitle>
              <CardDescription>Build targeted practice or tests for all learners or selected students.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {objectiveActionError && (
                <Alert className="border-destructive/50">
                  <AlertTitle>Couldn’t create objective assignment</AlertTitle>
                  <AlertDescription>{objectiveActionError}</AlertDescription>
                </Alert>
              )}
              {objectiveActionSuccess && (
                <Alert>
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{objectiveActionSuccess}</AlertDescription>
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
                <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/25 p-3">
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

                <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/25 p-3">
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

              <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/25 p-3">
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
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border/70 bg-background p-2 space-y-1">
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

              <div className="grid gap-3 rounded-xl border border-border/70 bg-secondary/25 p-3 md:grid-cols-3">
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

              <Button onClick={createAssignment} disabled={creatingObjectiveAssignment}>
                {creatingObjectiveAssignment ? "Creating..." : "Create assignment"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Create roleplay assignment</CardTitle>
              <CardDescription>Assign MCQ Drill or Full Roleplay Practice to selected students.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {roleplayActionError && (
                <Alert className="border-destructive/50">
                  <AlertTitle>Couldn’t create roleplay assignment</AlertTitle>
                  <AlertDescription>{roleplayActionError}</AlertDescription>
                </Alert>
              )}
              {roleplayActionSuccess && (
                <Alert>
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{roleplayActionSuccess}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Roleplay</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={roleplayForm.roleplay_id}
                    onChange={(e) => setRoleplayForm((prev) => ({ ...prev, roleplay_id: e.target.value }))}
                  >
                    <option value="">Select a roleplay</option>
                    {roleplays.map((roleplay) => (
                      <option key={roleplay.id} value={roleplay.id}>
                        {roleplay.business_name} · {roleplay.event}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Assignment type</Label>
                  <RadioGroup
                    value={roleplayForm.assignment_type}
                    onValueChange={(value) => setRoleplayForm((prev) => ({ ...prev, assignment_type: value as "mcq_drill" | "full_roleplay" }))}
                    className="flex gap-4 pt-2"
                  >
                    <div className="flex items-center gap-2"><RadioGroupItem value="mcq_drill" id="rp-type-drill" /><Label htmlFor="rp-type-drill">MCQ Drill</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="full_roleplay" id="rp-type-full" /><Label htmlFor="rp-type-full">Full Roleplay Practice</Label></div>
                  </RadioGroup>
                </div>
                {roleplayForm.assignment_type === "mcq_drill" && (
                  <div className="space-y-1">
                    <Label>Drill focus</Label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={roleplayForm.drill_type}
                      onChange={(e) => setRoleplayForm((prev) => ({ ...prev, drill_type: e.target.value }))}
                    >
                      <option value="determine_objective">Determine the Objective</option>
                      <option value="identify_performance_indicators">Identify Performance Indicators</option>
                      <option value="plan_opening">Plan the Opening</option>
                      <option value="anticipate_judge_questions">Anticipate Judge Questions</option>
                      <option value="define_key_terms">Define Key Terms</option>
                      <option value="plan_closing">Plan the Closing</option>
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Due date (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={roleplayForm.due_date}
                    onChange={(e) => setRoleplayForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Title (optional)</Label>
                  <Input
                    value={roleplayForm.title}
                    onChange={(e) => setRoleplayForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Roleplay prep assignment title"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Instructions (optional)</Label>
                  <Textarea
                    value={roleplayForm.instructions}
                    onChange={(e) => setRoleplayForm((prev) => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Provide context for what students should focus on."
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/25 p-3">
                <Label className="font-medium">Assign to students</Label>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border/70 bg-background p-2 space-y-1">
                  {institutionLearners.map((user) => (
                    <div key={user.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`rp-aud-${user.id}`}
                        checked={roleplayForm.student_ids.includes(user.id)}
                        onCheckedChange={(checked) =>
                          setRoleplayForm((prev) => ({
                            ...prev,
                            student_ids: checked
                              ? [...prev.student_ids, user.id]
                              : prev.student_ids.filter((id) => id !== user.id),
                          }))
                        }
                      />
                      <Label htmlFor={`rp-aud-${user.id}`}>{user.username}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={createRoleplayAssignment} disabled={creatingRoleplayAssignment}>
                {creatingRoleplayAssignment ? "Creating..." : "Create roleplay assignment"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Assignment tracking</CardTitle>
              <CardDescription>Unified view of objective and roleplay assignments.</CardDescription>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 && roleplayAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments to track yet. Create an objective or roleplay assignment above.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Completion</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => {
                      const isOverdue = assignment.due_date ? new Date(assignment.due_date).getTime() < Date.now() && assignment.completed_count < assignment.assigned_count : false;
                      const status = assignment.completed_count >= assignment.assigned_count && assignment.assigned_count > 0 ? "Completed" : isOverdue ? "Overdue" : "Active";
                      return (
                        <TableRow key={`objective-${assignment.id}`}>
                          <TableCell className="font-medium">{assignment.title}</TableCell>
                          <TableCell>Objective Test</TableCell>
                          <TableCell>{assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}</TableCell>
                          <TableCell>{assignment.completed_count}/{assignment.assigned_count}</TableCell>
                          <TableCell><Badge variant={status === "Completed" ? "secondary" : status === "Overdue" ? "destructive" : "default"}>{status}</Badge></TableCell>
                          <TableCell>
                            <Link className="text-sm underline" href={`/admin/assignments/${assignment.id}`}>
                              View details
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {roleplayAssignments.map((assignment) => {
                      const isOverdue = assignment.due_date ? new Date(assignment.due_date).getTime() < Date.now() && assignment.completed_count < assignment.assigned_count : false;
                      const status = assignment.completed_count >= assignment.assigned_count && assignment.assigned_count > 0 ? "Completed" : isOverdue ? "Overdue" : "Active";
                      const typeLabel = assignment.assignment_type === "full_roleplay" ? "Full Roleplay Practice" : "Roleplay MCQ Drill";
                      return (
                        <TableRow key={`roleplay-${assignment.id}`}>
                          <TableCell className="font-medium">{assignment.title}</TableCell>
                          <TableCell>{typeLabel}</TableCell>
                          <TableCell>{assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}</TableCell>
                          <TableCell>{assignment.completed_count}/{assignment.assigned_count}</TableCell>
                          <TableCell><Badge variant={status === "Completed" ? "secondary" : status === "Overdue" ? "destructive" : "default"}>{status}</Badge></TableCell>
                          <TableCell>
                            <Link className="text-sm underline" href={`/admin/roleplay-assignments/${assignment.id}`}>
                              View details
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
