import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AuthRequiredState } from "@/components/auth-required-state";
import { resolveRole } from "@/lib/role-navigation";
import { StudentDashboardClient } from "./_components/student-dashboard-client";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="You need to be logged in to view your dashboard." />;
  }

  const role = resolveRole(session.user);
  if (role === "superadmin") redirect("/superadmin/dashboard");
  if (role === "institution_admin") redirect("/admin/dashboard");

  const userName = session.user?.name ?? "Student";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {userName}</h1>
          <p className="text-muted-foreground">Keep going—small daily practice adds up quickly.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Continue your momentum</CardTitle>
            <CardDescription>Pick up where you left off or start fresh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/tests-taken">Resume last incomplete quiz</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/start-quiz">Start a new quiz</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Results</CardTitle>
            <CardDescription>Review your recent attempts and outcomes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/results">View result summaries</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Progress</CardTitle>
            <CardDescription>See strongest categories and where to focus next.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/progress">Track my progress</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <StudentDashboardClient />
    </div>
  );
}
