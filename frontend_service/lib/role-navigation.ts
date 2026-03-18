export type AppRole = "student" | "institution_admin" | "superadmin";

type SessionLike = {
  role?: string | null;
  is_superadmin?: boolean | null;
  is_super_admin?: boolean | null;
  is_admin?: boolean | null;
};

export function resolveRole(user?: SessionLike | null): AppRole {
  if (!user) return "student";
  if (user.role === "superadmin" || user.is_superadmin || user.is_super_admin) return "superadmin";
  if (user.role === "institution_admin" || user.is_admin) return "institution_admin";
  return "student";
}

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
