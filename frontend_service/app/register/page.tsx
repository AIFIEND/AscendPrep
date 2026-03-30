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
  const [validatedInstitutionName, setValidatedInstitutionName] = useState<string | null>(null);
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

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
        setAccessCodeValidated(false);
        return false;
      }
      setIsValidatingCode(true);
      setCodeErrorMsg(null);
      try {
        await postJson("/api/access-codes/validate", { accessCode: normalizedAccessCode });
        setAccessCodeValidated(true);
        return true;
      } catch (err) {
        setCodeErrorMsg(err instanceof ApiError ? err.message : "Invalid access code.");
        setAccessCodeValidated(false);
        return false;
      } finally {
        setIsValidatingCode(false);
      }
    }

    const normalizedCode = institutionCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCodeErrorMsg("Institution code is required.");
      setValidatedInstitutionName(null);
      return false;
    }

    setIsValidatingCode(true);
    setCodeErrorMsg(null);

    try {
      const validation = await postJson<{ institution_name: string }>("/api/institutions/validate-code", {
        institutionCode: normalizedCode,
      });
      setValidatedInstitutionName(validation.institution_name);
      return true;
    } catch (err: unknown) {
      setCodeErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Invalid institution code. Ask your advisor or teacher for a valid code."
      );
      setValidatedInstitutionName(null);
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
      setSuccessMsg(
        accountType === "institution"
          ? `Account created and linked to ${validatedInstitutionName ?? "your institution"}.`
          : "Individual account created successfully. You can now sign in and start practicing."
      );
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
          <CardTitle>Create your learner account</CardTitle>
          <CardDescription>
            Join through an institution/program code from your advisor/teacher, or use an individual access code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Alert>
                <AlertTitle>Account created successfully</AlertTitle>
                <AlertDescription>
                {successMsg} Redirecting to login.
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
                      Use the code your institution, department, or program advisor provided.
                    </p>
                    {validatedInstitutionName && (
                      <p className="text-xs text-emerald-600">Code verified for: <span className="font-semibold">{validatedInstitutionName}</span></p>
                    )}
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
                    {accessCodeValidated && (
                      <p className="text-xs text-emerald-600">Access code verified. You can finish registration.</p>
                    )}
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
