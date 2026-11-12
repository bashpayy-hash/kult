import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { logout } from "../login/actions";
import { AdminNav } from "../_nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Админка", template: "%s · Админка Shaqyru" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from applications where status = 'new'`;
  return (
    <div className="min-h-dvh">
      <header className="px-edge flex h-16 items-center justify-between md:h-20">
        <Logo href="/admin" suffix="Админка" />
        <form action={logout}>
          <button type="submit" className="link-quiet text-[14px]">
            Выйти
          </button>
        </form>
      </header>
      <AdminNav newApps={n} />
      <main className="px-edge pb-24 pt-8 md:pt-10">{children}</main>
    </div>
  );
}
