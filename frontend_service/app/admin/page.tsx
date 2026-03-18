import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AuthRequiredState } from "@/components/auth-required-state";
import { AccessDeniedState } from "@/components/access-denied-state";

export default async function AdminIndexPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="Please log in to continue." />;
  }

  const role = session.user.role;
  if (role === "superadmin") redirect("/superadmin/dashboard");
  if (role === "institution_admin") redirect("/admin/dashboard");

  return (
    <AccessDeniedState
      description="Institution admin tools are available only to users explicitly assigned by a superadmin."
      actionHref="/dashboard"
      actionLabel="Back to Student Dashboard"
    />
  );
}
