import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
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
        description="Choose one focused prep action and keep your study momentum going."
      />

      <StudentDashboardClient />
    </PageShell>
  );
}
