import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { Button } from "@/components/ui/button";
import { SetupStatusNotice } from "@/components/setup/setup-status-notice";
import { Card, CardContent } from "@/components/ui/card";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="page-wrap space-y-14 py-10 sm:py-14">
      <section className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <SetupStatusNotice />
          <p className="eyebrow">PeakQuest Learning Platform</p>
          <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Build daily study momentum and turn weak areas into strengths.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Focused multiple-choice practice with clean feedback, progress visibility, and institution-level support for coaches.
          </p>

          {session ? (
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/start-quiz">Start practice session</Link>
              </Button>
              <Button variant="outline" asChild size="lg">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register">Create account</Link>
              </Button>
              <Button variant="outline" asChild size="lg">
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Students need an institution registration code to create an account.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm font-medium text-foreground">What this helps you do</p>
            <FeatureItem title="Prioritize what matters">
              Filter by category and difficulty so each session has a clear objective.
            </FeatureItem>
            <FeatureItem title="Learn immediately">
              Get explanation-based feedback right after every answer.
            </FeatureItem>
            <FeatureItem title="Track meaningful progress">
              Follow streaks, topic mastery, and score trends over time.
            </FeatureItem>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 border-t border-border/70 pt-10 md:grid-cols-3">
        <StepCard index="01" title="Choose focus">
          Pick the category, difficulty, and number of questions you want to train.
        </StepCard>
        <StepCard index="02" title="Practice with feedback">
          Work through one question at a time with concise explanation support.
        </StepCard>
        <StepCard index="03" title="Review and improve">
          Use your dashboard to spot weak patterns and run targeted follow-up sessions.
        </StepCard>
      </section>
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
    <div className="space-y-1 rounded-xl border border-border/70 bg-secondary/35 p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function StepCard({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-surface p-5">
      <p className="text-xs font-semibold tracking-[0.14em] text-primary/80">{index}</p>
      <p className="mt-2 text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
