"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Question } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";
import { postJson, getJson, ApiError } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { AuthRequiredState } from "@/components/auth-required-state";

function PracticePageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [eliminatedOptions, setEliminatedOptions] = useState<{ [key: number]: string[] }>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<number[]>([]);
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [assignmentMeta, setAssignmentMeta] = useState<{ due_date: string | null; time_limit_minutes: number | null } | null>(null);
  const [attemptStartedAt, setAttemptStartedAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const attemptIdParam = searchParams.get("attemptId");
  const categoriesParam = searchParams.get("categories");
  const difficultiesParam = searchParams.get("difficulties");
  const numQuestionsParam = searchParams.get("numQuestions");
  const sessionToken = session?.user?.backendToken;
  const parsedAttemptId = attemptIdParam ? Number.parseInt(attemptIdParam, 10) : null;
  const resolvedAttemptId = attemptId ?? (Number.isFinite(parsedAttemptId) ? parsedAttemptId : null);
  const requestedQuestionCount = numQuestionsParam
    ? Math.max(1, Number.parseInt(numQuestionsParam, 10) || 0)
    : null;

  useEffect(() => {
    if (!session) return;

    const loadQuiz = async () => {
      setIsLoading(true);
      try {
        if (attemptIdParam) {
          const data = await getJson(`/api/quiz/resume/${attemptIdParam}`, {
            headers: {
              Authorization: sessionToken ? `Bearer ${sessionToken}` : "",
            },
          });

          const savedAnswers = data.answersSoFar || {};
          setAttemptId(parseInt(attemptIdParam, 10));
          setQuestions(data.questions);
          setSelectedAnswers(savedAnswers);
          setAssignmentMeta(data.assignment ?? null);
          setAttemptStartedAt(data.attempt?.timestamp ?? null);
          const firstUnansweredIndex = data.questions.findIndex((q: Question) => !savedAnswers.hasOwnProperty(q.id));
          setCurrentQuestionIndex(firstUnansweredIndex === -1 ? data.questions.length - 1 : firstUnansweredIndex);
        } else {
          if (!categoriesParam && !difficultiesParam) {
            router.replace("/start-quiz");
            return;
          }

          const cats = categoriesParam?.split(",") || [];
          const diffs = difficultiesParam?.split(",") || [];
          let testName = "Practice Quiz";
          if (cats.length) testName = `${cats.join(", ")} Quiz`;
          else if (diffs.length) testName = `${diffs.join(", ")} Difficulty Quiz`;

          const data = await postJson(
            "/api/quiz/start",
            {
              categories: cats,
              difficulties: diffs,
              testName,
              numQuestions: requestedQuestionCount ?? undefined,
            },
            {
              headers: {
                Authorization: sessionToken ? `Bearer ${sessionToken}` : "",
              },
            }
          );
          setAttemptId(data.attemptId);
          setQuestions(data.questions);
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Could not load quiz questions.";
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuiz();
  }, [attemptIdParam, categoriesParam, difficultiesParam, numQuestionsParam, sessionToken, session]);

  useEffect(() => {
    const limitMinutes = assignmentMeta?.time_limit_minutes;
    if (!limitMinutes || !attemptStartedAt) {
      setSecondsLeft(null);
      return;
    }
    const interval = setInterval(() => {
      const started = new Date(attemptStartedAt).getTime();
      const expiresAt = started + limitMinutes * 60 * 1000;
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [assignmentMeta, attemptStartedAt]);

  if (status === "loading") return <p className="page-wrap mt-8 text-sm text-muted-foreground">Loading...</p>;
  if (status === "unauthenticated") return <AuthRequiredState description="You need to be logged in to practice." />;

  const currentQuestion = questions[currentQuestionIndex];
  const isCorrect = currentQuestion && selectedAnswers[currentQuestion.id] === currentQuestion.correctAnswer;

  const handleAnswerSelect = async (questionId: number, answerId: string) => {
    if (showFeedback) return;

    try {
      setSelectedAnswers((p) => ({ ...p, [questionId]: answerId }));
      if (resolvedAttemptId === null) throw new Error("Could not determine quiz attempt. Please restart the quiz.");
      setPendingSaves((count) => count + 1);
      await postJson(
        "/api/quiz/answer",
        { attemptId: resolvedAttemptId, questionId, answer: answerId },
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );
    } catch {
      toast.error("Could not save your answer. Please check your connection.");
    } finally {
      setPendingSaves((count) => Math.max(0, count - 1));
    }

    const correct = questions.find((q) => q.id === questionId)?.correctAnswer === answerId;
    toast(correct ? "Correct!" : "Incorrect.", {
      description: correct ? "Great job." : "Keep going.",
      duration: 2000,
    });
    setShowFeedback(true);
  };

  const handleEliminateOption = (qId: number, opt: string) => {
    setEliminatedOptions((p) => ({ ...p, [qId]: [...(p[qId] || []), opt] }));
  };

  const handleFlagQuestion = (qId: number) => {
    setFlaggedQuestions((p) => (p.includes(qId) ? p.filter((x) => x !== qId) : [...p, qId]));
  };

  const handleNextQuestion = () => {
    setShowFeedback(false);
    if (currentQuestionIndex < questions.length - 1) setCurrentQuestionIndex((p) => p + 1);
    else handleShowScore();
  };

  const handleShowScore = async () => {
    if (pendingSaves > 0) {
      toast("Please wait", { description: "Saving your latest answer before submitting..." });
      return;
    }

    if (!sessionToken || resolvedAttemptId === null) {
      toast.error("Could not save score because your quiz session is missing. Please restart the quiz.");
      return;
    }

    try {
      await postJson(
        "/api/quiz/submit",
        { attemptId: resolvedAttemptId },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      setScore(null);
      setShowScore(true);
      router.push(`/results?attemptId=${resolvedAttemptId}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not save your score. Please try again.";
      toast.error(message);
      setShowScore(false);
    }
  };

  if (isLoading) return <div className="page-wrap py-10 text-sm text-muted-foreground">Loading questions...</div>;

  if (!isLoading && questions.length === 0) {
    return (
      <div className="page-wrap py-10">
        <Alert>
          <AlertTitle>No questions found</AlertTitle>
          <AlertDescription>No questions match the selected filters. Please try again.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (showScore) {
    return (
      <div className="page-wrap py-10">
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <CardTitle>Session complete</CardTitle>
            <CardDescription>Your score for this practice set</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-5xl font-semibold tracking-tight">{score?.toFixed(0) ?? 0}%</p>
            <Button onClick={() => (window.location.href = "/start-quiz")} className="w-full">
              Start another session
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = questions.length ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="page-wrap pb-28 pt-8 sm:pt-10">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_220px]">
        <Card>
          <CardHeader className="space-y-4 border-b border-border/70 pb-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg">Question {currentQuestionIndex + 1} of {questions.length}</CardTitle>
              {typeof secondsLeft === "number" && (
                <span className={`text-xs font-medium ${secondsLeft <= 30 ? "text-destructive" : "text-muted-foreground"}`}>
                  Time left: {Math.max(secondsLeft, 0)}s
                </span>
              )}
              <Button variant="ghost" size="icon" onClick={() => handleFlagQuestion(currentQuestion.id)}>
                <Flag className={flaggedQuestions.includes(currentQuestion.id) ? "fill-current text-primary" : "text-muted-foreground"} />
              </Button>
            </div>
            <Progress value={progress} className="h-2.5" />
            <CardDescription className="pt-1 text-base leading-relaxed text-foreground">{currentQuestion.question}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pt-5">
            {currentQuestion.options.map((option) => (
              <div key={option.id} className="flex items-start gap-2">
                <Button
                  variant={selectedAnswers[currentQuestion.id] === option.id ? "secondary" : "outline"}
                  className={`h-auto w-full justify-start whitespace-normal px-4 py-3 text-left ${
                    (eliminatedOptions[currentQuestion.id] || []).includes(option.id) ? "text-muted-foreground line-through" : ""
                  }`}
                  onClick={() => handleAnswerSelect(currentQuestion.id, option.id)}
                  disabled={(eliminatedOptions[currentQuestion.id] || []).includes(option.id) || showFeedback || (typeof secondsLeft === "number" && secondsLeft <= 0)}
                >
                  <span className="mr-2 font-semibold">{option.id}.</span> {option.text}
                </Button>
                {!showFeedback && (
                  <Button variant="ghost" size="icon" onClick={() => handleEliminateOption(currentQuestion.id, option.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            {showFeedback && (
              <Alert variant={isCorrect ? "default" : "destructive"} className="mt-5">
                <AlertTitle>{isCorrect ? "Correct" : "Incorrect"}</AlertTitle>
                <AlertDescription>{currentQuestion.explanation}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Navigator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2 lg:grid-cols-3">
              {questions.map((q, idx) => {
                const answered = selectedAnswers[q.id] !== undefined;
                const isCurrent = idx === currentQuestionIndex;
                return (
                  <Button
                    key={q.id}
                    size="sm"
                    variant={isCurrent ? "default" : answered ? "secondary" : "outline"}
                    onClick={() => {
                      setCurrentQuestionIndex(idx);
                      setShowFeedback(false);
                    }}
                  >
                    {idx + 1}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 p-4 backdrop-blur md:hidden">
        <div className="page-wrap">
          {showFeedback ? (
            <Button onClick={handleNextQuestion} className="w-full" disabled={pendingSaves > 0 || (typeof secondsLeft === "number" && secondsLeft <= 0)}>
              {currentQuestionIndex === questions.length - 1 ? "Finish session" : "Next question"}
            </Button>
          ) : (
            <Button disabled className="w-full">Select an answer to continue</Button>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 hidden max-w-6xl md:block">
        {showFeedback && (
          <Button onClick={handleNextQuestion} className="w-full" disabled={pendingSaves > 0 || (typeof secondsLeft === "number" && secondsLeft <= 0)}>
            {currentQuestionIndex === questions.length - 1 ? "Finish session" : "Next question"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="page-wrap py-10 text-sm text-muted-foreground">Loading...</div>}>
      <PracticePageContent />
    </Suspense>
  );
}
