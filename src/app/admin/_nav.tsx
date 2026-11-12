"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/applications", label: "Заявки" },
  { href: "/admin/members", label: "Участницы" },
  { href: "/admin/venues", label: "Заведения" },
  { href: "/admin/links", label: "Ссылки" },
];

export function AdminNav({ newApps }: { newApps: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Разделы" className="px-edge border-b border-line">
      <ul className="-mx-1 flex gap-5 overflow-x-auto py-1 [scrollbar-width:none]">
        {ITEMS.map((it) => {
          const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-[14px] font-medium transition-colors duration-150 ${
                  active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {it.label}
                {it.href === "/admin/applications" && newApps > 0 ? (
                  <span className="rounded-full bg-accent px-1.5 text-[12px] font-semibold leading-5 text-canvas">{newApps}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
