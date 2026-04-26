"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { AccessDeniedState } from "@/components/access-denied-state";
import { AuthRequiredState } from "@/components/auth-required-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageShell, SectionBlock } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getJson } from "@/lib/api";
import { resolveRole } from "@/lib/role-navigation";

type RoleplayStudentRow = {
  user_id: number;
  username: string;
  status: "Not started" | "Completed";
  score: number | null;
  total_questions: number | null;
  score_percent: number | null;
  completed_at: string | null;
  roleplay_id: number;
};

type RoleplayAssignmentDetail = {
  id: number;
  title: string;
  instructions: string | null;
  due_date: string | null;
  assignment_type: "mcq_drill" | "full_roleplay";
  drill_label: string | null;
  roleplay_id: number;
  roleplay: { business_name: string; event: string } | null;
  assigned_count: number;
  completed_count: number;
  missing_count: number;
  completion_rate: number;
  students: RoleplayStudentRow[];
};

export default function AdminRoleplayAssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = useMemo(() => Number.parseInt(params?.id ?? "", 10), [params?.id]);
  const { status, data: session } = useSession();
  const role = session ? resolveRole(session.user) : null;

  const [detail, setDetail] = useState<RoleplayAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(assignmentId)) {
      setLoading(false);
      setError("Assignment not found.");
      setHttpStatus(404);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setHttpStatus(null);

    getJson<RoleplayAssignmentDetail>(`/api/admin/roleplay-assignments/${assignmentId}`)
      .then((resp) => {
        if (!active) return;
        setDetail(resp);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError) {
          setError(err.message);
          setHttpStatus(err.status);
        } else {
          setError("Could not load roleplay assignment details.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (status === "loading") {
    return <PageShell><SectionBlock><p className="text-sm text-muted-foreground">Loading assignment details...</p></SectionBlock></PageShell>;
  }

  if (!session) {
    return <AuthRequiredState description="Please log in to review assignment details." />;
  }

  if (role !== "institution_admin" && role !== "superadmin") {
    return <AccessDeniedState description="Assignment details are only available to advisors and admins." actionHref="/dashboard" actionLabel="Go to my dashboard" />;
  }

  const assignmentTypeLabel = detail?.assignment_type === "full_roleplay" ? "Full Roleplay Practice" : "Roleplay MCQ Drill";
  const formatScore = (student: RoleplayStudentRow) => {
    if (student.score != null && student.total_questions != null && student.total_questions > 0) {
      return `${student.score}/${student.total_questions} · ${student.score_percent == null ? "—" : `${student.score_percent}%`}`;
    }
    if (student.score_percent != null) {
      return `${student.score_percent}%`;
    }
    return "—";
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Assignment Tracking"
        title={detail?.title ?? "Roleplay assignment detail"}
        description="Review completion across assigned learners."
      />

      {loading ? (
        <SectionBlock><p className="text-sm text-muted-foreground">Loading assignment details...</p></SectionBlock>
      ) : httpStatus === 403 ? (
        <AccessDeniedState description="You do not have permission to view this assignment." actionHref="/admin/dashboard" actionLabel="Back to dashboard" />
      ) : httpStatus === 404 ? (
        <SectionBlock>
          <p className="text-sm text-muted-foreground">This assignment does not exist or is no longer available.</p>
          <Button className="mt-3" asChild variant="outline"><Link href="/admin/dashboard">Back to dashboard</Link></Button>
        </SectionBlock>
      ) : error || !detail ? (
        <SectionBlock>
          <p className="text-sm text-destructive">{error ?? "Could not load assignment details."}</p>
        </SectionBlock>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{detail.title}</CardTitle>
              {detail.instructions ? <CardDescription>{detail.instructions}</CardDescription> : null}
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 text-sm">
              <p><span className="text-muted-foreground">Type:</span> <span className="font-medium">{assignmentTypeLabel}</span></p>
              <p><span className="text-muted-foreground">Roleplay:</span> <span className="font-medium">{detail.roleplay?.business_name ?? `Roleplay #${detail.roleplay_id}`}</span></p>
              <p><span className="text-muted-foreground">Event:</span> <span className="font-medium">{detail.roleplay?.event ?? "—"}</span></p>
              <p><span className="text-muted-foreground">Due date:</span> <span className="font-medium">{detail.due_date ? new Date(detail.due_date).toLocaleString() : "No due date"}</span></p>
              {detail.assignment_type === "mcq_drill" ? (
                <p className="md:col-span-2"><span className="text-muted-foreground">Drill focus:</span> <span className="font-medium">{detail.drill_label ?? "MCQ Drill"}</span></p>
              ) : (
                <p className="md:col-span-2 text-muted-foreground">Full roleplay completion tracking is currently basic and does not include AI scoring or video review.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completion summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
              <p><span className="text-muted-foreground">Assigned:</span> <span className="font-medium">{detail.assigned_count}</span></p>
              <p><span className="text-muted-foreground">Completed:</span> <span className="font-medium">{detail.completed_count}</span></p>
              <p><span className="text-muted-foreground">Missing:</span> <span className="font-medium">{detail.missing_count}</span></p>
              <p><span className="text-muted-foreground">Completion:</span> <span className="font-medium">{detail.completion_rate}%</span></p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learner status</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">No learners are assigned to this roleplay assignment yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.students.map((student) => (
                      <TableRow key={student.user_id}>
                        <TableCell className="font-medium">{student.username}</TableCell>
                        <TableCell><Badge variant={student.status === "Completed" ? "secondary" : "outline"}>{student.status}</Badge></TableCell>
                        <TableCell>{formatScore(student)}</TableCell>
                        <TableCell>{student.completed_at ? new Date(student.completed_at).toLocaleString() : "—"}</TableCell>
                        <TableCell>
                          <Link className="text-sm underline" href={`/roleplays/${student.roleplay_id}`}>View roleplay</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
