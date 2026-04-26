"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Award, Flame, Target, TrendingUp, Zap } from "lucide-react";
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
  best_streak_days: number;
  accuracy_percent: number;
  total_questions_answered: number;
  recent_scores: number[];
  daily_goal: { goal_questions: number; answered_today: number; remaining: number; is_complete: boolean };
  mastery: { category: string; percent: number; answered: number }[];
  badges: { key: string; title: string; description: string }[];
  xp_to_next_level: number;
  quizzes_completed: number;
};

type FocusArea = {
  category: string;
  lifetime_accuracy: number;
  recent_accuracy: number | null;
  trend: string;
  suggested_question_count: number;
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

type RoleplayPracticeSummary = {
  total_attempts: number;
  roleplays_practiced_count: number;
  average_score_percent: number | null;
  best_score_percent: number | null;
  recent_attempts: Array<{
    id: number;
    roleplay_id: number;
    business_name: string | null;
    event: string | null;
    score_percent: number | null;
    completed_at: string | null;
  }>;
  skill_breakdown: Array<{
    skill: string;
    correct: number;
    total: number;
    score_percent: number;
  }>;
};

export function StudentDashboardClient() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [roleplayAssignments, setRoleplayAssignments] = useState<LearnerRoleplayAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [startingAssignmentId, setStartingAssignmentId] = useState<number | null>(null);
  const [roleplayProgress, setRoleplayProgress] = useState<RoleplayPracticeSummary | null>(null);
  const [roleplayProgressError, setRoleplayProgressError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getJson<Summary>("/api/user/gamification-summary", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(setSummary)
      .catch(() => setSummary(null));
    getJson<{ focus_areas: FocusArea[] }>("/api/user/focus-areas", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((data) => setFocusAreas(data.focus_areas ?? []))
      .catch(() => setFocusAreas([]));

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

    getJson<LearnerRoleplayAssignment[]>("/api/user/roleplay-assignments", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((rows) => setRoleplayAssignments(rows ?? []))
      .catch(() => setRoleplayAssignments([]));

    getJson<RoleplayPracticeSummary>("/api/user/roleplay-practice-summary", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((data) => {
        setRoleplayProgress(data);
        setRoleplayProgressError(null);
      })
      .catch((err) => {
        setRoleplayProgress(null);
        setRoleplayProgressError(err instanceof ApiError ? err.message : "Could not load roleplay progress.");
      });
  }, [token]);

  const recentAverage = useMemo(() => {
    if (!summary?.recent_scores?.length) return null;
    return Math.round(summary.recent_scores.reduce((a, b) => a + b, 0) / summary.recent_scores.length);
  }, [summary]);

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <SectionBlock className="border-primary/20 bg-primary/5">
        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-4">
            <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
              <Zap className="mr-1 h-3.5 w-3.5" /> Focused study mode
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Stay consistent and improve one category at a time.</h2>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              You are currently level <strong>{summary.level}</strong> with <strong>{summary.xp} XP</strong>.
              Keep your daily routine to build long-term gains.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" className="w-fit">
                <Link href="/start-quiz">Objective Test Prep</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-fit">
                <Link href="/roleplays">Roleplay Prep</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Level progress</CardTitle>
              <CardDescription>{summary.xp_to_next_level} XP to next level</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={Math.max(10, Math.min(100, 100 - summary.xp_to_next_level))} className="h-2.5" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetricPill label="Quizzes" value={summary.quizzes_completed.toString()} />
                <MetricPill label="Accuracy" value={`${summary.accuracy_percent}%`} />
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionBlock>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactStat icon={<Flame className="h-4 w-4" />} label="Current streak" value={`${summary.current_streak_days} days`} note={`Best ${summary.best_streak_days} days`} />
        <CompactStat icon={<Target className="h-4 w-4" />} label="Daily goal" value={`${summary.daily_goal.answered_today}/${summary.daily_goal.goal_questions}`} note={summary.daily_goal.is_complete ? "Goal complete" : `${summary.daily_goal.remaining} remaining`} />
        <CompactStat icon={<TrendingUp className="h-4 w-4" />} label="Recent average" value={`${recentAverage ?? "--"}%`} note="Latest attempts" />
        <CompactStat icon={<Award className="h-4 w-4" />} label="Questions answered" value={summary.total_questions_answered.toString()} note="All time" />
      </section>

      <SectionBlock>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="section-title">Roleplay Prep · Roleplay Progress</h3>
            <p className="section-subtitle">Track your latest roleplay practice performance.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/roleplays/progress">View full progress</Link>
          </Button>
        </div>
        {roleplayProgressError ? (
          <p className="text-sm text-destructive">{roleplayProgressError}</p>
        ) : !roleplayProgress ? (
          <p className="text-sm text-muted-foreground">Loading roleplay progress...</p>
        ) : roleplayProgress.total_attempts === 0 ? (
          <p className="text-sm text-muted-foreground">You have not completed any roleplay practice yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricPill label="Total Attempts" value={String(roleplayProgress.total_attempts)} />
              <MetricPill label="Average Score" value={roleplayProgress.average_score_percent == null ? "—" : `${roleplayProgress.average_score_percent}%`} />
              <MetricPill label="Roleplays Practiced" value={String(roleplayProgress.roleplays_practiced_count)} />
              <MetricPill
                label="Weakest Skill"
                value={roleplayProgress.skill_breakdown[0]?.skill ?? "—"}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Recent Roleplay Practice</p>
              {roleplayProgress.recent_attempts.slice(0, 3).map((attempt) => (
                <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span>{attempt.business_name ?? `Roleplay #${attempt.roleplay_id}`}</span>
                  <span className="text-muted-foreground">
                    {attempt.score_percent == null ? "—" : `${attempt.score_percent}%`}
                    {attempt.completed_at ? ` · ${new Date(attempt.completed_at).toLocaleString()}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBlock>

      <SectionBlock>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="section-title">Roleplay Prep · Assigned Roleplays</h3>
            <p className="section-subtitle">MCQ Drill and Full Roleplay Practice assignments from your advisor.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/roleplays">Browse Roleplays</Link>
          </Button>
        </div>
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading assignments...</p>
        ) : assignmentError ? (
          <p className="text-sm text-destructive">{assignmentError}</p>
        ) : assignments.length === 0 && roleplayAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {roleplayAssignments.map((assignment) => (
              <div key={`roleplay-${assignment.id}`} className="rounded-xl border border-border/70 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{assignment.title}</p>
                  <Badge variant={assignment.is_completed ? "secondary" : "default"}>
                    {assignment.is_completed ? "Completed" : assignment.assignment_type === "full_roleplay" ? "Full Roleplay Practice" : "MCQ Drill"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {assignment.roleplay?.business_name} · {assignment.roleplay?.event} · Advisor: {assignment.advisor ?? "Advisor"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Type: {assignment.assignment_type === "full_roleplay" ? "Full Roleplay Practice" : `MCQ Drill${assignment.drill_label ? ` · ${assignment.drill_label}` : ""}`}
                </p>
                {assignment.instructions && <p className="mt-1 text-sm text-muted-foreground">{assignment.instructions}</p>}
                <div className="mt-2 text-xs text-muted-foreground">
                  Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}
                </div>
                <div className="mt-3">
                  <Button asChild size="sm" variant={assignment.is_completed ? "outline" : "default"}>
                    <Link href={`/roleplays/${assignment.roleplay_id}?roleplayAssignmentId=${assignment.id}`}>
                      {assignment.is_completed ? "Review Roleplay Prep" : assignment.assignment_type === "full_roleplay" ? "Open Full Roleplay Practice" : "Start MCQ Drill"}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionBlock>

      <SectionBlock>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="section-title">Objective Test Prep · Assigned Objective Tests</h3>
            <p className="section-subtitle">Objective test assignments from your instructor.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/start-quiz">Start Objective Test Prep</Link>
          </Button>
        </div>
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading assignments...</p>
        ) : assignmentError ? (
          <p className="text-sm text-destructive">{assignmentError}</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No objective test assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-border/70 bg-secondary/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{assignment.title}</p>
                  <Badge variant={assignment.is_completed ? "secondary" : "default"}>
                    {assignment.is_completed ? "Completed" : "Assigned"}
                  </Badge>
                </div>
                {assignment.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{assignment.mode.toUpperCase()} · {assignment.question_count} questions</span>
                  <span>Shuffle: {assignment.shuffle_questions ? "On" : "Off"}</span>
                  <span>Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={startingAssignmentId === assignment.id || (assignment.is_completed && !assignment.in_progress_attempt_id)}
                    onClick={async () => {
                      if (!token) return;
                      if (assignment.in_progress_attempt_id) {
                        window.location.href = `/practice?attemptId=${assignment.in_progress_attempt_id}`;
                        return;
                      }
                      setStartingAssignmentId(assignment.id);
                      try {
                        const response = await postJson<{ attemptId: number }>("/api/quiz/start-assignment", {
                          assignmentId: assignment.id,
                        }, {
                          headers: { Authorization: `Bearer ${token}` },
                        });
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
                        : assignment.is_completed
                          ? "Completed"
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
      </SectionBlock>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <SectionBlock>
          <div className="mb-4">
            <h3 className="section-title">Recommended focus</h3>
            <p className="section-subtitle">These are the best categories to practice next.</p>
          </div>
          <div className="space-y-2">
            {focusAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Complete a few quizzes to unlock personalized recommendations.</p>
            ) : (
              focusAreas.slice(0, 4).map((item, index) => (
                <div key={item.category} className="rounded-xl border border-border/70 bg-secondary/35 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <p className="font-medium">{index + 1}. {item.category}</p>
                    <Badge variant="secondary">{item.lifetime_accuracy}% mastery</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Trend: {item.trend}. Suggested drill: {item.suggested_question_count} questions.</p>
                </div>
              ))
            )}
          </div>
        </SectionBlock>

        <SectionBlock>
          <h3 className="section-title">Achievements</h3>
          <p className="section-subtitle mb-4">Milestones from consistency and improvement.</p>
          <div className="space-y-2">
            {(summary.badges || []).slice(0, 4).map((badge) => (
              <div key={badge.key} className="rounded-lg border border-border/70 bg-secondary/35 p-3">
                <p className="text-sm font-medium">{badge.title}</p>
                <p className="text-xs text-muted-foreground">{badge.description}</p>
              </div>
            ))}
          </div>
        </SectionBlock>
      </section>

      <SectionBlock>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="section-title">Topic mastery</h3>
            <p className="section-subtitle">Raise categories below 70% first.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/progress">View full progress</Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(summary.mastery || []).slice(0, 6).map((item) => (
            <div key={item.category} className="rounded-xl border border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{item.category}</span>
                <span className="text-muted-foreground">{item.percent}%</span>
              </div>
              <Progress value={item.percent} className="h-2.5" />
            </div>
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}

function CompactStat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground">{icon}</span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
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
