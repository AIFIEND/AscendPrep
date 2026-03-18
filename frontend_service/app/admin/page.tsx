// app/admin/page.tsx
// Role-based admin gate: no passcode flow.

"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthRequiredState } from "@/components/auth-required-state";

export default function AdminGatePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <p className="text-center mt-8">Loading...</p>;
  }

  if (!session) {
    return <AuthRequiredState description="You need to be logged in to access admin tools." />;
  }

  const canAccessAdmin = !!session.user?.is_admin || !!session.user?.is_super_admin;

  if (!canAccessAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Your account does not have admin privileges.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Access</CardTitle>
          <CardDescription>You are signed in as an admin. Continue to the admin dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/admin/dashboard">Continue to Admin Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
