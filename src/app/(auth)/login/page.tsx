"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/admin/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const data = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(data.get("email")),
      password: String(data.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) setError("E-Mail oder Passwort ist falsch.");
    else window.location.href = callbackUrl;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <span className="wordmark text-xl">Pharma<span className="dot" aria-hidden="true" /><b>Shift</b></span>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Anmelden</CardTitle>
          <CardDescription>Willkommen zurück.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full" onClick={() => signIn("google", { callbackUrl })}>
            Mit Google anmelden
          </Button>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">oder mit E-Mail</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Passwort</Label>
                <Link href="/reset" className="text-xs text-muted-foreground hover:underline">
                  Passwort vergessen?
                </Link>
              </div>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Wird angemeldet…" : "Anmelden"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Noch kein Konto?&nbsp;
          <Link href="/register" className="text-foreground hover:underline">Registrieren</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
