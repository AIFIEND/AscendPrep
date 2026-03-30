"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApiError, postJson } from "@/lib/api";
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
  const [accessCode, setAccessCode] = useState("");
  const [accountType, setAccountType] = useState<"institution" | "individual">("institution");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [codeErrorMsg, setCodeErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push("/login"), 1800);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const validateCode = async () => {
    if (accountType === "individual") {
      const normalizedAccessCode = accessCode.trim().toUpperCase();
      if (!normalizedAccessCode) {
        setCodeErrorMsg("Access code is required.");
        return false;
      }
      setIsValidatingCode(true);
      setCodeErrorMsg(null);
      try {
        await postJson("/api/access-codes/validate", { accessCode: normalizedAccessCode });
        return true;
      } catch (err) {
        setCodeErrorMsg(err instanceof ApiError ? err.message : "Invalid access code.");
        return false;
      } finally {
        setIsValidatingCode(false);
      }
    }

    const normalizedCode = institutionCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCodeErrorMsg("Institution code is required.");
      return false;
    }

    setIsValidatingCode(true);
    setCodeErrorMsg(null);

    try {
      await postJson("/api/institutions/validate-code", {
        institutionCode: normalizedCode,
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setCodeErrorMsg(
          "This preview is connected to an older backend. Update NEXT_PUBLIC_API_URL to the multi-tenant backend."
        );
        return false;
      }
      setCodeErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Invalid institution code. Ask your counselor for a valid code."
      );
      return false;
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const isCodeValid = await validateCode();
      if (!isCodeValid) return;

      await postJson("/api/register", {
        username,
        password,
        accountType,
        institutionCode: institutionCode.trim().toUpperCase(),
        accessCode: accessCode.trim().toUpperCase(),
      });
      setSuccess(true);
    } catch (err: any) {
      const msg =
        (err?.data && (err.data.message || err.data.error)) ||
        err?.message ||
        "Registration failed.";

      if (String(msg).toLowerCase().includes("institution code")) {
        setCodeErrorMsg(msg);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your student account</CardTitle>
          <CardDescription>
            Choose your onboarding path: institution code from your advisor, or individual purchase code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Alert>
              <AlertTitle>Account created successfully</AlertTitle>
              <AlertDescription>
                Your account is now linked to your institution. Redirecting to login so you can start practicing.
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

              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <Label className="font-semibold">Account type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={accountType === "institution" ? "default" : "outline"} onClick={() => { setAccountType("institution"); setCodeErrorMsg(null); }}>
                    Institution
                  </Button>
                  <Button type="button" variant={accountType === "individual" ? "default" : "outline"} onClick={() => { setAccountType("individual"); setCodeErrorMsg(null); }}>
                    Individual
                  </Button>
                </div>

                {accountType === "institution" ? (
                  <>
                    <Label htmlFor="institution-code" className="font-semibold">Institution code</Label>
                    <Input
                      id="institution-code"
                      value={institutionCode}
                      onChange={(e) => setInstitutionCode(e.target.value.toUpperCase())}
                      onBlur={validateCode}
                      required={accountType === "institution"}
                      className={codeErrorMsg ? "border-destructive" : ""}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the code your school or chapter advisor provided.
                    </p>
                  </>
                ) : (
                  <>
                    <Label htmlFor="access-code" className="font-semibold">Individual access code</Label>
                    <Input
                      id="access-code"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                      onBlur={validateCode}
                      required={accountType === "individual"}
                      className={codeErrorMsg ? "border-destructive" : ""}
                    />
                    <p className="text-xs text-muted-foreground">Enter the purchase code you received after checkout.</p>
                  </>
                )}
                {codeErrorMsg && <p className="text-sm text-destructive">{codeErrorMsg}</p>}
              </div>

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
              <Button type="submit" className="w-full" disabled={isSubmitting || isValidatingCode}>
                {isSubmitting ? "Creating..." : isValidatingCode ? "Validating code..." : "Create account"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Already have an account? <Link href="/login" className="underline">Log in</Link>.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
