// app/register/page.tsx
// Client page: create account -> show success -> auto-redirect to /login (and offer a button).

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [institutionCode, setInstitutionCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // After success, auto-redirect to /login in ~1.5s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await postJson("/api/register", { username, password, institutionCode });
      setSuccess(true);
    } catch (err: any) {
      const msg =
        (err?.data && (err.data.message || err.data.error)) ||
        err?.message ||
        "Registration failed.";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Already have one?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Alert>
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>
                Your account was created. Redirecting to{" "}
                <span className="font-medium">Login</span>…
              </AlertDescription>
              <div className="mt-4">
                <Button asChild className="w-full">
                  <Link href="/login">Continue to Login</Link>
                </Button>
              </div>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <Alert className="border-destructive/50" role="status" aria-live="polite">
                  <AlertTitle>Couldn’t register</AlertTitle>
                  <AlertDescription>{errorMsg}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="institutionCode">Institution Code</Label>
                <Input
                  id="institutionCode"
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <p className="text-xs text-muted-foreground">Use at least 8 characters for a stronger password.</p>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
