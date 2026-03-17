// types/next-auth.d.ts
// UPDATED: Added is_admin flag to Session and JWT types for role checking.

import { type DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string;
      // This is the token from our Python backend
      backendToken?: string;
      // NEW: Add admin flag to the session user
      is_admin?: boolean;
      is_super_admin?: boolean;
      institution_id?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    // This is the token from our Python backend
    backendToken?: string;
    // NEW: Add admin flag to the JWT token
    is_admin?: boolean;
    is_super_admin?: boolean;
    institution_id?: number;
    id?: string;
    token?: string;
  }
}

// NEW: This is needed because the user object from the authorize callback is not strongly typed
interface BackendUser {
    id: string;
    name: string;
    token: string;
    is_admin: boolean;
    is_super_admin: boolean;
    institution_id: number;
}
