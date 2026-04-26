"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  timestamp?: string;
};

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [data, setData] = useState<AttemptResultResponse | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
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
        const fetchedAttempts = await getJson<AttemptSummary[]>("/api/user/attempts", {
          headers: { Authorization: `Bearer ${session.user.backendToken}` },
          cache: "no-store",
        });
        setAttempts(fetchedAttempts ?? []);

        if (!attemptId) {
          setData(null);
          return;
        }

        const resp = await getJson<AttemptResultResponse>(`/api/quiz/attempt/${attemptId}/results`, {
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

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Results unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/start-quiz">Start New Practice</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/results">Retry</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!attemptId) {
    const inProgress = attempts.filter((a) => !a.is_complete);
    const completed = attempts.filter((a) => a.is_complete);
    const orderedAttempts = [...inProgress, ...completed];

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Results</h1>
            <p className="mt-1 text-sm text-muted-foreground">Review completed attempts or resume in-progress objective practice sessions.</p>
          </div>

          {orderedAttempts.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No results yet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Once you start objective practice, your completed and in-progress sessions will appear here.</p>
                <Button asChild>
                  <Link href="/start-quiz">Start New Practice</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedAttempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell className="font-medium">Objective Practice #{attempt.id}</TableCell>
                        <TableCell>
                          <Badge variant={attempt.is_complete ? "secondary" : "default"}>
                            {attempt.is_complete ? "Completed" : "In Progress"}
                          </Badge>
                        </TableCell>
                        <TableCell>{attempt.score == null ? "—" : `${attempt.score}%`}</TableCell>
                        <TableCell>{formatDate(attempt.timestamp)}</TableCell>
                        <TableCell className="text-right">
                          {attempt.is_complete ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/results?attemptId=${attempt.id}`}>Review Results</Link>
                            </Button>
                          ) : (
                            <Button asChild size="sm">
                              <Link href={`/practice?attemptId=${attempt.id}`}>Resume</Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 flex justify-end">
                  <Button asChild>
                    <Link href="/start-quiz">Start New Practice</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Attempt not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">We couldn&apos;t load this attempt yet. Return to Results to select another session.</p>
            <Button asChild>
              <Link href="/results">Back to Results</Link>
            </Button>
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
      <div className="mx-auto max-w-3xl">
        <Card className="mb-8">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Quiz Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="relative flex h-48 w-48 items-center justify-center rounded-full border-8 border-primary/20">
                <div className="text-4xl font-bold">{score}%</div>
              </div>

              <div className="grid w-full max-w-md grid-cols-2 gap-4">
                <div className="flex flex-col items-center rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <CheckCircle className="mb-2 h-8 w-8 text-green-500" />
                  <div className="text-xl font-bold">{correctAnswers}</div>
                  <div className="text-sm text-gray-500">Correct</div>
                </div>
                <div className="flex flex-col items-center rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <XCircle className="mb-2 h-8 w-8 text-red-500" />
                  <div className="text-xl font-bold">{incorrectCount}</div>
                  <div className="text-sm text-gray-500">Incorrect</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {effectiveTotalQuestions} · Answered: {answeredCount} · Unanswered: {unansweredCount}
              </div>

              <div className="flex w-full flex-col gap-4 sm:flex-row">
                <Link href="/results" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full bg-transparent">
                    <Home className="mr-2 h-4 w-4" />
                    Back to Results
                  </Button>
                </Link>
                <Link href="/start-quiz" className="w-full sm:w-auto">
                  <Button className="w-full">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Start New Practice
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
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                      <div className={`flex items-center ${isCorrect ? "text-green-500" : "text-red-500"}`}>
                        {isCorrect ? <CheckCircle className="mr-1 h-5 w-5" /> : <XCircle className="mr-1 h-5 w-5" />}
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
