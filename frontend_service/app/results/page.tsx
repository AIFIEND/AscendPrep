"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, getJson } from "@/lib/api";
import { CheckCircle, Home, RotateCcw, XCircle } from "lucide-react";
import { Question } from "@/types";

type AttemptResultResponse = {
  attempt: {
    id: number;
    score: number | null;
    total_questions: number;
    answers: Record<string, string>;
  };
  questions: Question[];
};

type AttemptSummary = {
  id: number;
  score: number | null;
  total_questions: number;
  answers: Record<string, string>;
  is_complete: boolean;
};

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [data, setData] = useState<AttemptResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const attemptId = searchParams.get("attemptId");

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (!session?.user?.backendToken) {
      setError("You must be logged in to view quiz results.");
      setLoading(false);
      return;
    }

    const loadResults = async () => {
      setLoading(true);
      setError(null);

      try {
        const effectiveAttemptId = attemptId || await (async () => {
          const attempts = await getJson<AttemptSummary[]>("/api/user/attempts", {
            headers: { Authorization: `Bearer ${session.user.backendToken}` },
            cache: "no-store",
          });
          const latestComplete = attempts.find((a) => a.is_complete);
          return latestComplete ? String(latestComplete.id) : null;
        })();

        if (!effectiveAttemptId) {
          setError("No completed quiz results yet.");
          setData(null);
          return;
        }

        const resp = await getJson<AttemptResultResponse>(`/api/quiz/attempt/${effectiveAttemptId}/results`, {
          headers: { Authorization: `Bearer ${session.user.backendToken}` },
          cache: "no-store",
        });

        setData(resp);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Could not load quiz results.";
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [attemptId, session?.user?.backendToken, status]);

  const reviewedQuestions = useMemo(() => data?.questions || [], [data]);

  const correctAnswers = useMemo(() => {
    if (!data) return 0;
    return reviewedQuestions.reduce((acc, question) => {
      const userAnswer = data.attempt.answers[String(question.id)];
      return acc + (userAnswer === question.correctAnswer ? 1 : 0);
    }, 0);
  }, [data, reviewedQuestions]);

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading results...</div>;
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>Results unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error || "No results found."}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild>
                <Link href="/start-quiz">Start New Quiz</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/tests-taken">View Sessions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const effectiveTotalQuestions = data.attempt.total_questions || reviewedQuestions.length;
  const answeredCount = Object.keys(data.attempt.answers || {}).length;
  const incorrectCount = Math.max(answeredCount - correctAnswers, 0);
  const unansweredCount = Math.max(effectiveTotalQuestions - answeredCount, 0);
  const score = data.attempt.score ?? 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Card className="mb-8">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Quiz Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="w-48 h-48 relative flex items-center justify-center rounded-full border-8 border-primary/20">
                <div className="text-4xl font-bold">{score}%</div>
              </div>

                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                <div className="flex flex-col items-center p-4 bg-green-50 rounded-lg dark:bg-green-900/20">
                  <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                  <div className="text-xl font-bold">{correctAnswers}</div>
                  <div className="text-sm text-gray-500">Correct</div>
                </div>
                <div className="flex flex-col items-center p-4 bg-red-50 rounded-lg dark:bg-red-900/20">
                  <XCircle className="h-8 w-8 text-red-500 mb-2" />
                  <div className="text-xl font-bold">{incorrectCount}</div>
                  <div className="text-sm text-gray-500">Incorrect</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {effectiveTotalQuestions} · Answered: {answeredCount} · Unanswered: {unansweredCount}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <Link href="/" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full bg-transparent">
                    <Home className="h-4 w-4 mr-2" />
                    Home
                  </Button>
                </Link>
                <Link href="/start-quiz" className="w-full sm:w-auto">
                  <Button className="w-full">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Practice Again
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Reviewed Questions</h2>
          {reviewedQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">This attempt has no answer data to review.</p>
          ) : (
            reviewedQuestions.map((question, index) => {
              const userAnswer = data.attempt.answers[String(question.id)];
              const isCorrect = userAnswer === question.correctAnswer;

              return (
                <Card key={question.id} className="border-l-4 border-l-primary">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                      <div className={`flex items-center ${isCorrect ? "text-green-500" : "text-red-500"}`}>
                        {isCorrect ? <CheckCircle className="h-5 w-5 mr-1" /> : <XCircle className="h-5 w-5 mr-1" />}
                        <span>{isCorrect ? "Correct" : "Incorrect"}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="font-medium">{question.question}</p>
                    <p className="text-sm">Your answer: <span className="font-semibold">{userAnswer || "No answer"}</span></p>
                    <p className="text-sm">Correct answer: <span className="font-semibold">{question.correctAnswer}</span></p>
                    <p className="text-sm text-muted-foreground">{question.explanation}</p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
