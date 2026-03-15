// app/practice/page.tsx
// UPDATED: Replaced the state-based bug fix with a more robust useRef implementation to prevent duplicate quiz attempts.

"use client";

import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Question } from "@/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";
import { postJson, getJson } from '@/lib/api';

function PracticePageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (status === "loading") {
    return <p className="text-center mt-8">Loading...</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>You need to be logged in to view this page.</p>
            <Button onClick={() => router.push("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{
    [key: number]: string;
  }>({});
  const [eliminatedOptions, setEliminatedOptions] = useState<{
    [key: number]: string[];
  }>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<number[]>([]);
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // NEW: Use a ref to prevent duplicate quiz creation. A ref's value persists
  // across re-renders and doesn't trigger them, making it a reliable lock.
  const quizCreationInitiated = useRef(false);

  // Extract URL parameters as stable strings
  const attemptIdParam = searchParams.get("attemptId");
  const categoriesParam = searchParams.get("categories");
  const difficultiesParam = searchParams.get("difficulties");
  const sessionToken = session?.user?.backendToken;

  useEffect(() => {
    // Only run if we have a session
    if (!session) return;
    
    const loadQuiz = async () => {
      setIsLoading(true);
      try {
        let data;
        if (attemptIdParam) {
          data = await getJson(`/api/quiz/resume/${attemptIdParam}`, {
            headers: {
              Authorization: sessionToken ? `Bearer ${sessionToken}` : '',
            },
          });

          const savedAnswers = data.answersSoFar || {};
          setAttemptId(parseInt(attemptIdParam, 10));
          setQuestions(data.questions);
          setSelectedAnswers(savedAnswers);
          const firstUnansweredIndex = data.questions.findIndex(
            (q: Question) => !savedAnswers.hasOwnProperty(q.id)
          );
          setCurrentQuestionIndex(
            firstUnansweredIndex === -1 ? data.questions.length - 1 : firstUnansweredIndex
          );
        } else {
          // Only create new quiz if we haven't already initiated one
          if (quizCreationInitiated.current) return;
          quizCreationInitiated.current = true;

          const cats = categoriesParam?.split(",") || [];
          const diffs = difficultiesParam?.split(",") || [];
          let testName = "Practice Quiz";
          if (cats.length) testName = `${cats.join(", ")} Quiz`;
          else if (diffs.length) testName = `${diffs.join(", ")} Difficulty Quiz`;

          const data = await postJson(
            '/api/quiz/start',
            {
              categories: cats,
              difficulties: diffs,
              testName,
            },
            {
              headers: {
                Authorization: sessionToken ? `Bearer ${sessionToken}` : '',
              },
            }
          );
          setAttemptId(data.attemptId);
          setQuestions(data.questions);
        }
      } catch (error) {
        console.error("Failed to load quiz:", error);
        toast.error("Could not load quiz questions.");
      } finally {
        setIsLoading(false);
      }
    };

    loadQuiz();
  }, [attemptIdParam, categoriesParam, difficultiesParam, sessionToken, session]);

  const currentQuestion = questions[currentQuestionIndex];
  const isCorrect =
    currentQuestion &&
    selectedAnswers[currentQuestion.id] === currentQuestion.correctAnswer;

  const handleAnswerSelect = async (questionId: number, answerId: string) => {
    if (showFeedback) return;

    try {
      setSelectedAnswers((p) => ({ ...p, [questionId]: answerId }));
await postJson(
  '/api/quiz/answer',
  {
    attemptId,
    questionId,
    answer: answerId,
  },
  {
    headers: {
      Authorization: session?.user?.backendToken ? `Bearer ${session.user.backendToken}` : '',
    },
  }
);

    } catch (error) {
      console.error("Failed to save answer:", error);
      toast.error("Could not save your answer. Please check your connection.");
    }
    const correct =
      questions.find((q) => q.id === questionId)?.correctAnswer === answerId;
    toast(correct ? "Correct!" : "Incorrect.", {
      description: correct ? "Great job!" : "Keep trying!",
      duration: 2000,
    });
    setShowFeedback(true);
  };

  const handleEliminateOption = (qId: number, opt: string) => {
    setEliminatedOptions((p) => ({
      ...p,
      [qId]: [...(p[qId] || []), opt],
    }));
  };

  const handleFlagQuestion = (qId: number) => {
    setFlaggedQuestions((p) =>
      p.includes(qId) ? p.filter((x) => x !== qId) : [...p, qId]
    );
  };

  const handleNextQuestion = () => {
    setShowFeedback(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((p) => p + 1);
    } else {
      handleShowScore();
    }
  };

  const handleShowScore = async () => {
    const correctCount = questions.reduce(
      (acc, q) => (selectedAnswers[q.id] === q.correctAnswer ? acc + 1 : acc),
      0
    );
    const finalScore =
      questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
    setScore(finalScore);
    setShowScore(true);

    if (!session?.user?.backendToken || attemptId === null) {
      toast.error("You must be logged in to save your score.");
      return;
    }

try {
  await postJson(
    '/api/quiz/submit',
    {
      attemptId,
    },
    {
      headers: {
        Authorization: session?.user?.backendToken ? `Bearer ${session.user.backendToken}` : '',
      },
    }
  );
  toast.success("Quiz score saved successfully!");
} catch (error) {
  console.error("Failed to save quiz score:", error);
  toast.error("Could not save your score.");
}
  };

  if (isLoading) {
    return <div className="text-center p-10">Loading Questions...</div>;
  }

  if (!isLoading && questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Alert>
          <AlertTitle>No Questions Found</AlertTitle>
          <AlertDescription>
            No questions match the selected filters. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (showScore) {
    return (
      <div className="max-w-4xl mx-auto p-4 mt-10">
        <Card>
          <CardHeader>
            <CardTitle>Quiz Complete!</CardTitle>
            <CardDescription>Here's how you did:</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="default" className="text-center">
              <AlertTitle className="text-2xl mb-2">Final Score</AlertTitle>
              <AlertDescription className="text-4xl font-bold">
                {score?.toFixed(0) ?? 0}%
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => (window.location.href = "/start-quiz")}
              className="w-full mt-6"
            >
              Take Another Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 mt-10">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>
              Question {currentQuestionIndex + 1} of {questions.length}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFlagQuestion(currentQuestion.id)}
            >
              <Flag
                className={
                  flaggedQuestions.includes(currentQuestion.id)
                    ? "text-blue-500 fill-current"
                    : ""
                }
              />
            </Button>
          </div>
          <CardDescription className="pt-4 text-base">
            {currentQuestion.question}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currentQuestion.options.map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <Button
                  variant={
                    selectedAnswers[currentQuestion.id] === option.id
                      ? "default"
                      : "outline"
                  }
                  className={`w-full justify-start h-auto text-wrap text-left ${
                    (eliminatedOptions[currentQuestion.id] || []).includes(
                      option.id
                    )
                      ? "line-through text-muted-foreground"
                      : ""
                  }`}
                  onClick={() =>
                    handleAnswerSelect(currentQuestion.id, option.id)
                  }
                  disabled={
                    (eliminatedOptions[currentQuestion.id] || []).includes(
                      option.id
                    ) || showFeedback
                  }
                >
                  <span className="font-bold mr-2">{option.id}.</span>{" "}
                  {option.text}
                </Button>
                {!showFeedback && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      handleEliminateOption(currentQuestion.id, option.id)
                    }
                    aria-label={`Eliminate option ${option.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {showFeedback && (
            <Alert
              variant={isCorrect ? "default" : "destructive"}
              className="mt-6"
            >
              <AlertTitle>
                {isCorrect ? "Correct!" : "Incorrect"}
              </AlertTitle>
              <AlertDescription>
                {currentQuestion.explanation}
              </AlertDescription>
            </Alert>
          )}
          <div className="mt-6">
            {showFeedback && (
              <Button onClick={handleNextQuestion} className="w-full">
                {currentQuestionIndex === questions.length - 1
                  ? "Show Score"
                  : "Next Question"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="text-center p-10">Loading...</div>}>
      <PracticePageContent />
    </Suspense>
  );
}
