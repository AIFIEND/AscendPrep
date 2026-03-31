"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch, getJson, postJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
      .catch(() => {
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
      .catch(() => setMaxAvailable(0));
  }, [config, selectedCats, selectedDiffs]);

  const questionLabel = useMemo(() => {
    if (maxAvailable === 0) return "No questions available for these filters";
    return `${questionCount} question${questionCount === 1 ? "" : "s"} selected`;
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

  if (loading) return <div className="page-wrap py-10 text-sm text-muted-foreground">Loading configuration...</div>;
  if (!config) return <div className="page-wrap py-10 text-sm text-destructive">Error loading config.</div>;

  return (
    <div className="page-wrap py-8 sm:py-10">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{isTargetedMode ? "Targeted practice setup" : "Create a practice session"}</CardTitle>
            <CardDescription>
              {isTargetedMode
                ? "Use a focused drill based on your weaker areas."
                : "Choose your focus areas and control session size."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-7">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertTitle>Unable to start quiz</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Categories</h3>
                <Button size="sm" variant="ghost" onClick={() => setSelectedCats([])}>Clear</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {config.categories.map((cat) => (
                  <label key={cat} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-sm">
                    <Checkbox
                      id={`cat-${cat}`}
                      checked={selectedCats.includes(cat)}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedCats([...selectedCats, cat]);
                        else setSelectedCats(selectedCats.filter((c) => c !== cat));
                      }}
                    />
                    <Label htmlFor={`cat-${cat}`} className="cursor-pointer">{cat}</Label>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Difficulty</h3>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDiffs([])}>Clear</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {config.difficulties.map((diff) => {
                  const selected = selectedDiffs.includes(diff);
                  return (
                    <button
                      key={diff}
                      type="button"
                      onClick={() =>
                        selected
                          ? setSelectedDiffs(selectedDiffs.filter((d) => d !== diff))
                          : setSelectedDiffs([...selectedDiffs, diff])
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {diff}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-border/70 bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Session length</h3>
                <Badge variant="secondary">{questionLabel}</Badge>
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
            </section>

            <Button onClick={handleStart} disabled={starting || maxAvailable === 0} className="w-full" size="lg">
              {starting ? "Starting session..." : "Start practice"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Available questions" value={String(maxAvailable)} />
            <Row label="Selected categories" value={selectedCats.length ? String(selectedCats.length) : "Any"} />
            <Row label="Selected difficulties" value={selectedDiffs.length ? String(selectedDiffs.length) : "Any"} />
            <Row label="Question count" value={String(questionCount)} />
            <p className="pt-1 text-xs text-muted-foreground">
              Tip: shorter, focused sets are better for retention than long unfocused sessions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
