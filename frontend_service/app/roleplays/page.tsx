"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";
import { getJson } from "@/lib/api";
import type { Roleplay } from "@/lib/roleplays";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type LearnerRoleplayAssignment = {
  id: number;
  title: string;
  assignment_type: "mcq_drill" | "full_roleplay";
  roleplay_id: number;
  is_completed: boolean;
};

export default function RoleplaysPage() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const accountType = session?.user?.account_type;
  const isInstitutionStudent = !(accountType === "individual" || (!accountType && !session?.user?.institution_id));

  const [data, setData] = useState<Roleplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [assignedRoleplay, setAssignedRoleplay] = useState<LearnerRoleplayAssignment | null>(null);

  useEffect(() => {
    setIsLoading(true);
    getJson<Roleplay[]>("/api/roleplays", { cache: "no-store" })
      .then((rows) => {
        setData(rows ?? []);
        setError(null);
      })
      .catch(() => setError("Could not load roleplays. Please refresh and try again."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!token || !isInstitutionStudent) {
      setAssignedRoleplay(null);
      return;
    }

    getJson<LearnerRoleplayAssignment[]>("/api/user/roleplay-assignments", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((rows) => {
        const openAssignment = (rows ?? []).find((assignment) => !assignment.is_completed);
        setAssignedRoleplay(openAssignment ?? null);
      })
      .catch(() => setAssignedRoleplay(null));
  }, [isInstitutionStudent, token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) =>
      [item.business_name, item.event, item.industry, item.task_type, item.difficulty]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [data, query]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Roleplay Prep"
        title="Browse and practice DECA roleplays"
        description="Use the roleplay library, run MCQ drills, and track roleplay-specific progress."
      />

      <SectionBlock>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <p className="text-sm font-semibold">Browse roleplay library</p>
            <p className="mt-1 text-xs text-muted-foreground">Search by business context, event, or difficulty.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <p className="text-sm font-semibold">Start roleplay MCQ drill</p>
            <p className="mt-3 text-xs text-muted-foreground">Choose a roleplay below to start a drill.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <p className="text-sm font-semibold">View roleplay progress</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/roleplays/progress">Open progress</Link>
            </Button>
          </div>
          {assignedRoleplay && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Assigned roleplay work</p>
              <p className="mt-1 text-xs text-muted-foreground">{assignedRoleplay.title}</p>
              <Button asChild size="sm" className="mt-3">
                <Link href={`/roleplays/${assignedRoleplay.roleplay_id}?roleplayAssignmentId=${assignedRoleplay.id}`}>
                  {assignedRoleplay.assignment_type === "full_roleplay" ? "Open assignment" : "Open MCQ assignment"}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </SectionBlock>

      <SectionBlock>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business, event, industry, task type..."
              className="pl-9"
            />
          </div>
          <Badge variant="secondary">{filtered.length} roleplays</Badge>
        </div>
      </SectionBlock>

      <SectionBlock>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading roleplay library...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roleplays match your search yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((roleplay) => (
              <article key={roleplay.id} className="rounded-xl border border-border/70 bg-secondary/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{roleplay.business_name}</h2>
                  <Badge>{roleplay.event}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{roleplay.industry}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{roleplay.task_type}</Badge>
                  <Badge variant="secondary">{roleplay.difficulty}</Badge>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{roleplay.objective}</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href={`/roleplays/${roleplay.id}`}>Open roleplay prep</Link>
                </Button>
              </article>
            ))}
          </div>
        )}
      </SectionBlock>
    </PageShell>
  );
}
