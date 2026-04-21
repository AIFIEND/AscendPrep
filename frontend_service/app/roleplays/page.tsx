"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getJson } from "@/lib/api";
import type { Roleplay } from "@/lib/roleplays";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RoleplaysPage() {
  const [data, setData] = useState<Roleplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
        eyebrow="Roleplay Library"
        title="Practice real DECA roleplay scenarios"
        description="Browse by business context, event, and difficulty. Open any roleplay to prepare with structured coaching content."
      />

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
