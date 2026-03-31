import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main className="page-wrap py-20">
        <section className="mx-auto max-w-3xl text-center space-y-6">
          <p className="eyebrow">PeakQuest</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Practice smarter. Improve faster.</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Build confidence with short focused quizzes, instant explanations, and clear progress tracking.
          </p>
          <div className="flex justify-center gap-3">
            <Button asChild size="lg"><Link href="/register">Sign up</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/login">Log in</Link></Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap py-10 space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">Start practice</CardTitle></CardHeader>
          <CardContent><Button asChild className="w-full"><Link href="/start-quiz">New session</Link></Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Continue learning</CardTitle></CardHeader>
          <CardContent><Button asChild variant="outline" className="w-full"><Link href="/dashboard">Open dashboard</Link></Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Review results</CardTitle></CardHeader>
          <CardContent><Button asChild variant="outline" className="w-full"><Link href="/tests-taken">View sessions</Link></Button></CardContent>
        </Card>
      </section>
    </main>
  );
}
