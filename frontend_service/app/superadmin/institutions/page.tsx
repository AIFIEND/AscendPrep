"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiError, getJson, postJson, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resolveRole } from "@/lib/role-navigation";
import { AccessDeniedState } from "@/components/access-denied-state";

export default function InstitutionsPage() {
  const { data: session } = useSession();
  const role = resolveRole(session?.user);
  const token = session?.user?.backendToken;

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadInstitutions = async () => {
    if (!token) return;
    const data = await getJson<any[]>("/api/superadmin/institutions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setInstitutions(data);
    if (selected) {
      const refreshed = data.find((d) => d.id === selected.id);
      if (refreshed) {
        await openInstitution(refreshed.id);
      }
    }
  };

  const openInstitution = async (id: number) => {
    if (!token) return;
    const detail = await getJson(`/api/superadmin/institutions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSelected(detail);
  };

  useEffect(() => {
    if (!token || role !== "superadmin") return;
    loadInstitutions().catch(() => setError("Failed to load institutions."));
  }, [token, role]);

  const filtered = useMemo(
    () => institutions.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [institutions, search]
  );

  if (role !== "superadmin") {
    return (
      <AccessDeniedState
        description="Only superadmins can manage institutions."
        actionHref="/dashboard"
        actionLabel="Go to my dashboard"
      />
    );
  }

  const createInstitution = async () => {
    if (!token) return;
    try {
      setError("");
      const created = await postJson<{ id: number; registration_code: string; name: string }>(
        "/api/superadmin/institutions",
        { name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setName("");
      await loadInstitutions();
      await openInstitution(created.id);
      setSuccess(`Institution "${created.name}" created. Registration code: ${created.registration_code}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create institution.");
    }
  };

  const toggleAdmin = async (userId: number, makeAdmin: boolean) => {
    if (!token || !selected) return;
    try {
      setError("");
      await postJson(
        `/api/superadmin/institutions/${selected.id}/admins`,
        { user_id: userId, make_admin: makeAdmin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await openInstitution(selected.id);
      await loadInstitutions();
      setSuccess(`Updated admin access for user.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update admin status.");
    }
  };

  const regenerateCode = async () => {
    if (!token || !selected) return;
    try {
      setError("");
      await postJson(
        `/api/superadmin/institutions/${selected.id}/code/regenerate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await openInstitution(selected.id);
      await loadInstitutions();
      setSuccess("Registration code regenerated.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not regenerate registration code.");
    }
  };

  const setStatus = async (isActive: boolean) => {
    if (!token || !selected) return;
    try {
      setError("");
      await apiFetch(`/api/superadmin/institutions/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
        headers: { Authorization: `Bearer ${token}` },
      });
      await openInstitution(selected.id);
      await loadInstitutions();
      setSuccess(`Institution ${isActive ? "activated" : "deactivated"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update institution status.");
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setSuccess("Registration code copied to clipboard.");
  };

  const setUserStatus = async (userId: number, isActive: boolean) => {
    if (!token) return;
    try {
      setError("");
      await apiFetch(`/api/superadmin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (selected) {
        await openInstitution(selected.id);
      }
      await loadInstitutions();
      setSuccess(`User ${isActive ? "reactivated" : "deactivated"} successfully.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update user status.");
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Institutions</h1>
          <p className="text-muted-foreground">Create institutions, issue codes, and assign institution admins explicitly.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Create Institution</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create institution</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Institution name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button onClick={createInstitution} className="w-full" disabled={!name.trim()}>Create and generate code</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <Alert>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {institutions.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>No institutions yet</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Create your first institution to start onboarding schools and counselors.</p>
            <p>After creating it, copy the registration code and share it with that institution.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Institution list</CardTitle>
              <CardDescription>Search and select an institution to manage admins and registration codes.</CardDescription>
              <Input placeholder="Search institutions" value={search} onChange={(e) => setSearch(e.target.value)} />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Admins</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inst) => (
                    <TableRow key={inst.id} className="cursor-pointer" onClick={() => openInstitution(inst.id)}>
                      <TableCell className="font-medium">{inst.name}</TableCell>
                      <TableCell className="text-right">{inst.users}</TableCell>
                      <TableCell className="text-right">{inst.admins}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Institution details</CardTitle>
              <CardDescription>Assign and correct institution admin roles from this panel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">Select an institution to see details.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Institution</p>
                    <p className="font-semibold">{selected.name}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 border rounded p-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Registration code</p>
                      <p className="font-mono text-lg">{selected.registration_code}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyCode(selected.registration_code)}>Copy code</Button>
                      <Button size="sm" variant="outline" onClick={regenerateCode}>Regenerate</Button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStatus(!selected.is_active)}>
                      {selected.is_active ? "Deactivate institution" : "Activate institution"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <p className="font-medium">Admin management</p>
                    <p className="text-xs text-muted-foreground">Promote or demote users, and deactivate accounts while preserving quiz history.</p>
                    {selected.users.map((user: any) => (
                      <div key={user.id} className="flex items-center justify-between rounded border p-2 text-sm">
                        <div>
                          <p>{user.username}</p>
                          <p className="text-xs text-muted-foreground">{user.is_active ? "Active" : "Deactivated"}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={user.is_admin ? "destructive" : "outline"}
                            onClick={() => toggleAdmin(user.id, !user.is_admin)}
                          >
                            {user.is_admin ? "Remove admin" : "Make admin"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant={user.is_active ? "destructive" : "outline"}>
                                {user.is_active ? "Deactivate" : "Reactivate"}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {user.is_active ? "Deactivate this account?" : "Reactivate this account?"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {user.is_active
                                    ? "The user will not be able to log in until reactivated. Historical quiz records are preserved."
                                    : "The user will regain access to log in."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => setUserStatus(user.id, !user.is_active)}>
                                  Confirm
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
