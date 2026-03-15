'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Exam = {
  id: string;
  title: string;
  description: string;
};

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/exams')
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data) => {
        setExams(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-center text-gray-500">Loading exams...</p>;

  if (error) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardHeader><CardTitle>Could not load exams</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">Please retry or return to dashboard.</p>
          <div className="flex gap-2">
            <Button asChild><Link href="/exams">Retry</Link></Button>
            <Button variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Available Exams</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.length > 0 ? (
          exams.map((exam) => (
            <Link href={`/exams/${exam.id}`} key={exam.id} className="block p-6 bg-card border rounded-lg shadow hover:shadow-xl transition-shadow">
              <h2 className="text-xl font-semibold">{exam.title}</h2>
              <p className="mt-2 text-muted-foreground">{exam.description}</p>
            </Link>
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-6 space-y-3">
              <p className="text-muted-foreground">No exams available at this time.</p>
              <Button asChild><Link href="/start-quiz">Start Practice Quiz</Link></Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
