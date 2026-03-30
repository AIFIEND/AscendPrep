import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import { AuthRequiredState } from "@/components/auth-required-state";
import { resolveRole } from "@/lib/role-navigation";
import { StudentDashboardClient } from "./_components/student-dashboard-client";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="You need to be logged in to view your dashboard." />;
  }

  const role = resolveRole(session.user);
  if (role === "superadmin") redirect("/superadmin/dashboard");
  if (role === "institution_admin") redirect("/admin/dashboard");

  const userName = session.user?.name ?? "Learner";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Your Study Space"
        title={`Welcome back, ${userName}`}
        description="Keep your streak alive, focus weak categories, and build mastery with short daily practice."
        actions={
          <>
            <Button asChild>
              <Link href="/start-quiz">Start practice</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tests-taken">Resume last session</Link>
            </Button>
          </>
        }
      />

      <StudentDashboardClient />
    </PageShell>
  );
}
