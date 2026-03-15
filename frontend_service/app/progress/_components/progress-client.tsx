// app/progress/_components/progress-client.tsx
// UPDATED: Major rewrite to handle and display granular per-test data.

"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Define types locally for the client component
type ProgressRecord = {
  timestamp: string;
  test_name: string;
  category: string;
  score: number;
};

type OverallPerformance = {
  correct: number;
  total: number;
};

type ProgressData = {
  progress_data: ProgressRecord[];
  overall_performance: Record<string, OverallPerformance>;
};

interface ProgressClientProps {
  data: ProgressData;
}

export const ProgressClient = ({ data }: ProgressClientProps) => {
  const { overall_performance, progress_data } = data;

  // --- Overall Performance Chart (No Changes Needed Here) ---
  const overallData = Object.entries(overall_performance).map(([category, { correct, total }]: [string, OverallPerformance]) => ({
    name: category,
    'Accuracy (%)': total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b['Accuracy (%)'] - a['Accuracy (%)']);

  // --- UPDATED: Logic for Granular "Progress Over Time" Chart ---

  // 1. Get all unique categories to create a line for each one.
  const allCategories = Array.from(new Set(progress_data.map(p => p.category)));
  
  // 2. Group the data by test attempt (using timestamp as a unique identifier for an attempt)
  const attempts = progress_data.reduce((acc, record) => {
    const key = record.timestamp; // Each test has a unique timestamp
    if (!acc[key]) {
      acc[key] = {
        name: `${new Date(record.timestamp).toLocaleDateString()} - ${record.test_name}`,
        timestamp: record.timestamp,
      };
    }
    // Add the category score to this attempt's object
    acc[key][record.category] = Math.round(record.score);
    return acc;
  }, {} as Record<string, any>);

  // 3. Convert the grouped object into an array and sort by date
  const timeSeriesData = Object.values(attempts).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#a4de6c", "#d0ed57", "#ffc658"];

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Overall Performance by Category</CardTitle>
          <CardDescription>Your accuracy across all completed quizzes, sorted from highest to lowest.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto"><div className="min-w-[640px] h-[360px] sm:h-[400px]"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={overallData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" width={150} tick={{fontSize: 12}}/>
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Legend />
              <Bar dataKey="Accuracy (%)" fill="#8884d8" barSize={20} />
            </BarChart>
          </ResponsiveContainer></div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress Over Time</CardTitle>
          <CardDescription>Your score for each category within every test you've taken.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto"><div className="min-w-[680px] h-[360px] sm:h-[400px]"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeriesData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} tick={{fontSize: 12}}/>
              <YAxis domain={[0, 100]} unit="%"/>
              <Tooltip />
              <Legend wrapperStyle={{fontSize: "12px"}}/>
              {allCategories.map((category, index) => (
                <Line key={category} type="monotone" dataKey={category} stroke={colors[index % colors.length]} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer></div></div>
        </CardContent>
      </Card>
    </div>
  );
};