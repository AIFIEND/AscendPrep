import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";
import { resolveRole } from "@/lib/role-navigation";
import { AdminDashboardClient } from "../dashboard/_components/admin-dashboard-client";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

export default async function AdminStudentsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="Please log in to continue." />;
  }

  const role = resolveRole(session.user);
  if (role !== "institution_admin") {
    return (
      <AccessDeniedState
        description="Learner management is only available to institution admins."
        actionHref={role === "superadmin" ? "/superadmin/dashboard" : "/dashboard"}
        actionLabel="Go to my dashboard"
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin Workspace"
        title="Learner Management"
        description="Review status, participation, and performance for each learner account."
      />
      <AdminDashboardClient view="students" />
    </PageShell>
  );
}
