import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";
import { AdminDashboardClient } from "./_components/admin-dashboard-client";
import { resolveRole } from "@/lib/role-navigation";
import { PageHeader, PageShell } from "@/components/ui/page-shell";

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="Please log in to open the institution admin dashboard." />;
  }

  const role = resolveRole(session.user);
  if (role !== "institution_admin") {
    return (
      <AccessDeniedState
        description="This page is only for institution admins."
        actionHref={role === "superadmin" ? "/superadmin/dashboard" : "/dashboard"}
        actionLabel="Go to my dashboard"
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin Workspace"
        title="Assignment Operations"
        description={`Create, distribute, and monitor assignment performance for ${session.user.institution_name ?? "your institution"}.`}
      />
      <AdminDashboardClient view="assignments" />
    </PageShell>
  );
}
