import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";
import { AdminDashboardClient } from "./_components/admin-dashboard-client";
import { resolveRole } from "@/lib/role-navigation";

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
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assignment Center</h1>
        <p className="text-muted-foreground">Create and track institution assignments for {session.user.institution_name ?? "Your Institution"}.</p>
      </div>
      <AdminDashboardClient view="assignments" />
    </div>
  );
}
