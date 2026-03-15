// app/page.tsx
// Homepage: hero, value prop, and clear Login / Register buttons.
// If logged in, shows "Go to Dashboard" + "Start a Practice Quiz" instead.

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

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-[calc(100vh-8rem)] flex flex-col">
      {/* HERO */}
      <section className="flex-1 flex items-center">
        <div className="container mx-auto px-4 py-16 grid gap-10 md:grid-cols-2">
          <div className="space-y-6">
            <span className="inline-block text-xs tracking-widest uppercase text-muted-foreground">
              DECA Practice Web App
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Practice smarter. <span className="text-primary">Score higher.</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Targeted multiple-choice practice with instant feedback, progress
              tracking, and admin analytics. Built for DECA competitors and teachers.
            </p>

            {session ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
                <Button variant="outline" asChild size="lg">
                  <Link href="/start-quiz">Start a Practice Quiz</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/register">Register</Link>
                </Button>
                <Button variant="outline" asChild size="lg">
                  <Link href="/login">Login</Link>
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              No credit card required. Free to get started.
            </p>
          </div>

          {/* Visual / value card */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Why you’ll love it</CardTitle>
              <CardDescription>
                Practice that adapts to you and shows real progress.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeatureItem title="Smart Practice">
                Filter by category & difficulty to focus where it matters.
              </FeatureItem>
              <FeatureItem title="Instant Feedback">
                See explanations after each question to lock in learning.
              </FeatureItem>
              <FeatureItem title="Progress Tracking">
                Visualize improvement over time and spot weak areas.
              </FeatureItem>
              <FeatureItem title="Admin Insights">
                Coaches/teachers can view platform-wide analytics.
              </FeatureItem>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-12 border-t">
        <div className="container mx-auto px-4 grid gap-6 md:grid-cols-3">
          <StepCard index={1} title="Register">
            Create an account to save attempts and track improvement.
          </StepCard>
          <StepCard index={2} title="Practice">
            Choose categories/difficulties and get instant feedback.
          </StepCard>
          <StepCard index={3} title="Improve">
            Review your stats on the Progress page and level up.
          </StepCard>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4 text-sm text-muted-foreground flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <span>© {new Date().getFullYear()} DECA Practice</span>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <Link className="hover:underline" href="/start-quiz">Quick Start</Link>
            <Link className="hover:underline" href="/login">Login</Link>
            <Link className="hover:underline" href="/register">Register</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureItem({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function StepCard({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
            {index}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}
