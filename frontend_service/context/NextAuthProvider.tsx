// context/NextAuthProvider.tsx

"use client";

import { SessionProvider } from "next-auth/react";
import { signOut } from "next-auth/react";
import React from "react";

interface Props {
  children: React.ReactNode;
}

const NextAuthProvider = ({ children }: Props) => {
  React.useEffect(() => {
    const onAuthExpired = () => {
      signOut({ callbackUrl: "/login?reason=expired" });
    };
    window.addEventListener("ascendprep:auth-expired", onAuthExpired);
    return () => window.removeEventListener("ascendprep:auth-expired", onAuthExpired);
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
};

export default NextAuthProvider;
