"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyEmailAction } from "../actions";

function VerifyInner() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [text, setText] = useState("E-Mail wird bestätigt…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setText("Kein Token angegeben.");
      return;
    }
    verifyEmailAction(token).then((res) => {
      if (res.ok) {
        setState("ok");
        setText(res.message ?? "E-Mail bestätigt.");
      } else {
        setState("error");
        setText(res.error ?? "Bestätigung fehlgeschlagen.");
      }
    });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>{state === "ok" ? "Fertig!" : state === "error" ? "Hoppla" : "Moment…"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={state === "error" ? "text-destructive" : "text-muted-foreground"}>{text}</p>
          <Link href="/login" className="text-sm hover:underline">Zur Anmeldung</Link>
        </CardContent>
      </Card>
    </div>
  );
}


// Suspense-Umrandung (useSearchParams) für den Vercel-Build.
export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-muted/30" />}>
      <VerifyInner />
    </Suspense>
  );
}
