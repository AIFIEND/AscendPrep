"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ApiError, apiFetch, getJson } from "@/lib/api";
import { resolveRole } from "@/lib/role-navigation";
import type { Roleplay, RoleplayMcqQuestion } from "@/lib/roleplays";
import { ROLEPLAY_DRILL_OPTIONS } from "@/lib/roleplays";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

const TRAINING_FALLBACK = "Training content not available yet.";

type RoleplayAssignment = {
  id: number;
  title: string;
  instructions: string | null;
  due_date: string | null;
  assignment_type: "full" | "drill";
  drill_type: string | null;
  drill_label: string | null;
  roleplay_id: number;
  advisor: string | null;
  is_completed: boolean;
  completed_at: string | null;
};

type AdminSummary = {
  users: Array<{ id: number; username: string; is_admin: boolean; is_active: boolean }>;
};

type RoleplayPracticeSubmitResult = {
  id: number;
  score: number;
  total_questions: number;
  results_by_skill: Record<string, { correct: number; total: number }>;
  completed_at: string | null;
};

type RoleplayPracticeAttempt = {
  id: number;
  roleplay_id: number;
  business_name: string | null;
  event: string | null;
  score: number;
  total_questions: number;
  results_by_skill: Record<string, { correct: number; total: number }>;
  completed_at: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseRoleplayMcqs(value: unknown): RoleplayMcqQuestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw): RoleplayMcqQuestion | null => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const question = typeof item.question === "string" ? item.question : "";
      if (!question.trim()) return null;

      const options = asStringArray(item.choices ?? item.options ?? item.answer_choices);
      if (options.length !== 4) return null;

      const explanation = typeof item.explanation === "string" && item.explanation.trim()
        ? item.explanation
        : "No explanation provided yet.";

      const answerCandidates = [item.correct_answer, item.correctAnswer, item.correct_option, item.answer];
      let correctIndex = -1;

      for (const candidate of answerCandidates) {
        if (typeof candidate === "number" && candidate >= 0 && candidate < options.length) {
          correctIndex = candidate;
          break;
        }

        if (typeof candidate === "string") {
          const normalized = candidate.trim();
          const byValue = options.findIndex((option) => option.trim().toLowerCase() === normalized.toLowerCase());
          if (byValue >= 0) {
            correctIndex = byValue;
            break;
          }

          const letterMatch = normalized.toUpperCase().match(/^[A-D]$/);
          if (letterMatch) {
            correctIndex = letterMatch[0].charCodeAt(0) - 65;
            break;
          }
        }
      }

      if (correctIndex < 0) return null;

      return {
        question,
        choices: options,
        correctIndex,
        explanation,
      };
    })
    .filter((item): item is RoleplayMcqQuestion => item !== null);
}

function textValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : TRAINING_FALLBACK;
}

export default function RoleplayDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = resolveRole(session?.user);

  const roleplayId = Number(params.id);
  const roleplayAssignmentId = Number(searchParams.get("roleplayAssignmentId") || 0);

  const [roleplay, setRoleplay] = useState<Roleplay | null>(null);
  const [assignment, setAssignment] = useState<RoleplayAssignment | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(roleplayId)) return;
    setIsLoading(true);
    getJson<Roleplay>(`/api/roleplays/${roleplayId}`, { cache: "no-store" })
      .then((row) => {
        setRoleplay(row);
        setError(null);
      })
      .catch(() => setError("Could not load this roleplay."))
      .finally(() => setIsLoading(false));
  }, [roleplayId]);

  useEffect(() => {
    if (!roleplayAssignmentId) {
      setAssignment(null);
      return;
    }
    getJson<RoleplayAssignment>(`/api/roleplay-assignments/${roleplayAssignmentId}`, { cache: "no-store" })
      .then(setAssignment)
      .catch(() => setAssignment(null));
  }, [roleplayAssignmentId]);

  useEffect(() => {
    if (role !== "institution_admin") {
      setSummary(null);
      return;
    }
    getJson<AdminSummary>("/api/admin/institution/summary", { cache: "no-store" })
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [role]);

  const learners = useMemo(
    () => (summary?.users ?? []).filter((u) => !u.is_admin && u.is_active),
    [summary]
  );

  const [assignType, setAssignType] = useState<"full" | "drill">("full");
  const [drillType, setDrillType] = useState<string>(ROLEPLAY_DRILL_OPTIONS[0].value);
  const [assignToAll, setAssignToAll] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignStatus, setAssignStatus] = useState<string>("");
  const [assignError, setAssignError] = useState<string>("");
  const [completing, setCompleting] = useState(false);

  const [practiceStarted, setPracticeStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmittingPractice, setIsSubmittingPractice] = useState(false);
  const [practiceSubmitError, setPracticeSubmitError] = useState<string | null>(null);
  const [practiceResult, setPracticeResult] = useState<RoleplayPracticeSubmitResult | null>(null);
  const [hasSubmittedPractice, setHasSubmittedPractice] = useState(false);
  const [latestAttempt, setLatestAttempt] = useState<RoleplayPracticeAttempt | null>(null);

  useEffect(() => {
    if (!Number.isFinite(roleplayId) || !session?.user) return;
    getJson<RoleplayPracticeAttempt[]>("/api/user/roleplay-practice-attempts", { cache: "no-store" })
      .then((attempts) => {
        const mostRecent = attempts.find((attempt) => attempt.roleplay_id === roleplayId) ?? null;
        setLatestAttempt(mostRecent);
      })
      .catch(() => setLatestAttempt(null));
  }, [roleplayId, session?.user, practiceResult]);

  const focus = assignment?.assignment_type === "drill" ? assignment.drill_type : null;

  const showOverview = !focus;
  const showObjective = !focus || focus === "determine_objective";
  const showIndicators = !focus || focus === "identify_performance_indicators";
  const showOpening = !focus || focus === "plan_opening";
  const showQuestions = !focus || focus === "anticipate_judge_questions";
  const showTerms = !focus || focus === "define_key_terms";
  const showClosing = !focus || focus === "plan_closing";

  const training = roleplay?.training ?? {};
  const performanceIndicators = asStringArray(training.likely_performance_indicators);
  const keyTerms = asStringArray(training.key_terms);
  const likelyJudgeQuestions = asStringArray(training.likely_judge_questions);
  const studentTasks = asStringArray(training.student_tasks);
  const strongResponseIncludes = asStringArray(training.strong_response_includes);
  const commonMistakes = asStringArray(training.common_student_mistakes);
  const mcqQuestions = parseRoleplayMcqs(training.mcq_training_questions);

  const currentQuestion = mcqQuestions[currentQuestionIndex];
  const selectedForCurrent = selectedAnswers[currentQuestionIndex];
  const hasAnsweredCurrent = selectedForCurrent !== undefined;
  const isCurrentCorrect = hasAnsweredCurrent && selectedForCurrent === currentQuestion?.correctIndex;
  const isPracticeComplete = practiceStarted && currentQuestionIndex >= mcqQuestions.length;
  const score = mcqQuestions.reduce((acc, question, index) => (
    selectedAnswers[index] === question.correctIndex ? acc + 1 : acc
  ), 0);

  const submitPractice = useCallback(async () => {
    if (!roleplay) return;

    const answersPayload = Object.entries(selectedAnswers).reduce<Record<string, string>>((acc, [index, choiceIndex]) => {
      const question = mcqQuestions[Number(index)];
      const answer = question?.choices?.[choiceIndex];
      if (answer) acc[index] = answer;
      return acc;
    }, {});

    setIsSubmittingPractice(true);
    setPracticeSubmitError(null);
    setHasSubmittedPractice(true);
    try {
      const res = await apiFetch(`/api/roleplays/${roleplay.id}/practice/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: answersPayload,
          roleplay_assignment_id: roleplayAssignmentId || null,
        }),
      });
      const result = await res.json() as RoleplayPracticeSubmitResult;
      setPracticeResult(result);
    } catch (err) {
      setPracticeSubmitError(err instanceof ApiError ? err.message : "Could not submit your practice score. Please try again.");
    } finally {
      setIsSubmittingPractice(false);
    }
  }, [mcqQuestions, roleplay, roleplayAssignmentId, selectedAnswers]);

  useEffect(() => {
    if (!isPracticeComplete || hasSubmittedPractice || practiceResult || isSubmittingPractice) return;
    submitPractice();
  }, [hasSubmittedPractice, isPracticeComplete, isSubmittingPractice, practiceResult, submitPractice]);

  const renderListSection = (title: string, items: string[]) => (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{title}</p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{TRAINING_FALLBACK}</p>
      )}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow={assignment ? "Assigned Roleplay Work" : "Roleplay Preparation"}
        title={roleplay?.business_name || "Roleplay"}
        description={assignment
          ? `${assignment.assignment_type === "full" ? "Full Roleplay" : `Targeted Drill: ${assignment.drill_label}`} assigned by ${assignment.advisor ?? "your advisor"}.`
          : "Prepare with focused strategy cards and roleplay practice questions."}
        actions={assignment ? <Badge>{assignment.assignment_type === "full" ? "Full Roleplay" : assignment.drill_label}</Badge> : null}
      />

      {assignment && (
        <SectionBlock className="border-primary/30 bg-primary/5">
          <p className="text-sm font-medium">
            {assignment.assignment_type === "full" ? "Complete Full Roleplay" : `Practice: ${assignment.drill_label}`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {assignment.instructions || "Use the prep guide below to complete this assigned practice."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "No due date"}</p>
          {role === "student" && (
            <div className="mt-3">
              <Button
                size="sm"
                disabled={assignment.is_completed || completing}
                onClick={async () => {
                  setCompleting(true);
                  try {
                    await apiFetch(`/api/user/roleplay-assignments/${assignment.id}/complete`, { method: "POST" });
                    window.location.reload();
                  } finally {
                    setCompleting(false);
                  }
                }}
              >
                {assignment.is_completed ? "Completed" : completing ? "Saving..." : "Mark practice complete"}
              </Button>
            </div>
          )}
        </SectionBlock>
      )}

      {role === "institution_admin" && roleplay && (
        <SectionBlock>
          <h2 className="text-lg font-semibold">Assign this roleplay</h2>
          <p className="text-sm text-muted-foreground">Choose full rehearsal or a focused drill and assign to learners.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Assignment type</Label>
              <RadioGroup value={assignType} onValueChange={(v) => setAssignType(v as "full" | "drill")} className="space-y-2">
                <div className="flex items-center gap-2"><RadioGroupItem id="assign-full" value="full" /><Label htmlFor="assign-full">Full Roleplay</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem id="assign-drill" value="drill" /><Label htmlFor="assign-drill">Targeted Drill</Label></div>
              </RadioGroup>
            </div>
            {assignType === "drill" && (
              <div className="space-y-2">
                <Label>Drill focus</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={drillType} onChange={(e) => setDrillType(e.target.value)}>
                  {ROLEPLAY_DRILL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Instructions (optional)</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Add brief coaching directions for this assignment." />
            </div>
            <div className="space-y-2">
              <Label>Due date (optional)</Label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-secondary/25 p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="assign-all-roleplay" checked={assignToAll} onCheckedChange={(checked) => setAssignToAll(Boolean(checked))} />
              <Label htmlFor="assign-all-roleplay">Assign to all learners in institution</Label>
            </div>
            {!assignToAll && (
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border/70 bg-background p-2">
                {learners.map((learner) => (
                  <label key={learner.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(learner.id)}
                      onChange={(e) => setSelectedUsers((prev) => e.target.checked ? [...prev, learner.id] : prev.filter((id) => id !== learner.id))}
                    />
                    {learner.username}
                  </label>
                ))}
              </div>
            )}
          </div>

          {assignError && <p className="mt-3 text-sm text-destructive">{assignError}</p>}
          {assignStatus && <p className="mt-3 text-sm text-primary">{assignStatus}</p>}

          <Button
            className="mt-4"
            onClick={async () => {
              setAssignError("");
              setAssignStatus("");
              try {
                const res = await apiFetch("/api/admin/roleplay-assignments", {
                  method: "POST",
                  body: JSON.stringify({
                    roleplay_id: roleplay.id,
                    assignment_type: assignType,
                    drill_type: assignType === "drill" ? drillType : null,
                    assign_to_all: assignToAll,
                    selected_user_ids: assignToAll ? [] : selectedUsers,
                    due_date: dueDate || null,
                    instructions: instructions.trim() || null,
                  }),
                });
                const data = await res.json();
                setAssignStatus(`Assigned successfully to ${data.assigned_count} learner(s).`);
              } catch (err) {
                setAssignError(err instanceof ApiError ? err.message : "Could not create roleplay assignment.");
              }
            }}
          >
            Assign roleplay practice
          </Button>
        </SectionBlock>
      )}

      <SectionBlock>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading roleplay details...</p>
        ) : error || !roleplay ? (
          <p className="text-sm text-destructive">{error ?? "Could not load this roleplay."}</p>
        ) : (
          <div className="space-y-5">
            {showOverview && (
              <section>
                <h2 className="text-lg font-semibold">Overview</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{roleplay.event}</Badge>
                  <Badge variant="secondary">{roleplay.industry}</Badge>
                  <Badge variant="secondary">{roleplay.task_type}</Badge>
                  <Badge variant="secondary">{roleplay.difficulty}</Badge>
                </div>
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold">Scenario</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{roleplay.scenario_background}</p>
            </section>

            {showObjective && (
              <section>
                <h2 className="text-lg font-semibold">Your Objective</h2>
                <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{roleplay.objective}</p>
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold">Your Role vs Judge Role</h2>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Student Role</p><p className="text-sm font-medium">{roleplay.student_role}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Judge Role</p><p className="text-sm font-medium">{roleplay.judge_role}</p></div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Preparation Guide</h2>
                {!practiceStarted && (
                  <Button variant="default" onClick={() => {
                    setPracticeStarted(true);
                    setCurrentQuestionIndex(0);
                    setSelectedAnswers({});
                    setPracticeSubmitError(null);
                    setPracticeResult(null);
                    setHasSubmittedPractice(false);
                  }}>
                    Practice This Roleplay
                  </Button>
                )}
              </div>
              {latestAttempt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Latest saved score: {latestAttempt.score} / {latestAttempt.total_questions}
                  {latestAttempt.completed_at ? ` • ${new Date(latestAttempt.completed_at).toLocaleString()}` : ""}
                </p>
              )}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {showIndicators && renderListSection("Performance Indicators", performanceIndicators)}
                {showTerms && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Key Terms</p>
                    {keyTerms.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {keyTerms.map((term) => <Badge key={term} variant="outline">{term}</Badge>)}
                      </div>
                    ) : <p className="mt-2 text-sm text-muted-foreground">{TRAINING_FALLBACK}</p>}
                  </div>
                )}
                {showOpening && (
                  <div className="rounded-lg border p-3 md:col-span-2">
                    <p className="text-sm font-medium">Example Opening</p>
                    <p className="mt-2 text-sm text-muted-foreground">{textValue(training.opening_strategy?.suggested_opening)}</p>
                  </div>
                )}
                {showQuestions && renderListSection("Likely Judge Questions", likelyJudgeQuestions)}
                {showClosing && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Closing Tip</p>
                    <p className="mt-2 text-sm text-muted-foreground">{textValue(training.closing_tip)}</p>
                  </div>
                )}
                <div className="rounded-lg border p-3 md:col-span-2">
                  <p className="text-sm font-medium">Objective Summary</p>
                  <p className="mt-2 text-sm text-muted-foreground">{textValue(training.objective_summary)}</p>
                </div>
                {renderListSection("Student Tasks", studentTasks)}
                {renderListSection("Strong Response Includes", strongResponseIncludes)}
                {renderListSection("Common Student Mistakes", commonMistakes)}
              </div>
            </section>

            {practiceStarted && (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <h2 className="text-lg font-semibold">Roleplay MCQ Practice</h2>
                {!mcqQuestions.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">{TRAINING_FALLBACK}</p>
                ) : isPracticeComplete ? (
                  <div className="mt-3 space-y-3">
                    {isSubmittingPractice ? (
                      <p className="text-sm text-muted-foreground">Submitting your results…</p>
                    ) : practiceSubmitError ? (
                      <p className="text-sm text-destructive">{practiceSubmitError}</p>
                    ) : (
                      <p className="text-sm font-medium">
                        Final Score: {practiceResult?.score ?? score} / {practiceResult?.total_questions ?? mcqQuestions.length}
                      </p>
                    )}
                    <Button variant="outline" onClick={() => {
                      setCurrentQuestionIndex(0);
                      setSelectedAnswers({});
                      setPracticeSubmitError(null);
                      setPracticeResult(null);
                      setHasSubmittedPractice(false);
                    }}>
                      Retry Practice
                    </Button>
                    {practiceSubmitError && (
                      <Button
                        onClick={() => submitPractice()}
                        disabled={isSubmittingPractice}
                      >
                        Try submitting again
                      </Button>
                    )}
                  </div>
                ) : currentQuestion ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">Question {currentQuestionIndex + 1} of {mcqQuestions.length}</p>
                    <p className="text-sm font-medium">{currentQuestion.question}</p>
                    <div className="space-y-2">
                      {currentQuestion.choices.map((choice, index) => {
                        const isSelected = selectedForCurrent === index;
                        const isCorrectChoice = currentQuestion.correctIndex === index;
                        const highlightClass = hasAnsweredCurrent
                          ? isCorrectChoice
                            ? "border-emerald-500 bg-emerald-50"
                            : isSelected
                              ? "border-destructive/60 bg-destructive/5"
                              : ""
                          : "";

                        return (
                          <button
                            key={`${currentQuestionIndex}-${choice}`}
                            type="button"
                            disabled={hasAnsweredCurrent}
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [currentQuestionIndex]: index }))}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${highlightClass}`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {hasAnsweredCurrent && (
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <p className={`font-medium ${isCurrentCorrect ? "text-emerald-600" : "text-destructive"}`}>
                          {isCurrentCorrect ? "Correct" : "Not quite"}
                        </p>
                        <p className="mt-1 text-muted-foreground">{currentQuestion.explanation}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        disabled={!hasAnsweredCurrent}
                        onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                      >
                        {currentQuestionIndex + 1 === mcqQuestions.length ? "Finish Practice" : "Next Question"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}
      </SectionBlock>
    </PageShell>
  );
}
