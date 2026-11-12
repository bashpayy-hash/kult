import "server-only";
import postgres from "postgres";

// One pool per server instance. On Netlify the database is Netlify Database
// and its connection string arrives as NETLIFY_DB_URL (the right branch for
// production or a preview). Anywhere else DATABASE_URL wins; a transaction
// pooler (Supabase 6543) does not support prepared statements — hence
// prepare: false.
declare global {
  var __shaqyruSql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error("DATABASE_URL (or NETLIFY_DB_URL on Netlify) is not set. See .env.example.");
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      // Keep calendar dates as 'YYYY-MM-DD' strings: a JS Date would shift
      // them through the server's time zone.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      // Sums and ratios are small enough for a JS number.
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

export function db(): postgres.Sql {
  if (!globalThis.__shaqyruSql) globalThis.__shaqyruSql = create();
  return globalThis.__shaqyruSql;
}
