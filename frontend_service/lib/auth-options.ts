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
            is_super_admin: boolean;
            institution_id: number;
          }>("/api/auth/credentials", { username, password });

          return {
            id: String(data.id),
            name: data.name,
            backendToken: data.token,
            is_admin: data.is_admin,
            is_super_admin: data.is_super_admin,
            institution_id: data.institution_id,
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
        token.is_super_admin = (user as { is_super_admin?: boolean }).is_super_admin;
        token.institution_id = (user as { institution_id?: number }).institution_id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: String(token.id ?? session.user?.id ?? ""),
        name: token.name ?? session.user?.name,
        backendToken: token.backendToken,
        is_admin: !!token.is_admin,
        is_super_admin: !!token.is_super_admin,
        institution_id: typeof token.institution_id === "number" ? token.institution_id : undefined,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
