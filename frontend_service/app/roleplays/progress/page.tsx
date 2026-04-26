"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getJson } from "@/lib/api";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type RoleplayPracticeSummary = {
  total_attempts: number;
  roleplays_practiced_count: number;
  average_score_percent: number | null;
  best_score_percent: number | null;
  recent_attempts: Array<{ id: number; roleplay_id: number; business_name: string | null; event: string | null; score_percent: number | null; completed_at: string | null; }>;
  skill_breakdown: Array<{ skill: string; correct: number; total: number; score_percent: number; }>;
  roleplay_stats: Array<{ roleplay_id: number; business_name: string | null; attempts: number; average_score_percent: number | null; best_score_percent: number | null; latest_completed_at: string | null; }>;
};

export default function RoleplaysProgressPage() {
  const [summary, setSummary] = useState<RoleplayPracticeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<RoleplayPracticeSummary>("/api/user/roleplay-practice-summary", { cache: "no-store" })
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((err) => {
        setSummary(null);
        setError(err instanceof ApiError ? err.message : "Could not load roleplay practice progress.");
      });
  }, []);

  return (
    <PageShell>
      <PageHeader eyebrow="Roleplay Practice" title="Roleplay Progress" description="Track roleplay-specific practice attempts, weak skills, and recent activity." />
      {error ? <SectionBlock><p className="text-sm text-destructive">Could not load roleplay progress: {error}</p><Button asChild className="mt-3" variant="outline"><Link href="/roleplays/progress">Retry</Link></Button></SectionBlock> : !summary ? <SectionBlock><p className="text-sm text-muted-foreground">Loading roleplay progress...</p></SectionBlock> : summary.total_attempts === 0 ? (
        <SectionBlock>
          <p className="text-sm text-muted-foreground">You have not completed roleplay practice yet. Roleplay skill and attempt analytics will appear here after your first drill.</p>
          <Button asChild className="mt-3"><Link href="/roleplays">Browse Roleplays</Link></Button>
        </SectionBlock>
      ) : (
        <>
          <SectionBlock>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded border p-3"><p className="text-muted-foreground">Total Attempts</p><p className="text-xl font-semibold">{summary.total_attempts}</p></div>
              <div className="rounded border p-3"><p className="text-muted-foreground">Roleplays Practiced</p><p className="text-xl font-semibold">{summary.roleplays_practiced_count}</p></div>
              <div className="rounded border p-3"><p className="text-muted-foreground">Average Score</p><p className="text-xl font-semibold">{summary.average_score_percent == null ? "—" : `${summary.average_score_percent}%`}</p></div>
              <div className="rounded border p-3"><p className="text-muted-foreground">Best Score</p><p className="text-xl font-semibold">{summary.best_score_percent == null ? "—" : `${summary.best_score_percent}%`}</p></div>
            </div>
          </SectionBlock>

          <SectionBlock>
            <h2 className="section-title">Weak Skills</h2>
            <div className="space-y-2">
              {summary.skill_breakdown.length === 0 ? <p className="text-sm text-muted-foreground">No skill-level data available yet.</p> : summary.skill_breakdown.map((skill) => (
                <div key={skill.skill} className="rounded border p-2 text-sm flex items-center justify-between gap-2">
                  <span>{skill.skill}</span>
                  <span className="text-muted-foreground">{skill.correct}/{skill.total} · {skill.score_percent}%</span>
                </div>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock>
            <h2 className="section-title">Recent Roleplay Practice</h2>
            <Table><TableHeader><TableRow><TableHead>Roleplay</TableHead><TableHead>Event</TableHead><TableHead>Score</TableHead><TableHead>Completed</TableHead></TableRow></TableHeader><TableBody>
              {summary.recent_attempts.map((attempt) => (
                <TableRow key={attempt.id}><TableCell>{attempt.business_name ?? `Roleplay #${attempt.roleplay_id}`}</TableCell><TableCell>{attempt.event ?? "—"}</TableCell><TableCell>{attempt.score_percent == null ? "—" : `${attempt.score_percent}%`}</TableCell><TableCell>{attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : "—"}</TableCell></TableRow>
              ))}
            </TableBody></Table>
          </SectionBlock>

          <SectionBlock>
            <h2 className="section-title">Roleplays Practiced</h2>
            <Table><TableHeader><TableRow><TableHead>Roleplay</TableHead><TableHead>Attempts</TableHead><TableHead>Average Score</TableHead><TableHead>Best Score</TableHead><TableHead>Last Practiced</TableHead></TableRow></TableHeader><TableBody>
              {summary.roleplay_stats.map((row) => (
                <TableRow key={row.roleplay_id}><TableCell><Link className="underline" href={`/roleplays/${row.roleplay_id}`}>{row.business_name ?? `Roleplay #${row.roleplay_id}`}</Link></TableCell><TableCell>{row.attempts}</TableCell><TableCell>{row.average_score_percent == null ? "—" : `${row.average_score_percent}%`}</TableCell><TableCell>{row.best_score_percent == null ? "—" : `${row.best_score_percent}%`}</TableCell><TableCell>{row.latest_completed_at ? new Date(row.latest_completed_at).toLocaleString() : "—"}</TableCell></TableRow>
              ))}
            </TableBody></Table>
          </SectionBlock>
        </>
      )}
    </PageShell>
  );
}
