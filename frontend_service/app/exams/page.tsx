// app/exams/page.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Define a type for our exam objects for better code safety
type Exam = {
  id: string;
  title: string;
  description: string;
};

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data from the API route we created
    fetch('/api/exams')
      .then((res) => res.json())
      .then((data) => {
        setExams(data);
        setLoading(false);
      })
      .catch(() => {
        setExams([]);
        setLoading(false);
      });
  }, []); // The empty array ensures this effect runs only once

  if (loading) {
    return <p className="text-center text-gray-500">Loading exams...</p>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Available Exams</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.length > 0 ? (
          exams.map((exam) => (
            <Link
              href={`/exams/${exam.id}`}
              key={exam.id}
              className="block p-6 bg-white border rounded-lg shadow hover:shadow-xl transition-shadow"
            >
              <h2 className="text-xl font-semibold text-blue-700">{exam.title}</h2>
              <p className="mt-2 text-gray-600">{exam.description}</p>
            </Link>
          ))
        ) : (
          <p className="text-gray-500">No exams available at this time.</p>
        )}
      </div>
    </div>
  );
}
