"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiError, getJson, postJson } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Institution = {
  id: number;
  name: string;
  registration_code: string;
  user_count?: number;
};

export default function SuperAdminPage() {
  const { data: session } = useSession();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const token = session?.user?.backendToken;
  const isSuperAdmin = !!session?.user?.is_super_admin;

  const loadInstitutions = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getJson<Institution[]>("/api/superadmin/institutions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInstitutions(data);
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError("You do not have permission to view super admin data.");
      } else {
        setError("Failed to load institutions.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void loadInstitutions();
    }
  }, [token]);

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setCreating(true);
    setError(null);
    setCreatedCode(null);

    try {
      const created = await postJson<Institution>(
        "/api/superadmin/institutions",
        { name: schoolName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCreatedCode(created.registration_code);
      setSchoolName("");
      await loadInstitutions();
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? (typeof e.data === "object" && e.data && "message" in e.data
              ? String((e.data as { message?: unknown }).message)
              : e.message)
          : "Failed to create institution.";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  if (!session) {
    return <p className="p-6">Please sign in to access this page.</p>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This page is only available to super admins.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Super Admin - Institutions</CardTitle>
          <CardDescription>Create schools and distribute registration codes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateInstitution} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="schoolName">School Name</Label>
              <Input
                id="schoolName"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Example High School"
                required
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Institution"}
            </Button>
          </form>

          {createdCode && (
            <Alert className="mt-4">
              <AlertTitle>Institution created</AlertTitle>
              <AlertDescription>
                New registration code: <span className="font-semibold">{createdCode}</span>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="mt-4 border-destructive/50">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Institutions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading institutions...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School Name</TableHead>
                  <TableHead>Registration Code</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {institutions.map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell>{inst.name}</TableCell>
                    <TableCell className="font-mono">{inst.registration_code}</TableCell>
                    <TableCell className="text-right">{inst.user_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
