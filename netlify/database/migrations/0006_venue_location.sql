-- A venue's point on the city map (12 Nov 2026, owner: «добавить карту
-- Алматы и Астаны по местам»). Latitude and longitude in degrees (WGS 84,
-- as 2GIS and Google Maps copy them); both or neither. The city stays the
-- text column from 0001 («Алматы» / «Астана»).
alter table venues
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lng double precision check (lng is null or lng between -180 and 180);
alter table venues add constraint venues_point_pair check ((lat is null) = (lng is null));

-- The demo venues of 0005 at their addresses (no-op where they are gone).
update venues set lat = 43.2329, lng = 76.9563 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; -- пр. Достык, 136
update venues set lat = 43.2185, lng = 76.9283 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; -- пр. Аль-Фараби, 77/8
update venues set lat = 43.2532, lng = 76.9478 where id = 'cccccccc-0003-4ccc-8ccc-000000000003'; -- ул. Кабанбай батыра, 83
update venues set lat = 43.2617, lng = 76.9429 where id = 'cccccccc-0004-4ccc-8ccc-000000000004'; -- ул. Жибек Жолы, 50
update venues set lat = 43.2268, lng = 76.9512 where id = 'cccccccc-0005-4ccc-8ccc-000000000005'; -- ул. Фурманова, 240
update venues set lat = 43.2407, lng = 76.9318 where id = 'cccccccc-0006-4ccc-8ccc-000000000006'; -- пр. Абая, 52
