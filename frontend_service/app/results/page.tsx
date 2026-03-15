"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/api";
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

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [data, setData] = useState<AttemptResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const attemptId = searchParams.get("attemptId");

  useEffect(() => {
    if (!attemptId) {
      setError("Missing attempt ID.");
      setLoading(false);
      return;
    }

    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (!session?.user?.backendToken) {
      setError("You must be logged in to view quiz results.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    getJson<AttemptResultResponse>(`/api/quiz/attempt/${attemptId}/results`, {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
      cache: "no-store",
    })
      .then((resp) => {
        setData(resp);
        setError(null);
      })
      .catch(() => setError("Could not load quiz results."))
      .finally(() => setLoading(false));
  }, [attemptId, session?.user?.backendToken, status]);

  const correctAnswers = useMemo(() => {
    if (!data) return 0;
    return data.questions.reduce((acc, question) => {
      const userAnswer = data.attempt.answers[String(question.id)];
      return acc + (userAnswer === question.correctAnswer ? 1 : 0);
    }, 0);
  }, [data]);

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading results...</div>;
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>Could not load results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error || "No results found."}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild>
                <Link href="/start-quiz">Start New Quiz</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                  <div className="text-xl font-bold">{data.attempt.total_questions - correctAnswers}</div>
                  <div className="text-sm text-gray-500">Incorrect</div>
                </div>
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
          <h2 className="text-2xl font-bold">All Questions</h2>

          {data.questions.map((question, index) => {
            const userAnswer = data.attempt.answers[String(question.id)];
            const isCorrect = userAnswer === question.correctAnswer;

            return (
              <Card key={question.id} className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                    {isCorrect ? (
                      <div className="flex items-center text-green-500">
                        <CheckCircle className="h-5 w-5 mr-1" />
                        <span>Correct</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-red-500">
                        <XCircle className="h-5 w-5 mr-1" />
                        <span>Incorrect</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>{question.question}</p>

                  <div className="space-y-2">
                    {question.options.map((option) => (
                      <div
                        key={option.id}
                        className={`p-3 border rounded-lg ${
                          option.id === question.correctAnswer
                            ? "bg-green-50 border-green-500 dark:bg-green-900/20"
                            : userAnswer === option.id
                              ? "bg-red-50 border-red-500 dark:bg-red-900/20"
                              : ""
                        }`}
                      >
                        <div className="flex items-center">
                          <span className="font-semibold mr-2">{option.id}.</span>
                          <span>{option.text}</span>
                          {option.id === question.correctAnswer && (
                            <CheckCircle className="h-4 w-4 ml-2 text-green-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="font-semibold">Explanation:</p>
                    <p>{question.explanation}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
