import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";
import { resolveRole } from "@/lib/role-navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AdminStudentViewPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="Please log in to continue." />;
  }

  const role = resolveRole(session.user);
  if (role !== "institution_admin") {
    return (
      <AccessDeniedState
        description="Learner preview is only available to institution admins."
        actionHref={role === "superadmin" ? "/superadmin/dashboard" : "/dashboard"}
        actionLabel="Go to my dashboard"
      />
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Student View</h1>
        <p className="text-muted-foreground">Preview the learner experience and jump directly into student-facing pages.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Learner dashboard preview</CardTitle>
          <CardDescription>Use these links to verify what students in your institution can access.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Button asChild variant="outline"><Link href="/dashboard">Student Dashboard</Link></Button>
          <Button asChild variant="outline"><Link href="/start-quiz">Start Quiz</Link></Button>
          <Button asChild variant="outline"><Link href="/results">My Results</Link></Button>
          <Button asChild variant="outline"><Link href="/progress">My Progress</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
