"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestPasswordResetAction, resetPasswordAction } from "../actions";

export default function ResetPage() {
  const token = useSearchParams().get("token");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await requestPasswordResetAction({ email: String(f.get("email")) });
    setLoading(false);
    res.ok ? setMsg(res.message ?? "Link versendet.") : setError(res.error ?? "Fehler");
  }

  async function onReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await resetPasswordAction({
      token,
      password: String(f.get("password")),
      confirmPassword: String(f.get("confirmPassword")),
    });
    setLoading(false);
    res.ok ? setMsg(res.message ?? "Passwort geändert.") : setError(res.error ?? "Fehler");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{token ? "Neues Passwort setzen" : "Passwort zurücksetzen"}</CardTitle>
          <CardDescription>
            {token ? "Wähle ein neues Passwort." : "Wir senden dir einen Link per E-Mail."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <form onSubmit={onRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              {msg && <p className="text-sm text-emerald-600">{msg}</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Senden…" : "Link senden"}
              </Button>
            </form>
          ) : (
            <form onSubmit={onReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Neues Passwort</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" required />
              </div>
              {msg && <p className="text-sm text-emerald-600">{msg}</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Speichern…" : "Passwort speichern"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="hover:underline">Zurück zur Anmeldung</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
