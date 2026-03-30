"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getJson } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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

export function StudentDashboardClient() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);

  useEffect(() => {
    if (!token) return;
    getJson<Summary>("/api/user/gamification-summary", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).then(setSummary).catch(() => setSummary(null));
    getJson<{ focus_areas: FocusArea[] }>("/api/user/focus-areas", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).then((data) => setFocusAreas(data.focus_areas ?? [])).catch(() => setFocusAreas([]));
  }, [token]);

  const recentAverage = useMemo(() => {
    if (!summary?.recent_scores?.length) return null;
    return Math.round(summary.recent_scores.reduce((a, b) => a + b, 0) / summary.recent_scores.length);
  }, [summary]);

  if (!summary) return null;

  const goalPct = summary.daily_goal.goal_questions > 0
    ? Math.min(100, Math.round((summary.daily_goal.answered_today / summary.daily_goal.goal_questions) * 100))
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader><CardTitle>Level {summary.level}</CardTitle><CardDescription>{summary.xp} XP total</CardDescription></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{summary.xp_to_next_level} XP to next level.</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{summary.current_streak_days}-day streak</CardTitle><CardDescription>Best: {summary.best_streak_days} days</CardDescription></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Complete at least one quiz daily to maintain it.</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daily goal</CardTitle><CardDescription>{summary.daily_goal.answered_today}/{summary.daily_goal.goal_questions} questions today</CardDescription></CardHeader>
        <CardContent className="space-y-2"><Progress value={goalPct} /><p className="text-xs text-muted-foreground">{summary.daily_goal.is_complete ? "Goal complete" : `${summary.daily_goal.remaining} to go`}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent performance</CardTitle><CardDescription>{recentAverage ?? "--"}% avg over latest attempts</CardDescription></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Overall accuracy: {summary.accuracy_percent}%. Quizzes completed: {summary.quizzes_completed}.</CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Focus Areas</CardTitle><CardDescription>Smart weakness targeting from your quiz history.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {focusAreas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Complete a few quizzes to unlock targeted recommendations.</p>
          ) : (
            focusAreas.map((item) => (
              <div key={item.category} className="rounded border p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.category}</span>
                  <span>{item.lifetime_accuracy}% mastery</span>
                </div>
                <p className="text-xs text-muted-foreground">Trend: {item.trend}. Suggested practice: {item.suggested_question_count} questions.</p>
              </div>
            ))
          )}
          <Button asChild size="sm">
            <Link href="/start-quiz?mode=targeted">Start targeted quiz</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Topic mastery</CardTitle><CardDescription>Focus next on categories below 70%.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(summary.mastery || []).slice(0, 5).map((item) => (
            <div key={item.category}>
              <div className="flex justify-between text-sm"><span>{item.category}</span><span>{item.percent}%</span></div>
              <Progress value={item.percent} />
            </div>
          ))}
          <Button asChild size="sm" variant="outline"><Link href="/progress">Open full progress</Link></Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Achievements</CardTitle><CardDescription>Meaningful milestones tied to consistency and mastery.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(summary.badges || []).slice(0, 4).map((badge) => (
            <div key={badge.key} className="rounded border p-2">
              <p className="text-sm font-medium">{badge.title}</p>
              <p className="text-xs text-muted-foreground">{badge.description}</p>
            </div>
          ))}
          {!summary.badges?.length && <p className="text-sm text-muted-foreground">Complete your first session to unlock achievements.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
