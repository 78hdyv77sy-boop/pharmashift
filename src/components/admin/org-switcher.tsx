"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[];
  activeOrgId: string | null;
}) {
  const { update } = useSession();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  if (orgs.length === 0) return null;

  async function onChange(orgId: string) {
    setPending(true);
    await update({ activeOrgId: orgId });
    router.refresh();
    setPending(false);
  }

  return (
    <Select value={activeOrgId ?? undefined} onValueChange={onChange} disabled={pending || orgs.length < 2}>
      <SelectTrigger className="w-56">
        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Organisation wählen" />
      </SelectTrigger>
      <SelectContent>
        {orgs.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
