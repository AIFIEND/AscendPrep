import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      backendToken?: string;
      is_admin?: boolean;
      is_superadmin?: boolean;
      role?: "student" | "institution_admin" | "superadmin";
      institution_id?: number | null;
      institution_name?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    is_admin?: boolean;
    is_superadmin?: boolean;
    id?: string;
    role?: "student" | "institution_admin" | "superadmin";
    institution_id?: number | null;
    institution_name?: string | null;
  }
}
