// Applies supabase/migrations/*.sql in order, once each (tracked in
// public._migrations). With --seed, also loads supabase/seed.sql (demo data).
// Usage: DATABASE_URL=... node scripts/migrate.mjs [--seed]
// Use the *direct* or *session* connection string (port 5432) for migrations.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "supabase", "migrations");

try {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table _migrations enable row level security`;
  const done = new Set((await sql`select name from _migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await readFile(path.join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${f})`;
    });
    console.log("applied", f);
  }
  if (process.argv.includes("--seed")) {
    await sql.unsafe(await readFile(path.join(process.cwd(), "supabase", "seed.sql"), "utf8"));
    console.log("seeded demo data");
  }
  console.log("database is up to date");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
