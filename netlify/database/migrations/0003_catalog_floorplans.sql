-- Catalog and table booking (owner, 12 Nov 2026: a friend's app where venues
-- show their floor plan and guests book a specific table at a specific time).
--  • venues get catalog flags, opening hours, slot step and how long a table
--    is held per booking;
--  • venue_halls / venue_tables describe the floor plan (tables and decor);
--  • guest_bookings can now come from the catalog (no member link), carry a
--    table, and two live bookings can never hold one table at the same time
--    (exclusion constraint, so even simultaneous requests cannot double-book).

-- btree_gist gives uuid an equality operator for GiST exclusion constraints.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'extensions') then
    create extension if not exists btree_gist with schema extensions;
  else
    create extension if not exists btree_gist;
  end if;
end $$;

-- New public routes: /v/<venue>, /join, /places.
create or replace function is_reserved_slug(s text) returns boolean
language sql immutable as $$
  select s = any (array['admin','h','api','privacy','_next','static','public',
                        'favicon.ico','robots.txt','icon','apple-icon','login','uploads',
                        'v','join','places','og.jpg','fonts','illustrations'])
$$;

-- ── venues: catalog and hours ─────────────────────────────────────────────
alter table venues
  add column is_listed    boolean not null default false,  -- shown on / and /places
  add column featured     boolean not null default false,  -- «Популярные заведения»
  add column open_time    time    not null default '12:00',
  add column close_time   time    not null default '23:00', -- ≤ open_time means after midnight
  add column slot_minutes int     not null default 30 check (slot_minutes in (15, 30, 60)),
  add column hold_minutes int     not null default 120 check (hold_minutes between 30 and 480);

-- ── floor plan ────────────────────────────────────────────────────────────
-- Coordinates are plan units: a hall is width × height units (default 100 × 64),
-- every item is a box x, y, w, h inside it.
create table venue_halls (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  name       text not null,
  name_kk    text,
  width      int  not null default 100 check (width between 20 and 400),
  height     int  not null default 64  check (height between 20 and 400),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index venue_halls_venue_idx on venue_halls (venue_id, sort);

create table venue_tables (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  hall_id    uuid not null references venue_halls(id) on delete cascade,
  kind       text not null default 'table' check (kind in ('table', 'decor')),
  label      text not null default '',
  shape      text not null default 'rect' check (shape in ('rect', 'round')),
  x          numeric(6,2) not null default 0,
  y          numeric(6,2) not null default 0,
  w          numeric(6,2) not null default 10 check (w > 0),
  h          numeric(6,2) not null default 10 check (h > 0),
  seats_min  int not null default 1 check (seats_min between 1 and 50),
  seats_max  int not null default 4 check (seats_max between 1 and 50),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint venue_tables_seats check (seats_min <= seats_max)
);
create index venue_tables_venue_idx on venue_tables (venue_id);
create index venue_tables_hall_idx on venue_tables (hall_id);

-- ── guest_bookings: catalog bookings, tables, no double booking ───────────
alter table guest_bookings add column venue_id uuid references venues(id) on delete restrict;
update guest_bookings b set venue_id = tl.venue_id from tracking_links tl where tl.id = b.tracking_link_id;
alter table guest_bookings alter column venue_id set not null;
alter table guest_bookings alter column tracking_link_id drop not null;
alter table guest_bookings
  add column source       text not null default 'link' check (source in ('link', 'catalog')),
  add column table_id     uuid references venue_tables(id) on delete set null,
  add column hold_minutes int  not null default 120 check (hold_minutes between 30 and 480),
  add column starts_at    timestamp generated always as (booking_date + booking_time) stored,
  add constraint guest_bookings_source_link check ((source = 'link') = (tracking_link_id is not null));
alter table guest_bookings
  add constraint guest_bookings_no_overlap exclude using gist (
    table_id with =,
    tsrange(starts_at, starts_at + make_interval(mins => hold_minutes)) with &&
  ) where (table_id is not null and status in ('new', 'arrived'));
create index guest_bookings_venue_idx on guest_bookings (venue_id, starts_at);

-- ── guest_visits: a catalog guest who came has no member link ─────────────
alter table guest_visits add column venue_id uuid references venues(id) on delete restrict;
update guest_visits gv set venue_id = tl.venue_id from tracking_links tl where tl.id = gv.tracking_link_id;
alter table guest_visits alter column venue_id set not null;
alter table guest_visits alter column tracking_link_id drop not null;
alter table guest_visits add constraint guest_visits_phrase_link check (source <> 'phrase' or tracking_link_id is not null);
create index guest_visits_venue_idx on guest_visits (venue_id, visit_date);

alter table venue_halls  enable row level security;
alter table venue_tables enable row level security;
