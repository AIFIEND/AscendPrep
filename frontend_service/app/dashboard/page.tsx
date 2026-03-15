// app/dashboard/page.tsx
// Server page: greets the user and shows quick actions.

import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AuthRequiredState } from "@/components/auth-required-state";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <AuthRequiredState description="You need to be logged in to view your dashboard." />;
  }

  const userName =
    session.user?.name ??
    (session.user as any)?.username ??
    (session.user as any)?.email ??
    "User";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Welcome, {userName}!</h1>
        <div className="hidden md:block text-muted-foreground">
          Logged in · <span className="font-mono text-xs">JWT</span> attached
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Start a Practice Quiz</CardTitle>
            <CardDescription>Pick categories & difficulty.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/start-quiz">Start Quiz</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Progress</CardTitle>
            <CardDescription>See trends and strengths.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/progress">View Progress</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tests Taken</CardTitle>
            <CardDescription>Review your attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/tests-taken">See Attempts</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Admin shortcut */}
        <Card>
          <CardHeader>
            <CardTitle>Admin</CardTitle>
            <CardDescription>Manage platform analytics.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            {(session.user as any)?.is_admin ? (
              <Button asChild className="w-full">
                <Link href="/admin/dashboard">Open Admin Dashboard</Link>
              </Button>
            ) : (
              <Button asChild className="w-full" variant="outline">
                <Link href="/admin">Enter Admin Passcode</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
