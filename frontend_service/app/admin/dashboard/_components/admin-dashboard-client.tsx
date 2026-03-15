// app/admin/dashboard/_components/admin-dashboard-client.tsx
// Client-side dashboard that fetches admin analytics itself (sends cookies via credentials: 'include').

"use client";

import React, { useEffect, useState } from "react";
import { ApiError, getJson } from "@/lib/api";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";


// Types
type UserAnalytics = {
  id: number;
  username: string;
  quiz_count: number;
  average_score: number;
};

type PerformanceByCategory = {
  correct: number;
  total: number;
};

type AdminAnalyticsData = {
  total_quizzes_taken: number;
  average_score_all_users: number;
  performance_by_category: Record<string, PerformanceByCategory>;
  user_analytics: UserAnalytics[];
};

type Props = {
  /** Optional: if the server provided data; if not, we fetch here. */
  data?: AdminAnalyticsData;
};

export const AdminDashboardClient = ({ data }: Props) => {
  const { data: session } = useSession();
  const [state, setState] = useState<AdminAnalyticsData | null>(data ?? null);
  const [error, setError] = useState<null | "AccessDenied" | "LoadFailed">(null);


useEffect(() => {
  if (state !== null) return;
  if (!session) return; // wait until we have the user token

  (async () => {
    try {
      const resp = await getJson<AdminAnalyticsData>("/api/admin/analytics", {
        credentials: "include", // send admin_access_token cookie
        headers: {
          Authorization: session?.user?.backendToken
            ? `Bearer ${session.user.backendToken}`
            : "",
        },
      });
      setState(resp);
    } catch (e: unknown) {
      const status = e instanceof ApiError ? e.status : undefined;
      if (status === 401 || status === 403) setError("AccessDenied");
      else setError("LoadFailed");
    }
  })();
}, [state, session]);


  if (error === "AccessDenied") {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error === "LoadFailed") {
    return <p>Could not load admin analytics.</p>;
  }

  if (state === null) {
    return <p>Loading admin analytics…</p>;
  }

  const {
    total_quizzes_taken,
    average_score_all_users,
    performance_by_category,
    user_analytics,
  } = state;

  const categoryData = Object.entries(performance_by_category)
    .map(([category, { correct, total }]: [string, PerformanceByCategory]) => ({
      name: category,
      "Accuracy (%)":
        total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => a["Accuracy (%)"] - b["Accuracy (%)"]); // worst to best

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Quizzes Taken
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total_quizzes_taken}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Platform Average Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {average_score_all_users?.toFixed(1) ?? "N/A"}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user_analytics.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance By Category (All Users)</CardTitle>
          <CardDescription>
            The most difficult categories across the platform, sorted by lowest
            accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={categoryData}
              margin={{ top: 5, right: 30, left: 20, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                interval={0}
                height={100}
                tick={{ fontSize: 12 }}
              />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Legend />
              <Bar dataKey="Accuracy (%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Leaderboard</CardTitle>
          <CardDescription>
            Users sorted by their average score across all quizzes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead className="text-right">Quizzes Taken</TableHead>
                <TableHead className="text-right">Average Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user_analytics
                .sort(
                  (a: UserAnalytics, b: UserAnalytics) =>
                    b.average_score - a.average_score
                )
                .map((user: UserAnalytics) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.username}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.quiz_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.average_score.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
