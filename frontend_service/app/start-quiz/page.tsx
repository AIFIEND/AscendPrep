"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch, getJson, postJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type Config = {
  categories: string[];
  difficulties: string[];
};

export default function StartQuizPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const token = session?.user?.backendToken;

  const [config, setConfig] = useState<Config | null>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedDiffs, setSelectedDiffs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maxAvailable, setMaxAvailable] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);
  const isTargetedMode = searchParams.get("mode") === "targeted";

  useEffect(() => {
    apiFetch("/api/quiz-config")
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load config", err);
        setErrorMsg("Could not load quiz configuration.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!config) return;

    const params = new URLSearchParams();
    if (selectedCats.length > 0) params.set("categories", selectedCats.join(","));
    if (selectedDiffs.length > 0) params.set("difficulties", selectedDiffs.join(","));

    getJson<any[]>(`/api/questions${params.toString() ? `?${params.toString()}` : ""}`)
      .then((questions) => {
        const max = questions.length;
        setMaxAvailable(max);
        if (max === 0) {
          setQuestionCount(0);
          return;
        }
        setQuestionCount((prev) => Math.min(Math.max(prev, 1), max));
      })
      .catch(() => {
        setMaxAvailable(0);
      });
  }, [config, selectedCats, selectedDiffs]);

  const questionLabel = useMemo(() => {
    if (maxAvailable === 0) return "No questions available for this filter";
    return `${questionCount} question${questionCount === 1 ? "" : "s"} selected (max ${maxAvailable})`;
  }, [questionCount, maxAvailable]);

  const handleStart = async () => {
    setErrorMsg(null);
    if (!token) {
      const message = "You must be logged in to start a quiz.";
      setErrorMsg(message);
      toast.error(message);
      return;
    }
    if (maxAvailable === 0) {
      const message = "No questions match your current filters.";
      setErrorMsg(message);
      toast.error(message);
      return;
    }

    setStarting(true);
    try {
      const res = await postJson(
        isTargetedMode ? "/api/quiz/start-targeted" : "/api/quiz/start",
        isTargetedMode
          ? { difficulty: selectedDiffs[0], numQuestions: questionCount }
          : {
              categories: selectedCats,
              difficulties: selectedDiffs,
              numQuestions: questionCount,
              testName: "Custom Practice",
            },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Quiz started. Good luck!");
      router.push(`/practice?attemptId=${res.attemptId}&numQuestions=${questionCount}`);
    } catch (err: any) {
      const message = err?.message || "Failed to start quiz.";
      setErrorMsg(message);
      toast.error(message);
      setStarting(false);
    }
  };

  if (loading) return <div className="p-8">Loading configuration...</div>;
  if (!config) return <div className="p-8">Error loading config.</div>;

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{isTargetedMode ? "Start a Targeted Quiz" : "Start a Practice Quiz"}</CardTitle>
          <CardDescription>{isTargetedMode ? "Questions will prioritize your focus areas." : "Select your preferences below."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorMsg && (
            <Alert variant="destructive">
              <AlertTitle>Unable to start quiz</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {config.categories.map((cat) => (
                <div key={cat} className="flex items-center space-x-2">
                  <Checkbox
                    id={`cat-${cat}`}
                    checked={selectedCats.includes(cat)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedCats([...selectedCats, cat]);
                      else setSelectedCats(selectedCats.filter((c) => c !== cat));
                    }}
                  />
                  <Label htmlFor={`cat-${cat}`}>{cat}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Difficulties</h3>
            <div className="flex flex-wrap gap-4">
              {config.difficulties.map((diff) => (
                <div key={diff} className="flex items-center space-x-2">
                  <Checkbox
                    id={`diff-${diff}`}
                    checked={selectedDiffs.includes(diff)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedDiffs([...selectedDiffs, diff]);
                      else setSelectedDiffs(selectedDiffs.filter((d) => d !== diff));
                    }}
                  />
                  <Label htmlFor={`diff-${diff}`}>{diff}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">Number of Questions</h3>
              <span className="text-sm text-muted-foreground">{questionLabel}</span>
            </div>
            <Slider
              value={[questionCount]}
              onValueChange={(vals) => setQuestionCount(vals[0] ?? 1)}
              min={1}
              max={Math.max(maxAvailable, 1)}
              step={1}
              disabled={maxAvailable === 0}
              aria-label="Number of questions"
            />
          </div>

          <Button onClick={handleStart} disabled={starting || maxAvailable === 0} className="w-full">
            {starting ? "Starting..." : "Start Quiz"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
