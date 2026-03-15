import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import QuizClient from "@/components/QuizClient";
import { getJson } from "@/lib/api";
import { Question } from "@/types";

interface ResumePageProps {
  params: { id: string };
}

type ResumeResponse = {
  questions: Question[];
  answersSoFar: Record<number, string>;
};

export default async function ResumePage({ params }: ResumePageProps) {
  const { id } = params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.backendToken) {
    return <p>Please log in to continue your quiz.</p>;
  }

  try {
    const data = await getJson<ResumeResponse>(`/api/quiz/resume/${id}`, {
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
      cache: "no-store",
    });

    return (
      <QuizClient
        attemptId={Number(id)}
        initialQuestions={data.questions}
        initialAnswers={data.answersSoFar}
      />
    );
  } catch {
    return <p>Error loading quiz.</p>;
  }
}
