import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export default async function AdminStudentsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "institution_admin") redirect("/dashboard");
  redirect("/admin/dashboard");
}
