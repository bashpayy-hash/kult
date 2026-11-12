import { redirect } from "next/navigation";

// While the catalog is small the main screen is the full list; old links to
// «Смотреть все» keep working (12 Nov 2026).
export default async function Places({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  redirect(c ? `/?c=${encodeURIComponent(c)}` : "/");
}
