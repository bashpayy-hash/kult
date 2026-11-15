-- Phase 2 of the owner's plan (15 Nov 2026): «расширить концепт… кебабку,
-- тонерку, чайхану… overall систему бронирования с системой блата… каждый
-- будет делиться своими пиками».
--
--  • Two more kinds of place: chaikhana and kebab / street food.
--  • Anyone can recommend a place: a recommender gets a personal link (a
--    «pick») for a venue; friends book through it.
--  • Blat points only for a visit the hostess confirmed: one point per guest
--    who came (at most six a booking), none when the guest is the recommender
--    by phone. Points buy treats the venue offers, never money.

-- ── categories ─────────────────────────────────────────────────────────────
alter table venues drop constraint venues_category_check;
alter table venues add constraint venues_category_check
  check (category in ('restaurant','cafe','bar','chaikhana','street','beauty','wellness','fitness','other'));

-- ── recommenders: anyone, no login; the secret opens their own page ───────
create table recommenders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  phone      text not null check (length(phone) between 8 and 20),
  secret     text not null unique check (length(secret) >= 24),
  consent    boolean not null check (consent),
  lang       text,
  created_at timestamptz not null default now()
);
create index recommenders_phone_idx on recommenders (phone);

-- ── picks: one recommender × one venue, opened at /p/<code> ───────────────
create table picks (
  id             uuid primary key default gen_random_uuid(),
  recommender_id uuid not null references recommenders(id) on delete cascade,
  venue_id       uuid not null references venues(id) on delete cascade,
  code           text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  note           text check (note is null or length(note) <= 200),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (recommender_id, venue_id)
);
create index picks_venue_idx on picks (venue_id);

create table pick_opens (
  id           bigint generated always as identity primary key,
  pick_id      uuid not null references picks(id) on delete cascade,
  visitor_hash text,
  is_bot       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index pick_opens_pick_idx on pick_opens (pick_id, created_at);

-- ── bookings through a pick ───────────────────────────────────────────────
alter table guest_bookings add column pick_id uuid references picks(id) on delete set null;
alter table guest_bookings drop constraint guest_bookings_source_check;
alter table guest_bookings add constraint guest_bookings_source_check check (source in ('link', 'catalog', 'pick'));
create index guest_bookings_pick_idx on guest_bookings (pick_id) where pick_id is not null;

-- ── rewards: treats a venue gives for points ──────────────────────────────
create table blat_rewards (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  title      text not null check (length(trim(title)) between 1 and 80),
  title_kk   text check (title_kk is null or length(title_kk) <= 80),
  cost       int  not null check (cost between 1 and 100),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index blat_rewards_venue_idx on blat_rewards (venue_id);

-- A treat taken: a short code the guest shows the hostess.
create table blat_redemptions (
  id             uuid primary key default gen_random_uuid(),
  recommender_id uuid not null references recommenders(id) on delete cascade,
  reward_id      uuid not null references blat_rewards(id) on delete restrict,
  venue_id       uuid not null references venues(id) on delete cascade,
  code           text not null unique check (code ~ '^[0-9]{6}$'),
  status         text not null default 'issued' check (status in ('issued', 'used', 'cancelled')),
  created_at     timestamptz not null default now(),
  used_at        timestamptz
);
create index blat_redemptions_venue_idx on blat_redemptions (venue_id, status);

-- ── the ledger: the balance is the sum ────────────────────────────────────
create table blat_points (
  id             bigint generated always as identity primary key,
  recommender_id uuid not null references recommenders(id) on delete cascade,
  delta          int  not null check (delta <> 0),
  reason         text not null check (reason in ('visit', 'redeem', 'adjust')),
  booking_id     uuid unique references guest_bookings(id) on delete cascade,
  redemption_id  uuid unique references blat_redemptions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint blat_points_reason check (
    (reason = 'visit') = (booking_id is not null) and (reason = 'redeem') = (redemption_id is not null))
);
create index blat_points_recommender_idx on blat_points (recommender_id);

alter table recommenders     enable row level security;
alter table picks            enable row level security;
alter table pick_opens       enable row level security;
alter table blat_rewards     enable row level security;
alter table blat_redemptions enable row level security;
alter table blat_points      enable row level security;

-- Demo treats for the fictional venues of 0005 (no-op where they are gone).
insert into blat_rewards (venue_id, title, title_kk, cost)
select v.id, r.title, r.title_kk, r.cost
from (values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Домашний лимонад от бара', 'Бардан үй лимонады', 3),
  ('cccccccc-0003-4ccc-8ccc-000000000003', 'Десерт от шефа', 'Шефтен десерт', 3),
  ('cccccccc-0003-4ccc-8ccc-000000000003', 'Паста для двоих', 'Екі адамға паста', 10),
  ('cccccccc-0004-4ccc-8ccc-000000000004', 'Фильтр-кофе и круассан', 'Фильтр-кофе мен круассан', 2)
) as r (venue_id, title, title_kk, cost)
join venues v on v.id = r.venue_id::uuid;

-- New public routes: /blat (and /venues/… for the demo entry photos).
create or replace function is_reserved_slug(s text) returns boolean
language sql immutable as $$
  select s = any (array['admin','h','api','privacy','_next','static','public',
                        'favicon.ico','robots.txt','icon','apple-icon','login','uploads',
                        'v','join','places','og.jpg','fonts','illustrations','blat','venues'])
$$;
