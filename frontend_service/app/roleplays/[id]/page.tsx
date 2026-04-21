"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ApiError, apiFetch, getJson } from "@/lib/api";
import { resolveRole } from "@/lib/role-navigation";
import type { Roleplay } from "@/lib/roleplays";
import { ROLEPLAY_DRILL_LABELS, ROLEPLAY_DRILL_OPTIONS } from "@/lib/roleplays";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

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

  const focus = assignment?.assignment_type === "drill" ? assignment.drill_type : null;

  const showOverview = !focus;
  const showObjective = !focus || focus === "determine_objective";
  const showIndicators = !focus || focus === "identify_performance_indicators";
  const showOpening = !focus || focus === "plan_opening";
  const showQuestions = !focus || focus === "anticipate_judge_questions";
  const showTerms = !focus || focus === "define_key_terms";
  const showClosing = !focus || focus === "plan_closing";

  return (
    <PageShell>
      <PageHeader
        eyebrow={assignment ? "Assigned Roleplay Work" : "Roleplay Preparation"}
        title={roleplay?.business_name || "Roleplay"}
        description={assignment
          ? `${assignment.assignment_type === "full" ? "Full Roleplay" : `Targeted Drill: ${assignment.drill_label}`} assigned by ${assignment.advisor ?? "your advisor"}.`
          : "Prepare with a clean structure: scenario, objective, roles, and training guidance."}
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
              <h2 className="text-lg font-semibold">Preparation Guide</h2>
              <div className="mt-3 space-y-3">
                {showIndicators && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Performance Indicators</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {(roleplay.training?.performance_indicators || []).map((item: string) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {showTerms && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Key Terms</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(roleplay.training?.key_terms || []).map((term: string) => <Badge key={term} variant="outline">{term}</Badge>)}
                    </div>
                  </div>
                )}
                {showOpening && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Example Opening</p>
                    <p className="mt-2 text-sm text-muted-foreground">{roleplay.training?.example_opening || "No opening guidance available."}</p>
                  </div>
                )}
                {showQuestions && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Likely Judge Questions</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {(roleplay.training?.example_questions || []).map((q: string) => <li key={q}>{q}</li>)}
                    </ul>
                  </div>
                )}
                {showClosing && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Closing Tip</p>
                    <p className="mt-2 text-sm text-muted-foreground">{roleplay.training?.closing_tip || "No closing tip available."}</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </SectionBlock>
    </PageShell>
  );
}
