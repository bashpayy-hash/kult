-- Kult pilot: schema.
-- Every table has RLS on and no policies: the anon/authenticated keys of
-- Supabase see nothing through PostgREST. The app talks to Postgres directly
-- (DATABASE_URL) as the database owner, which bypasses RLS.
-- Enumerations are text + check, so a new value is one constraint change.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Slugs live in the public URL /<member>/<venue>; these collide with routes.
create or replace function is_reserved_slug(s text) returns boolean
language sql immutable as $$
  select s = any (array['admin','h','api','privacy','_next','static','public',
                        'favicon.ico','robots.txt','icon','apple-icon','login','uploads'])
$$;

-- ── applications ───────────────────────────────────────────────────────────
create table applications (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('member','partner')),
  status       text not null default 'new' check (status in ('new','approved','rejected')),
  -- member fields
  name         text,
  age          int,
  city         text,
  instagram    text,
  interests    text,
  -- partner fields
  venue_name   text,
  category     text,
  contact_name text,
  phone        text,
  avg_check    int check (avg_check is null or avg_check >= 0),
  consent      boolean not null check (consent),
  consent_at   timestamptz not null default now(),
  lang         text check (lang in ('ru','kk')),
  review_note  text,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint applications_member_fields check (
    kind <> 'member' or (name is not null and age between 18 and 99 and city is not null and instagram is not null)
  ),
  constraint applications_partner_fields check (
    kind <> 'partner' or (venue_name is not null and category is not null and contact_name is not null and phone is not null)
  )
);
create index applications_status_idx on applications (status, created_at desc);

-- ── members ────────────────────────────────────────────────────────────────
create table members (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$' and not is_reserved_slug(slug)),
  name           text not null check (length(trim(name)) > 0),
  age            int not null check (age between 18 and 99),
  city           text not null default 'Алматы',
  instagram      text,
  followers      int check (followers is null or followers >= 0),
  interests      text,
  phone          text,
  status         text not null default 'active' check (status in ('active','paused','archived')),
  notes          text,
  application_id uuid references applications(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger members_updated_at before update on members
  for each row execute function set_updated_at();

-- ── venues ─────────────────────────────────────────────────────────────────
create table venues (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$' and not is_reserved_slug(slug)),
  name           text not null check (length(trim(name)) > 0),
  category       text not null default 'restaurant'
                   check (category in ('restaurant','cafe','bar','beauty','wellness','fitness','other')),
  description    text,
  description_kk text,
  address        text,
  city           text not null default 'Алматы',
  instagram      text,
  contact_name   text,
  phone          text,
  avg_check      int check (avg_check is null or avg_check >= 0),
  photo_path     text,
  host_token     text not null unique check (length(host_token) >= 24),
  status         text not null default 'active' check (status in ('active','paused','archived')),
  notes          text,
  application_id uuid references applications(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger venues_updated_at before update on venues
  for each row execute function set_updated_at();

-- ── offers: what the member gets (offer) and what her followers get (perk) ─
create table offers (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references venues(id) on delete cascade,
  title               text not null,
  member_reward       text not null,
  member_reward_value int check (member_reward_value is null or member_reward_value >= 0),
  guest_perk          text,
  guest_perk_kk       text,
  terms               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index offers_venue_idx on offers (venue_id);
create trigger offers_updated_at before update on offers
  for each row execute function set_updated_at();

-- ── tracking_links: one member × one venue ────────────────────────────────
create table tracking_links (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete restrict,
  venue_id    uuid not null references venues(id) on delete restrict,
  offer_id    uuid references offers(id) on delete set null,
  code_phrase text,              -- null → «я от {member.name}»
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, venue_id)
);
create index tracking_links_venue_idx on tracking_links (venue_id);
create trigger tracking_links_updated_at before update on tracking_links
  for each row execute function set_updated_at();

-- ── member_visits: the member came and received the offer ─────────────────
create table member_visits (
  id               uuid primary key default gen_random_uuid(),
  tracking_link_id uuid not null references tracking_links(id) on delete restrict,
  visit_date       date not null,
  received         text,
  reward_value     int check (reward_value is null or reward_value >= 0),
  source           text not null default 'admin' check (source in ('host','admin')),
  notes            text,
  created_at       timestamptz not null default now()
);
create index member_visits_link_idx on member_visits (tracking_link_id, visit_date);

-- ── content_proofs: the story she posted after the visit ──────────────────
create table content_proofs (
  id              uuid primary key default gen_random_uuid(),
  member_visit_id uuid not null references member_visits(id) on delete cascade,
  kind            text not null default 'story' check (kind in ('story','post','reel')),
  screenshot_path text,
  views           int check (views is null or views >= 0),
  posted_at       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index content_proofs_visit_idx on content_proofs (member_visit_id);
create trigger content_proofs_updated_at before update on content_proofs
  for each row execute function set_updated_at();

-- ── link_clicks: every open of /<member>/<venue> ──────────────────────────
create table link_clicks (
  id               bigint generated always as identity primary key,
  tracking_link_id uuid not null references tracking_links(id) on delete cascade,
  created_at       timestamptz not null default now(),
  visitor_hash     text,          -- sha256(ip + ua + salt); the IP itself is not stored
  referrer         text,
  user_agent       text,
  is_bot           boolean not null default false,
  lang             text
);
create index link_clicks_link_idx on link_clicks (tracking_link_id, created_at);

-- ── guest_bookings: a follower booked through the link ────────────────────
create table guest_bookings (
  id               uuid primary key default gen_random_uuid(),
  tracking_link_id uuid not null references tracking_links(id) on delete restrict,
  guest_name       text not null check (length(trim(guest_name)) > 0),
  phone            text not null,
  booking_date     date not null,
  booking_time     time not null,
  party_size       int not null check (party_size between 1 and 30),
  comment          text,
  consent          boolean not null check (consent),
  consent_at       timestamptz not null default now(),
  status           text not null default 'new' check (status in ('new','arrived','no_show','cancelled')),
  visitor_hash     text,
  lang             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index guest_bookings_link_idx on guest_bookings (tracking_link_id);
create index guest_bookings_date_idx on guest_bookings (booking_date, booking_time);
create trigger guest_bookings_updated_at before update on guest_bookings
  for each row execute function set_updated_at();

-- ── guest_visits: paying guests who actually came ─────────────────────────
create table guest_visits (
  id               uuid primary key default gen_random_uuid(),
  tracking_link_id uuid not null references tracking_links(id) on delete restrict,
  booking_id       uuid unique references guest_bookings(id) on delete cascade,
  source           text not null check (source in ('booking','phrase')),
  visit_date       date not null,
  guests_count     int not null check (guests_count between 1 and 50),
  check_amount     int not null check (check_amount >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint guest_visits_booking_source check ((source = 'booking') = (booking_id is not null))
);
create index guest_visits_link_idx on guest_visits (tracking_link_id, visit_date);
create trigger guest_visits_updated_at before update on guest_visits
  for each row execute function set_updated_at();

-- ── pair_stats: the pilot dashboard, one row per member × venue ───────────
create view pair_stats with (security_invoker = true) as
select
  tl.id                                   as tracking_link_id,
  tl.active,
  m.id as member_id, m.name as member_name, m.slug as member_slug, m.instagram as member_instagram,
  v.id as venue_id,  v.name as venue_name,  v.slug as venue_slug,
  coalesce(mv.visits, 0)::int             as member_visits,
  coalesce(cp.views, 0)::int              as views,
  coalesce(lc.clicks, 0)::int             as clicks,
  coalesce(lc.unique_clicks, 0)::int      as unique_clicks,
  coalesce(gb.bookings, 0)::int           as bookings,
  coalesce(gv.guests, 0)::int             as guests,
  coalesce(gv.guests_booking, 0)::int     as guests_booking,
  coalesce(gv.guests_phrase, 0)::int      as guests_phrase,
  coalesce(gv.revenue, 0)::bigint         as revenue,
  case when coalesce(mv.visits, 0) > 0
       then round(coalesce(gv.guests, 0)::numeric / mv.visits, 2) end          as guests_per_visit,
  case when coalesce(cp.views, 0) > 0
       then round(100 * coalesce(gv.guests, 0)::numeric / cp.views, 2) end     as view_to_guest_pct,
  tl.created_at
from tracking_links tl
join members m on m.id = tl.member_id
join venues  v on v.id = tl.venue_id
left join (select tracking_link_id, count(*) as visits
             from member_visits group by 1) mv on mv.tracking_link_id = tl.id
left join (select mv.tracking_link_id, sum(cp.views) as views
             from content_proofs cp join member_visits mv on mv.id = cp.member_visit_id
            group by 1) cp on cp.tracking_link_id = tl.id
left join (select tracking_link_id, count(*) as clicks, count(distinct visitor_hash) as unique_clicks
             from link_clicks where not is_bot group by 1) lc on lc.tracking_link_id = tl.id
left join (select tracking_link_id, count(*) as bookings
             from guest_bookings where status <> 'cancelled' group by 1) gb on gb.tracking_link_id = tl.id
left join (select tracking_link_id,
                  sum(guests_count) as guests,
                  sum(guests_count) filter (where source = 'booking') as guests_booking,
                  sum(guests_count) filter (where source = 'phrase')  as guests_phrase,
                  sum(check_amount) as revenue
             from guest_visits group by 1) gv on gv.tracking_link_id = tl.id;

-- ── RLS: closed to the public API ─────────────────────────────────────────
alter table applications   enable row level security;
alter table members        enable row level security;
alter table venues         enable row level security;
alter table offers         enable row level security;
alter table tracking_links enable row level security;
alter table member_visits  enable row level security;
alter table content_proofs enable row level security;
alter table link_clicks    enable row level security;
alter table guest_bookings enable row level security;
alter table guest_visits   enable row level security;
