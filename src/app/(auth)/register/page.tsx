"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { registerAction, getInvitationAction, acceptInvitationAction } from "../actions";

function RegisterInner() {
  const inviteToken = useSearchParams().get("invite");
  const [invite, setInvite] = useState<{ email: string; orgName: string; userExists: boolean } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    getInvitationAction(inviteToken).then((res) => {
      if (res.ok) setInvite({ email: res.email!, orgName: res.orgName!, userExists: res.userExists! });
      else setInviteError(res.error ?? "Einladung ungültig.");
    });
  }, [inviteToken]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const f = new FormData(e.currentTarget);

    if (inviteToken && invite) {
      const password = String(f.get("password"));
      const res = await acceptInvitationAction({
        token: inviteToken,
        name: String(f.get("name") || ""),
        password,
      });
      if (!res.ok) { setError(res.error ?? "Fehler"); setLoading(false); return; }
      await signIn("credentials", { email: invite.email, password, redirect: false });
      window.location.href = "/admin/dashboard";
      return;
    }

    const payload = {
      name: String(f.get("name")),
      orgName: String(f.get("orgName")),
      email: String(f.get("email")),
      password: String(f.get("password")),
      confirmPassword: String(f.get("confirmPassword")),
    };
    const res = await registerAction(payload);
    if (!res.ok) { setError(res.error ?? "Registrierung fehlgeschlagen."); setLoading(false); return; }
    await signIn("credentials", { email: payload.email, password: payload.password, redirect: false });
    window.location.href = "/admin/dashboard";
  }

  const isInvite = !!inviteToken;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isInvite ? "Einladung annehmen" : "Konto erstellen"}</CardTitle>
          <CardDescription>
            {isInvite
              ? invite
                ? `Du trittst „${invite.orgName}" bei.`
                : inviteError ?? "Einladung wird geprüft…"
              : "Lege deine Apotheken-Organisation an."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInvite && !invite ? (
            <p className="text-sm text-destructive">{inviteError ?? "Bitte warten…"}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {!isInvite && (
                <div className="space-y-2">
                  <Label htmlFor="orgName">Name der Apotheke / Organisation</Label>
                  <Input id="orgName" name="orgName" required />
                </div>
              )}
              {(!isInvite || !invite?.userExists) && (
                <div className="space-y-2">
                  <Label htmlFor="name">Dein Name</Label>
                  <Input id="name" name="name" required autoComplete="name" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" name="email" type="email" required defaultValue={invite?.email} readOnly={isInvite} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" name="password" type="password" required autoComplete="new-password" />
              </div>
              {!isInvite && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" required />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Bitte warten…" : isInvite ? "Beitreten" : "Registrieren"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Bereits ein Konto?&nbsp;
          <Link href="/login" className="text-foreground hover:underline">Anmelden</Link>
        </CardFooter>
      </Card>
    </div>
  );
}


// Suspense-Umrandung (useSearchParams) für den Vercel-Build.
export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-muted/30" />}>
      <RegisterInner />
    </Suspense>
  );
}
