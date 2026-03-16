import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { TestsTakenClient } from "./_components/tests-taken-client";
import { AuthRequiredState } from "@/components/auth-required-state";
import { getJson } from '@/lib/api';


// This is the type for data coming directly from your Flask API
type ApiTest = {
  id: number;
  test_name: string;
  score: number;
  timestamp: string;
  total_questions: number;
  is_complete: boolean;
  results_by_category?: Record<string, { correct: number; total: number }> | null;
};

// This is the type used by your frontend components
type Test = {
  _id: string;
  testName: string;
  score: number;
  totalQuestions: number;
  completedAt: string;
  is_complete: boolean;
};

// This function now runs on the server and includes the session check
async function getTestsTaken(session: any): Promise<Test[]> {
  if (!session?.user?.backendToken) {
    console.log("No session or backend token found.");
    return [];
  }

  try {
    const data = await getJson<ApiTest[]>("/api/user/attempts", {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
      cache: "no-store",
    });

    return (data || []).map((t) => {
      let displayScore = t.score;
      let displayTotalQuestions = t.total_questions;

      if (t.is_complete && t.results_by_category) {
        const categoryRows = Object.values(t.results_by_category);
        const answeredTotal = categoryRows.reduce((sum, row) => sum + (row?.total || 0), 0);
        const correctTotal = categoryRows.reduce((sum, row) => sum + (row?.correct || 0), 0);

        if (answeredTotal > 0) {
          displayTotalQuestions = answeredTotal;
          displayScore = Math.round((correctTotal / answeredTotal) * 100);
        }
      }

      return {
        _id: String(t.id),
        testName: t.test_name,
        score: displayScore,
        totalQuestions: displayTotalQuestions,
        completedAt: t.timestamp,
        is_complete: t.is_complete,
      };
    });
  } catch (error) {
    console.error("Could not fetch test attempts:", error);
    return [];
  }
}


// The main page component now handles the auth check
export default async function TestsTakenPage() {
  const session = await getServerSession(authOptions);

  // If there's no session, show the access denied message
  if (!session) {
    return <AuthRequiredState description="You need to be logged in to view your test history." />;
  }

  // If the user is logged in, fetch their tests and render the client component
  const tests = await getTestsTaken(session);
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">My Tests</h1>
      <TestsTakenClient tests={tests} />
    </div>
  );
}