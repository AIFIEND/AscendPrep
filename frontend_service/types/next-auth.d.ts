import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      backendToken?: string;
      is_admin?: boolean;
      is_superadmin?: boolean;
      is_super_admin?: boolean;
      role?: "student" | "institution_admin" | "superadmin";
      account_type?: "institution" | "individual";
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
    is_super_admin?: boolean;
    id?: string;
    role?: "student" | "institution_admin" | "superadmin";
    account_type?: "institution" | "individual";
    institution_id?: number | null;
    institution_name?: string | null;
  }
}
