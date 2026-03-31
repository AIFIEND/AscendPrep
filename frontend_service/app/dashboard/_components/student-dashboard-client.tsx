"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Award, Flame, Target, TrendingUp, Zap } from "lucide-react";
import { getJson } from "@/lib/api";
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
    })
      .then(setSummary)
      .catch(() => setSummary(null));
    getJson<{ focus_areas: FocusArea[] }>("/api/user/focus-areas", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((data) => setFocusAreas(data.focus_areas ?? []))
      .catch(() => setFocusAreas([]));
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
              <Button asChild size="lg">
                <Link href="/start-quiz?mode=targeted">Start targeted practice</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tests-taken">Resume latest session</Link>
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

      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <SectionBlock>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="section-title">Recommended focus</h3>
              <p className="section-subtitle">These are the best categories to practice next.</p>
            </div>
            <Button asChild size="sm">
              <Link href="/start-quiz?mode=targeted">Start</Link>
            </Button>
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
