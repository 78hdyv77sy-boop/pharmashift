import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPublicMenu, type PublicMenuItem } from "@/lib/cms/menus";

function NavLink({ item }: { item: PublicMenuItem }) {
  if (item.children.length > 0) {
    return (
      <div className="group relative">
        <span className="cursor-default text-sm text-muted-foreground hover:text-foreground">{item.label}</span>
        <div className="absolute left-0 top-full hidden min-w-[160px] rounded-md border bg-background p-1 shadow-md group-hover:block">
          {item.children.map((c) => (
            <Link key={c.id} href={c.href} target={c.target ?? undefined} className="block rounded-sm px-3 py-1.5 text-sm hover:bg-secondary">
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }
  return (
    <Link href={item.href} target={item.target ?? undefined} className="text-sm text-muted-foreground hover:text-foreground">
      {item.label}
    </Link>
  );
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [org, main, footer] = await Promise.all([
    prisma.organization.findUnique({ where: { slug: orgSlug }, select: { name: true } }),
    getPublicMenu(orgSlug, "main"),
    getPublicMenu(orgSlug, "footer"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href={`/${orgSlug}`} className="font-semibold">{org?.name ?? "PharmaShift"}</Link>
          <nav className="flex items-center gap-5">
            {main.map((item) => <NavLink key={item.id} item={item} />)}
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} {org?.name}</p>
          <nav className="flex flex-wrap gap-4">
            {footer.map((item) => (
              <Link key={item.id} href={item.href} target={item.target ?? undefined} className="text-sm text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
