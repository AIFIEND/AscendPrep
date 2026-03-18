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

export default function InstitutionsPage() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

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
    if (!token || session?.user?.role !== "superadmin") return;
    loadInstitutions().catch(() => setError("Failed to load institutions."));
  }, [token, session?.user?.role]);

  const filtered = useMemo(
    () => institutions.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [institutions, search]
  );

  if (session?.user?.role !== "superadmin") return <p className="text-sm text-destructive">Access denied.</p>;

  const createInstitution = async () => {
    if (!token) return;
    try {
      await postJson(
        "/api/superadmin/institutions",
        { name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setName("");
      await loadInstitutions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create institution.");
    }
  };

  const toggleAdmin = async (userId: number, makeAdmin: boolean) => {
    if (!token || !selected) return;
    await postJson(
      `/api/superadmin/institutions/${selected.id}/admins`,
      { user_id: userId, make_admin: makeAdmin },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await openInstitution(selected.id);
    await loadInstitutions();
  };

  const regenerateCode = async () => {
    if (!token || !selected) return;
    await postJson(
      `/api/superadmin/institutions/${selected.id}/code/regenerate`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await openInstitution(selected.id);
    await loadInstitutions();
  };

  const setStatus = async (isActive: boolean) => {
    if (!token || !selected) return;
    await apiFetch(`/api/superadmin/institutions/${selected.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
      headers: { Authorization: `Bearer ${token}` },
    });
    await openInstitution(selected.id);
    await loadInstitutions();
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

      {institutions.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>No institutions yet</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Create your first institution to start onboarding schools and counselors.</CardContent>
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
                      <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(selected.registration_code)}>Copy</Button>
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
                    <p className="text-xs text-muted-foreground">Promote or demote users to correct mistaken assignments at any time.</p>
                    {selected.users.map((user: any) => (
                      <div key={user.id} className="flex items-center justify-between rounded border p-2 text-sm">
                        <span>{user.username}</span>
                        <Button
                          size="sm"
                          variant={user.is_admin ? "destructive" : "outline"}
                          onClick={() => toggleAdmin(user.id, !user.is_admin)}
                        >
                          {user.is_admin ? "Remove admin" : "Make admin"}
                        </Button>
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
