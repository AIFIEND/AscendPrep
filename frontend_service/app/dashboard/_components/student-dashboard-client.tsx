"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { ApiError, getJson, postJson } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SectionBlock } from "@/components/ui/page-shell";

type Summary = {
  xp: number;
  level: number;
  current_streak_days: number;
  recent_scores: number[];
  daily_goal: { goal_questions: number; answered_today: number; remaining: number; is_complete: boolean };
  sessions_today: number;
  xp_to_next_level: number;
};

type LearnerAssignment = {
  id: number;
  title: string;
  description: string | null;
  mode: "practice" | "test";
  question_count: number;
  categories: string[];
  difficulties: string[];
  due_date: string | null;
  shuffle_questions: boolean;
  is_completed: boolean;
  latest_attempt_id: number | null;
  latest_score: number | null;
  in_progress_attempt_id: number | null;
};

type LearnerRoleplayAssignment = {
  id: number;
  title: string;
  instructions: string | null;
  due_date: string | null;
  assignment_type: "mcq_drill" | "full_roleplay";
  drill_label: string | null;
  roleplay_id: number;
  roleplay: { business_name: string; event: string; difficulty: string; task_type: string } | null;
  advisor: string | null;
  is_completed: boolean;
};

type LevelTheme = {
  badgeClassName: string;
  cardClassName: string;
  xpPanelClassName: string;
  progressTrackClassName: string;
  progressIndicatorClassName: string;
};

function getLevelTheme(level: number): LevelTheme {
  if (level >= 8) {
    return {
      badgeClassName:
        "border border-amber-400/60 bg-gradient-to-r from-amber-500/25 via-fuchsia-500/20 to-cyan-400/25 text-amber-950 dark:text-amber-100",
      cardClassName: "border-amber-400/35 bg-gradient-to-br from-amber-500/10 via-background to-fuchsia-500/10",
      xpPanelClassName: "border-amber-400/45 bg-gradient-to-r from-amber-400/15 via-fuchsia-500/15 to-cyan-400/15",
      progressTrackClassName: "bg-amber-100/80 dark:bg-amber-950/50",
      progressIndicatorClassName: "bg-gradient-to-r from-amber-500 via-fuchsia-500 to-cyan-400",
    };
  }

  if (level >= 5) {
    return {
      badgeClassName:
        "border border-violet-400/60 bg-violet-500/20 text-violet-900 dark:text-violet-100",
      cardClassName: "border-violet-400/30 bg-gradient-to-br from-violet-500/10 via-background to-fuchsia-500/10",
      xpPanelClassName: "border-violet-400/35 bg-gradient-to-r from-violet-500/15 via-fuchsia-500/15 to-indigo-500/10",
      progressTrackClassName: "bg-violet-100/85 dark:bg-violet-950/55",
      progressIndicatorClassName: "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500",
    };
  }

  if (level >= 3) {
    return {
      badgeClassName:
        "border border-emerald-400/50 bg-emerald-500/20 text-emerald-900 dark:text-emerald-100",
      cardClassName: "border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 via-background to-teal-500/10",
      xpPanelClassName: "border-emerald-400/35 bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-cyan-500/10",
      progressTrackClassName: "bg-emerald-100/85 dark:bg-emerald-950/55",
      progressIndicatorClassName: "bg-gradient-to-r from-emerald-500 to-teal-500",
    };
  }

  return {
    badgeClassName: "border border-blue-400/45 bg-blue-500/15 text-blue-900 dark:text-blue-100",
    cardClassName: "border-blue-400/30 bg-gradient-to-br from-blue-500/10 via-background to-cyan-500/10",
    xpPanelClassName: "border-blue-400/30 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-sky-500/10",
    progressTrackClassName: "bg-blue-100/85 dark:bg-blue-950/55",
    progressIndicatorClassName: "bg-gradient-to-r from-blue-500 to-cyan-500",
  };
}

export function StudentDashboardClient() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const accountType = session?.user?.account_type;
  const isInstitutionStudent = !(accountType === "individual" || (!accountType && !session?.user?.institution_id));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [roleplayAssignments, setRoleplayAssignments] = useState<LearnerRoleplayAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [startingAssignmentId, setStartingAssignmentId] = useState<number | null>(null);
  const [roleplayAssignmentsLoading, setRoleplayAssignmentsLoading] = useState(true);
  const [roleplayAssignmentError, setRoleplayAssignmentError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getJson<Summary>("/api/user/gamification-summary", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(setSummary)
      .catch(() => setSummary(null));

    if (isInstitutionStudent) {
      setAssignmentsLoading(true);
      getJson<LearnerAssignment[]>("/api/user/assignments", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((rows) => {
          setAssignments(rows ?? []);
          setAssignmentError(null);
        })
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : "Could not load assignments.";
          setAssignmentError(message);
          setAssignments([]);
        })
        .finally(() => setAssignmentsLoading(false));

      setRoleplayAssignmentsLoading(true);
      getJson<LearnerRoleplayAssignment[]>("/api/user/roleplay-assignments", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((rows) => {
          setRoleplayAssignments(rows ?? []);
          setRoleplayAssignmentError(null);
        })
        .catch((err) => {
          setRoleplayAssignments([]);
          setRoleplayAssignmentError(err instanceof ApiError ? err.message : "Could not load roleplay assignments.");
        })
        .finally(() => setRoleplayAssignmentsLoading(false));
      return;
    }

    setAssignments([]);
    setRoleplayAssignments([]);
    setAssignmentError(null);
    setRoleplayAssignmentError(null);
    setAssignmentsLoading(false);
    setRoleplayAssignmentsLoading(false);
  }, [isInstitutionStudent, token]);

  const inProgressObjectiveAssignment = useMemo(
    () => assignments.find((assignment) => Boolean(assignment.in_progress_attempt_id)),
    [assignments],
  );
  const actionableObjectiveAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          !assignment.is_completed && assignment.id !== inProgressObjectiveAssignment?.id,
      ),
    [assignments, inProgressObjectiveAssignment?.id],
  );
  const actionableRoleplayAssignments = useMemo(
    () => roleplayAssignments.filter((assignment) => !assignment.is_completed),
    [roleplayAssignments],
  );
  const visibleObjectiveAssignments = actionableObjectiveAssignments.slice(0, 3);
  const visibleRoleplayAssignments = actionableRoleplayAssignments.slice(0, 3);
  const showObjectiveAssignments = assignmentsLoading || Boolean(assignmentError) || visibleObjectiveAssignments.length > 0;
  const showRoleplayAssignments =
    roleplayAssignmentsLoading || Boolean(roleplayAssignmentError) || visibleRoleplayAssignments.length > 0;
  const showAssignedWorkSection = isInstitutionStudent && (showObjectiveAssignments || showRoleplayAssignments);
  const levelTheme = getLevelTheme(summary?.level ?? 1);

  if (!summary) return <p className="text-sm text-muted-foreground">Loading your dashboard...</p>;

  return (
    <div className="space-y-6">
      <SectionBlock className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-violet-500/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400" />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge className={`w-fit ${levelTheme.badgeClassName} hover:opacity-95`}>
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Level {summary.level}
              </Badge>
              <Badge variant="secondary" className="w-fit">
                <Flame className="mr-1 h-3.5 w-3.5 text-orange-500" /> {summary.current_streak_days} day streak
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What should I do right now?</h2>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              Keep momentum with one focused prep session. Start exam questions or jump into a roleplay scenario.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" className="w-fit">
                <Link href="/start-quiz">Exam Prep</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-fit">
                <Link href="/roleplays">Roleplay Prep</Link>
              </Button>
            </div>
          </div>

          <Card className={levelTheme.cardClassName}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">XP and daily mission</CardTitle>
              <CardDescription>{summary.xp_to_next_level} XP to reach level {summary.level + 1}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`rounded-xl border p-4 ${levelTheme.xpPanelClassName}`}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total XP</p>
                <p className="text-3xl font-semibold tracking-tight">{summary.xp}</p>
                <Progress
                  value={Math.max(10, Math.min(100, 100 - summary.xp_to_next_level))}
                  className={`mt-3 h-2.5 ${levelTheme.progressTrackClassName}`}
                  indicatorClassName={levelTheme.progressIndicatorClassName}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetricPill
                  label="Daily goal"
                  value={`${summary.daily_goal.answered_today}/${summary.daily_goal.goal_questions}`}
                />
                <MetricPill
                  label="Sessions today"
                  value={`${summary.sessions_today} sessions today`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Exam prep details in{" "}
                <Link href="/progress" className="font-medium text-primary underline-offset-4 hover:underline">
                  Progress
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </SectionBlock>

      {inProgressObjectiveAssignment && (
        <SectionBlock>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/20 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Continue</p>
              <p className="font-medium">{inProgressObjectiveAssignment.title}</p>
            </div>
            <Button asChild size="sm">
              <Link href={`/practice?attemptId=${inProgressObjectiveAssignment.in_progress_attempt_id}`}>
                Resume exam prep assignment <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </SectionBlock>
      )}

      {showAssignedWorkSection && (
        <SectionBlock>
          <div className="mb-4">
            <h3 className="section-title">Assigned work</h3>
            <p className="section-subtitle">Complete assigned exam prep work and roleplay practice.</p>
          </div>

          <div className="space-y-5">
            {showObjectiveAssignments && (
              <div>
                <h4 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">Assigned exam prep</h4>
                {assignmentsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading exam prep assignments...</p>
                ) : assignmentError ? (
                  <p className="text-sm text-destructive">{assignmentError}</p>
                ) : (
                  <div className="space-y-3">
                    {visibleObjectiveAssignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-xl border border-border/70 bg-secondary/25 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{assignment.title}</p>
                          <Badge variant="default">Assigned</Badge>
                        </div>
                        {assignment.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{assignment.mode.toUpperCase()} · {assignment.question_count} questions</span>
                          <span>Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={startingAssignmentId === assignment.id}
                            onClick={async () => {
                              if (!token) return;
                              if (assignment.in_progress_attempt_id) {
                                window.location.href = `/practice?attemptId=${assignment.in_progress_attempt_id}`;
                                return;
                              }
                              setStartingAssignmentId(assignment.id);
                              try {
                                const response = await postJson<{ attemptId: number }>(
                                  "/api/quiz/start-assignment",
                                  {
                                    assignmentId: assignment.id,
                                  },
                                  {
                                    headers: { Authorization: `Bearer ${token}` },
                                  },
                                );
                                window.location.href = `/practice?attemptId=${response.attemptId}`;
                              } catch (err) {
                                setAssignmentError(err instanceof ApiError ? err.message : "Could not open assignment.");
                              } finally {
                                setStartingAssignmentId(null);
                              }
                            }}
                          >
                            {startingAssignmentId === assignment.id
                              ? "Starting..."
                              : assignment.in_progress_attempt_id
                                ? "Resume assignment"
                                : "Start assignment"}
                          </Button>
                          {assignment.latest_attempt_id && (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/results?attemptId=${assignment.latest_attempt_id}`}>View latest result</Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showRoleplayAssignments && (
              <div>
                <h4 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">Assigned roleplays</h4>
                {roleplayAssignmentsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading roleplay assignments...</p>
                ) : roleplayAssignmentError ? (
                  <p className="text-sm text-destructive">{roleplayAssignmentError}</p>
                ) : (
                  <div className="space-y-3">
                    {visibleRoleplayAssignments.map((assignment) => (
                      <div key={`roleplay-${assignment.id}`} className="rounded-xl border border-border/70 bg-primary/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{assignment.title}</p>
                          <Badge variant="default">
                            {assignment.assignment_type === "full_roleplay" ? "Full Roleplay Practice" : "MCQ Drill"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {assignment.roleplay?.business_name} · {assignment.roleplay?.event}
                        </p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}
                        </div>
                        <div className="mt-3">
                          <Button asChild size="sm">
                            <Link href={`/roleplays/${assignment.roleplay_id}?roleplayAssignmentId=${assignment.id}`}>
                              {assignment.assignment_type === "full_roleplay" ? "Open full roleplay" : "Start MCQ drill"}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionBlock>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
