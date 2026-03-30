import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";
import { resolveRole } from "@/lib/role-navigation";
import { AdminDashboardClient } from "../dashboard/_components/admin-dashboard-client";

export default async function AdminInstitutionPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="Please log in to continue." />;
  }

  const role = resolveRole(session.user);
  if (role !== "institution_admin") {
    return (
      <AccessDeniedState
        description="Institution overview is only available to institution admins."
        actionHref={role === "superadmin" ? "/superadmin/dashboard" : "/dashboard"}
        actionLabel="Go to my dashboard"
      />
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Institution Overview</h1>
        <p className="text-muted-foreground">Summary analytics, leaderboard, category performance, and assignment completion snapshot.</p>
      </div>
      <AdminDashboardClient view="overview" />
    </div>
  );
}
