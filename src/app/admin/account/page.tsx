import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mein Konto</h1>
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
