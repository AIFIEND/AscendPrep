export type AppRole = "student" | "institution_admin" | "superadmin";

export function dashboardForRole(role: AppRole) {
  if (role === "superadmin") return "/superadmin/dashboard";
  if (role === "institution_admin") return "/admin/dashboard";
  return "/dashboard";
}

export function roleLabel(role: AppRole) {
  if (role === "superadmin") return "Superadmin";
  if (role === "institution_admin") return "Institution Admin";
  return "Student";
}
