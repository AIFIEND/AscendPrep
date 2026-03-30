// components/QuizClient.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react"; // <--- IMPORT SESSION
import { Question } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { postJson, apiFetch } from "@/lib/api";

interface QuizClientProps {
  attemptId: number;
  initialQuestions?: Question[];
  initialAnswers?: Record<number, string>;
}

export default function QuizClient({ attemptId, initialQuestions, initialAnswers }: QuizClientProps) {
  const router = useRouter();
  const { data: session } = useSession(); // <--- GET SESSION
  const token = (session?.user as any)?.backendToken; // <--- EXTRACT TOKEN

  const [questions, setQuestions] = useState<Question[]>(initialQuestions || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>(initialAnswers || {});
  const [loading, setLoading] = useState(!initialQuestions);
  const [submitting, setSubmitting] = useState(false);

  // If no questions provided, fetch them (WITH TOKEN)
  useEffect(() => {
    // Only run if we have a token and need questions
    if (token && (!initialQuestions || initialQuestions.length === 0)) {
      apiFetch(`/api/quiz/resume/${attemptId}`, {
         headers: { "Authorization": `Bearer ${token}` } // <--- ATTACH TOKEN
      })
        .then(res => res.json())
        .then(data => {
          if (data.questions) {
             setQuestions(data.questions);
             setAnswers(data.answersSoFar || {});
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to resume quiz", err);
          setLoading(false);
        });
    }
  }, [attemptId, initialQuestions, token]); // Add token to dependency array

  const currentQuestion = questions[currentIndex];

  const handleAnswer = (value: string) => {
    if (!token) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    
    // Save to backend
    postJson("/api/quiz/answer", {
      attemptId,
      questionId: currentQuestion.id,
      answer: value
    }, {
        headers: { "Authorization": `Bearer ${token}` } // <--- ATTACH TOKEN
    }).catch(err => console.error("Failed to save answer", err));
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);

    const correctCount = questions.reduce(
      (acc, q) => (answers[q.id] === q.correctAnswer ? acc + 1 : acc),
      0
    );
    const computedScore = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    try {
      const response = await postJson<any>(
        "/api/quiz/submit",
        {
          attemptId,
          score: computedScore,
        },
        {
          headers: { "Authorization": `Bearer ${token}` },
        }
      );

      if (response?.gamification) {
        localStorage.setItem(`last-gamification-${attemptId}`, JSON.stringify(response.gamification));
      }
      router.push("/results?attemptId=" + attemptId);
    } catch (err) {
      console.error("Submit failed", err);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-xl font-medium animate-pulse">Loading quiz questions...</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return <div className="p-8 text-center">No questions found or failed to load.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Question {currentIndex + 1} of {questions.length}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-relaxed">
            {currentQuestion.question}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={answers[currentQuestion.id] || ""} 
            onValueChange={handleAnswer}
            className="space-y-3"
          >
            {currentQuestion.options.map((opt) => (
              <div key={opt.id} className="flex items-center space-x-2 border p-3 rounded-md hover:bg-accent cursor-pointer transition-colors">
                <RadioGroupItem value={opt.id} id={`opt-${opt.id}`} />
                <Label htmlFor={`opt-${opt.id}`} className="flex-grow cursor-pointer font-normal">
                  {opt.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6">
          <Button 
            variant="outline" 
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>

          {currentIndex === questions.length - 1 ? (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Finish Quiz"}
            </Button>
          ) : (
            <Button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}>
              Next
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
