// app/progress/page.tsx
// NEW FILE: Server component to fetch and display the user's progress page.

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { ProgressClient } from "./_components/progress-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getJson } from '@/lib/api';


// Types for the data from our /api/user/progress endpoint (list shape expected by ProgressClient)
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


async function getProgressData(session: any): Promise<ProgressData | null> {
  if (!session?.user?.backendToken) {
    console.log("No session or backend token found.");
    return null;
  }

  try {
    const raw = await getJson<ProgressData>("/api/user/progress", {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
      cache: "no-store",
    });

    // Optional: sort by time ascending so charts are stable
    const sorted = [...(raw.progress_data || [])].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    return {
      progress_data: sorted,
      overall_performance: raw.overall_performance || {},
    };
  } catch (error) {
    console.error("Could not fetch progress data:", error);
    return null;
  }
}



export default async function ProgressPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>You need to be logged in to view your progress.</p>
            <Button asChild>
              <Link href="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressData = await getProgressData(session);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">My Progress</h1>
      {progressData ? (
  <ProgressClient data={progressData} />

      ) : (
        <Card>
            <CardHeader>
                <CardTitle>No Data Yet</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Could not load your progress data. You might need to complete a quiz first to see your stats.</p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}