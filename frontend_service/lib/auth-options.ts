import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { postJson } from "@/lib/api";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        try {
          const username = (creds?.username || "").trim();
          const password = creds?.password || "";

          if (!username || !password) return null;

          const data = await postJson<{
            id: number;
            name: string;
            token: string;
            is_admin: boolean;
            is_superadmin: boolean;
            role: "student" | "institution_admin" | "superadmin";
            institution_id: number | null;
            institution_name: string | null;
          }>("/api/auth/credentials", { username, password });

          return {
            id: String(data.id),
            name: data.name,
            backendToken: data.token,
            is_admin: data.is_admin,
            is_superadmin: data.is_superadmin,
            role: data.role,
            institution_id: data.institution_id,
            institution_name: data.institution_name,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.backendToken = (user as { backendToken?: string }).backendToken;
        token.is_admin = (user as { is_admin?: boolean }).is_admin;
        token.is_superadmin = (user as { is_superadmin?: boolean }).is_superadmin;
        token.role = (user as { role?: "student" | "institution_admin" | "superadmin" }).role;
        token.institution_id = (user as { institution_id?: number | null }).institution_id;
        token.institution_name = (user as { institution_name?: string | null }).institution_name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: String(token.id ?? session.user?.id ?? ""),
        name: token.name ?? session.user?.name,
        backendToken: token.backendToken,
        is_admin: !!token.is_admin,
        is_superadmin: !!token.is_superadmin,
        role: token.role ?? "student",
        institution_id: token.institution_id ?? null,
        institution_name: token.institution_name ?? null,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
