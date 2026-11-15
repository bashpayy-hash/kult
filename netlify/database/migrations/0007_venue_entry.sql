-- Entering a venue (15 Nov 2026, owner: «Ты туда нажимаешь, ты туда
-- заходишь. Виден экстерьер, виден интерьер, виден зал. Там можно увидеть,
-- где именно забронить. Какой столик вам понравится у окна, у каунтера»).
--
--  • venue_photos: the venue's own pictures in the order a guest walks in —
--    the street front (exterior), the room (interior), a hall (hall, tied to
--    a hall of the plan when there are several). Real photos for real venues;
--    the fictional demo venues of 0005 get illustrative ones below.
--  • venue_tables.zone: where a table stands, so a guest can ask for a place
--    by the window or at the bar and see those tables on the plan.

create table venue_photos (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  kind       text not null check (kind in ('exterior', 'interior', 'hall')),
  hall_id    uuid references venue_halls(id) on delete set null,
  -- An upload key in the venue-photos bucket, or a site path ("/venues/…") for demo pictures.
  path       text not null check (length(path) between 1 and 300),
  caption    text check (caption is null or length(caption) <= 140),
  caption_kk text check (caption_kk is null or length(caption_kk) <= 140),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index venue_photos_venue_idx on venue_photos (venue_id, kind, sort);
alter table venue_photos enable row level security;

alter table venue_tables
  add column zone text check (zone is null or zone in ('window', 'bar', 'kitchen', 'terrace', 'sofa', 'quiet', 'private'));

-- Demo venues (no-op where they are gone): zones on their tables …
update venue_tables set zone = 'terrace' where hall_id = 'ba000000-0000-4000-8000-000000000001' and kind = 'table';
update venue_tables set zone = 'bar'     where id in ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000012');
update venue_tables set zone = 'sofa'    where id = 'b0000000-0000-4000-8000-000000000014';
update venue_tables set zone = 'window'  where id in ('b0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000033');
update venue_tables set zone = 'kitchen' where id in ('b0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000035');
update venue_tables set zone = 'window'  where id in ('b0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000042');
update venue_tables set zone = 'bar'     where id in ('b0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000045');
update venue_tables set zone = 'sofa'    where id = 'b0000000-0000-4000-8000-000000000043';

-- … and their pictures, served from public/venues/<slug>/.
insert into venue_photos (venue_id, kind, hall_id, path, caption, caption_kk, sort)
select v.id, p.kind, p.hall_id::uuid, p.path, p.caption, p.caption_kk, p.sort
from (values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'exterior', null, '/venues/nomad-bar/exterior.webp', 'Вход с Достык, лифт на крышу', 'Достық жақтан кіреберіс, шатырға лифт', 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'interior', null, '/venues/nomad-bar/interior.webp', 'Бар и зал', 'Бар мен зал', 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hall', 'ba000000-0000-4000-8000-000000000001', '/venues/nomad-bar/hall.webp', 'Терраса с видом на горы', 'Тауға қарайтын терраса', 0),
  ('cccccccc-0003-4ccc-8ccc-000000000003', 'exterior', null, '/venues/sora-bistro/exterior.webp', 'Вход с Кабанбай батыра', 'Қабанбай батыр жақтан кіреберіс', 0),
  ('cccccccc-0003-4ccc-8ccc-000000000003', 'interior', null, '/venues/sora-bistro/interior.webp', 'Открытая кухня', 'Ашық асүй', 0),
  ('cccccccc-0003-4ccc-8ccc-000000000003', 'hall', 'ba000000-0000-4000-8000-000000000004', '/venues/sora-bistro/hall.webp', 'Столы у окон', 'Терезе жанындағы үстелдер', 0),
  ('cccccccc-0004-4ccc-8ccc-000000000004', 'exterior', null, '/venues/mono-coffee/exterior.webp', 'Угол у парка на Жибек Жолы', 'Жібек Жолындағы саябақ бұрышы', 0),
  ('cccccccc-0004-4ccc-8ccc-000000000004', 'interior', null, '/venues/mono-coffee/interior.webp', 'Стойка и витрина с выпечкой', 'Бар және тоқаш витринасы', 0),
  ('cccccccc-0004-4ccc-8ccc-000000000004', 'hall', 'ba000000-0000-4000-8000-000000000005', '/venues/mono-coffee/hall.webp', 'Столы у окна', 'Терезе жанындағы үстелдер', 0)
) as p (venue_id, kind, hall_id, path, caption, caption_kk, sort)
join venues v on v.id = p.venue_id::uuid
where p.hall_id is null or exists (select 1 from venue_halls h where h.id = p.hall_id::uuid);
