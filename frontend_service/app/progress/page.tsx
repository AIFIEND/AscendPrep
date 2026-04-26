import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { ProgressClient } from "./_components/progress-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthRequiredState } from "@/components/auth-required-state";
import { ApiError, getJson } from "@/lib/api";

type ProgressRecord = {
  timestamp: string;
  test_name: string;
  category: string;
  score: number;
};

type OverallPerformance = {
  correct: number;
  total: number;
};

export type ProgressData = {
  progress_data: ProgressRecord[];
  overall_performance: Record<string, OverallPerformance>;
};

async function getProgressData(session: any): Promise<{ data: ProgressData | null; error: string | null }> {
  if (!session?.user?.backendToken) {
    return { data: null, error: "You need to be logged in to view progress." };
  }

  try {
    const raw = await getJson<ProgressData>("/api/user/progress", {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
      cache: "no-store",
    });

    const sorted = [...(raw.progress_data || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      data: {
        progress_data: sorted,
        overall_performance: raw.overall_performance || {},
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not load exam prep progress.";
    return { data: null, error: message };
  }
}

export default async function ProgressPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="You need to be logged in to view your progress." />;
  }

  const { data, error } = await getProgressData(session);

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-2 text-3xl font-bold">Exam Prep Progress</h1>
      <p className="mb-6 text-sm text-muted-foreground">Track exam prep performance trends and category mastery over time.</p>

      {data && data.progress_data.length > 0 ? (
        <ProgressClient data={data} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{error ? "Progress unavailable" : "No exam practice data yet"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {error
                ? error
                : "Your exam prep charts and category mastery will appear here after you complete at least one practice session."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/start-quiz">Start exam practice</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/progress">Retry</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
